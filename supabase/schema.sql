-- =============================================================================
-- Sistem Administrasi Guru Terpadu - Skema Multi-Guru Supabase (Tahap 7)
-- =============================================================================
-- Model data:
--   1. Data sekolah (dibagi lintas guru mapel): g_per, g_cls, g_stu -> owner_id NULL
--      - Semua anggota sekolah dapat membaca (SELECT).
--      - Hanya admin sekolah yang dapat menulis/menghapus (INSERT/UPDATE/DELETE).
--   2. Data milik guru (perangkat ajar, bank soal, absensi, nilai, rapor, pengaturan):
--      owner_id = auth.uid()
--      - Hanya guru pemiliknya yang dapat membaca dan menulis.
--   3. Penghapusan memakai tombstone (deleted = true) dan kursor seq monotonik
--      agar perangkat lain mengetahui penghapusan saat pull_records.
-- =============================================================================

create extension if not exists pgcrypto;

-- 1. Tabel Inti ---------------------------------------------------------------

create table if not exists public.schools (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.members (
    school_id uuid not null references public.schools(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    email text not null,
    name text not null default '',
    role text not null check (role in ('admin', 'teacher')),
    created_at timestamptz not null default now(),
    primary key (school_id, user_id),
    unique (user_id)
);

create table if not exists public.invites (
    id uuid primary key default gen_random_uuid(),
    school_id uuid not null references public.schools(id) on delete cascade,
    email text not null,
    role text not null default 'teacher' check (role in ('admin', 'teacher')),
    invited_by uuid references auth.users(id) on delete set null,
    claimed_by uuid references auth.users(id) on delete set null,
    claimed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (school_id, email)
);

create sequence if not exists public.records_seq_seq;

create table if not exists public.records (
    school_id uuid not null references public.schools(id) on delete cascade,
    tbl text not null,
    id text not null,
    owner_id uuid references auth.users(id) on delete cascade,
    owner_key text generated always as (coalesce(owner_id::text, '')) stored,
    data jsonb,
    deleted boolean not null default false,
    client_at timestamptz not null default now(),
    seq bigint not null default nextval('public.records_seq_seq'),
    updated_at timestamptz not null default now(),
    primary key (school_id, tbl, owner_key, id),
    constraint records_owner_scope_chk check (
        (tbl in ('g_per', 'g_cls', 'g_stu') and owner_id is null)
        or (tbl not in ('g_per', 'g_cls', 'g_stu') and owner_id is not null)
    )
);

create index if not exists idx_records_school_seq on public.records (school_id, seq);
create index if not exists idx_records_school_owner on public.records (school_id, owner_id);

create or replace function public.tg_records_bump_seq()
returns trigger
language plpgsql
as $$
begin
    new.seq := nextval('public.records_seq_seq');
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_records_bump_seq on public.records;
create trigger trg_records_bump_seq
before insert or update on public.records
for each row execute function public.tg_records_bump_seq();

create table if not exists public.ai_usage (
    school_id uuid not null references public.schools(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    day date not null default current_date,
    requests integer not null default 0 check (requests >= 0),
    tokens integer not null default 0 check (tokens >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, day)
);

-- 2. Fungsi Pembantu Keanggotaan (untuk RLS) ----------------------------------

create or replace function public.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select school_id from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function public.my_role(p_school uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.members
    where user_id = auth.uid()
      and (p_school is null or school_id = p_school)
    limit 1;
$$;

-- 3. Row Level Security (RLS) -------------------------------------------------

alter table public.schools enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.records enable row level security;
alter table public.ai_usage enable row level security;

-- schools: anggota dapat membaca; admin dapat memperbarui nama sekolah
drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools
    for select to authenticated
    using (id = public.my_school_id());

drop policy if exists schools_update on public.schools;
create policy schools_update on public.schools
    for update to authenticated
    using (id = public.my_school_id() and public.my_role(id) = 'admin')
    with check (id = public.my_school_id() and public.my_role(id) = 'admin');

-- members: semua anggota satu sekolah dapat melihat daftar rekan; hanya admin kelola
drop policy if exists members_select on public.members;
create policy members_select on public.members
    for select to authenticated
    using (school_id = public.my_school_id());

drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members
    for all to authenticated
    using (school_id = public.my_school_id() and public.my_role(school_id) = 'admin')
    with check (school_id = public.my_school_id() and public.my_role(school_id) = 'admin');

-- invites: hanya admin sekolah yang dapat melihat dan mengelola undangan
drop policy if exists invites_admin_all on public.invites;
create policy invites_admin_all on public.invites
    for all to authenticated
    using (school_id = public.my_school_id() and public.my_role(school_id) = 'admin')
    with check (school_id = public.my_school_id() and public.my_role(school_id) = 'admin');

-- records:
--   Baca  : anggota sekolah & (data sekolah owner_id NULL ATAU milik guru sendiri)
--   Tulis : anggota sekolah & ((data sekolah owner_id NULL & admin) ATAU owner_id = auth.uid())
drop policy if exists records_select on public.records;
create policy records_select on public.records
    for select to authenticated
    using (
        school_id = public.my_school_id()
        and (owner_id is null or owner_id = auth.uid())
    );

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
    for insert to authenticated
    with check (
        school_id = public.my_school_id()
        and (
            (owner_id is null and tbl in ('g_per', 'g_cls', 'g_stu') and public.my_role(school_id) = 'admin')
            or (owner_id = auth.uid() and tbl not in ('g_per', 'g_cls', 'g_stu'))
        )
    );

drop policy if exists records_update on public.records;
create policy records_update on public.records
    for update to authenticated
    using (
        school_id = public.my_school_id()
        and (
            (owner_id is null and tbl in ('g_per', 'g_cls', 'g_stu') and public.my_role(school_id) = 'admin')
            or (owner_id = auth.uid() and tbl not in ('g_per', 'g_cls', 'g_stu'))
        )
    )
    with check (
        school_id = public.my_school_id()
        and (
            (owner_id is null and tbl in ('g_per', 'g_cls', 'g_stu') and public.my_role(school_id) = 'admin')
            or (owner_id = auth.uid() and tbl not in ('g_per', 'g_cls', 'g_stu'))
        )
    );

drop policy if exists records_delete on public.records;
create policy records_delete on public.records
    for delete to authenticated
    using (
        school_id = public.my_school_id()
        and (
            (owner_id is null and tbl in ('g_per', 'g_cls', 'g_stu') and public.my_role(school_id) = 'admin')
            or (owner_id = auth.uid() and tbl not in ('g_per', 'g_cls', 'g_stu'))
        )
    );

-- ai_usage: guru melihat pemakaiannya sendiri; admin dapat melihat seluruh sekolah
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
    for select to authenticated
    using (
        user_id = auth.uid()
        or (school_id = public.my_school_id() and public.my_role(school_id) = 'admin')
    );

-- 4. RPC Sinkronisasi, Undangan, dan Kuota AI ---------------------------------

-- claim_invite: mencocokkan email akun Google yang sedang login dengan tabel invites
create or replace function public.claim_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
    v_name text := trim(coalesce(
        auth.jwt() -> 'user_metadata' ->> 'full_name',
        auth.jwt() -> 'user_metadata' ->> 'name',
        split_part(v_email, '@', 1)
    ));
    v_mem record;
    v_inv record;
    v_school_name text;
begin
    if v_uid is null or v_email = '' then
        return jsonb_build_object('ok', false, 'reason', 'UNAUTHENTICATED');
    end if;

    select m.school_id, m.role, m.email, m.name, s.name as school_name
    into v_mem
    from public.members m
    join public.schools s on s.id = m.school_id
    where m.user_id = v_uid
    limit 1;

    if found then
        return jsonb_build_object(
            'ok', true,
            'claimed', false,
            'user_id', v_uid,
            'email', v_mem.email,
            'name', v_mem.name,
            'role', v_mem.role,
            'school_id', v_mem.school_id,
            'school_name', v_mem.school_name
        );
    end if;

    select i.*
    into v_inv
    from public.invites i
    where lower(trim(i.email)) = v_email
      and i.claimed_by is null
    order by i.created_at desc
    limit 1
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'NOT_INVITED', 'email', v_email);
    end if;

    insert into public.members (school_id, user_id, email, name, role)
    values (v_inv.school_id, v_uid, v_email, v_name, v_inv.role)
    on conflict (user_id) do nothing;

    update public.invites
    set claimed_by = v_uid, claimed_at = now()
    where id = v_inv.id;

    select name into v_school_name from public.schools where id = v_inv.school_id;

    return jsonb_build_object(
        'ok', true,
        'claimed', true,
        'user_id', v_uid,
        'email', v_email,
        'name', v_name,
        'role', v_inv.role,
        'school_id', v_inv.school_id,
        'school_name', coalesce(v_school_name, '')
    );
end;
$$;

-- push_records: unggah batch perubahan (LWW berdasar client_at; pelanggaran RLS masuk rejected)
create or replace function public.push_records(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_school uuid := public.my_school_id();
    v_role text := public.my_role(v_school);
    v_item jsonb;
    v_tbl text;
    v_id text;
    v_shared boolean;
    v_owner uuid;
    v_deleted boolean;
    v_client_at timestamptz;
    v_data jsonb;
    v_seq bigint;
    v_max_seq bigint := 0;
    v_accepted jsonb := '[]'::jsonb;
    v_rejected jsonb := '[]'::jsonb;
    v_allowed constant text[] := array[
        'g_per','g_cls','g_stu','g_mtg','g_att','g_ass','g_scr','g_fol',
        'g_cp','g_tp','g_mat','g_qst','g_pkg','g_rdesc','g_sch','g_jour',
        'g_p5_proj','g_assign','g_submit','g_guardians','g_communications',
        'g_docs','g_dt','g_dts','g_set'
    ];
begin
    if v_uid is null or v_school is null then
        raise exception 'NOT_MEMBER' using errcode = '42501';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        return jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected, 'max_seq', 0);
    end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_tbl := coalesce(v_item ->> 'tbl', '');
        v_id := coalesce(v_item ->> 'id', '');
        if v_tbl = '' or v_id = '' or not (v_tbl = any(v_allowed)) then
            v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'reason', 'INVALID_TABLE_OR_ID'));
            continue;
        end if;

        v_shared := v_tbl in ('g_per', 'g_cls', 'g_stu');
        if v_shared and v_role <> 'admin' then
            v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'reason', 'RLS_FORBIDDEN'));
            continue;
        end if;

        begin
            if v_shared then
                v_owner := null;
            elsif (v_item ->> 'owner_id') is not null and (v_item ->> 'owner_id') <> '' then
                v_owner := (v_item ->> 'owner_id')::uuid;
            else
                v_owner := v_uid;
            end if;

            if not v_shared and v_owner <> v_uid then
                v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'reason', 'RLS_FORBIDDEN'));
                continue;
            end if;

            v_deleted := coalesce((v_item ->> 'deleted')::boolean, false);
            v_client_at := coalesce((v_item ->> 'client_at')::timestamptz, now());
            v_data := case when v_deleted then null else coalesce(v_item -> 'data', '{}'::jsonb) end;

            insert into public.records as r (school_id, tbl, id, owner_id, data, deleted, client_at)
            values (v_school, v_tbl, v_id, v_owner, v_data, v_deleted, v_client_at)
            on conflict (school_id, tbl, owner_key, id) do update
                set data = excluded.data,
                    deleted = excluded.deleted,
                    client_at = excluded.client_at
                where r.client_at <= excluded.client_at
            returning seq into v_seq;

            if v_seq is null then
                select r.seq into v_seq
                from public.records r
                where r.school_id = v_school
                  and r.tbl = v_tbl
                  and r.owner_key = coalesce(v_owner::text, '')
                  and r.id = v_id;
            end if;

            if v_seq is not null and v_seq > v_max_seq then
                v_max_seq := v_seq;
            end if;
            v_accepted := v_accepted || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'seq', coalesce(v_seq, 0)));
        exception
            when insufficient_privilege or check_violation then
                v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'reason', 'RLS_FORBIDDEN'));
            when others then
                v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('tbl', v_tbl, 'id', v_id, 'reason', 'ERROR'));
        end;
    end loop;

    return jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected, 'max_seq', v_max_seq);
end;
$$;

-- pull_records: tarik berhalaman berdasar kursor seq (RLS otomatis memfilter data sekolah + milik guru)
create or replace function public.pull_records(p_since bigint default 0, p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_lim integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
    v_rows jsonb := '[]'::jsonb;
    v_has_more boolean := false;
    v_last_seq bigint := coalesce(p_since, 0);
begin
    if auth.uid() is null or v_school is null then
        raise exception 'NOT_MEMBER' using errcode = '42501';
    end if;

    with fetched as (
        select tbl, id, owner_id, data, deleted, client_at, seq
        from public.records
        where school_id = v_school
          and seq > coalesce(p_since, 0)
        order by seq asc
        limit v_lim + 1
    ),
    page as (
        select * from fetched order by seq asc limit v_lim
    )
    select
        coalesce(jsonb_agg(jsonb_build_object(
            'tbl', tbl,
            'id', id,
            'owner_id', owner_id,
            'data', data,
            'deleted', deleted,
            'client_at', client_at,
            'seq', seq
        ) order by seq asc), '[]'::jsonb),
        (select count(*) > v_lim from fetched),
        coalesce((select max(seq) from page), coalesce(p_since, 0))
    into v_rows, v_has_more, v_last_seq
    from page;

    return jsonb_build_object('rows', v_rows, 'has_more', v_has_more, 'last_seq', v_last_seq);
end;
$$;

-- get_record: baca satu record (dipakai rekonsiliasi bila diperlukan)
create or replace function public.get_record(p_tbl text, p_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_row record;
begin
    if auth.uid() is null or v_school is null then
        raise exception 'NOT_MEMBER' using errcode = '42501';
    end if;

    select tbl, id, owner_id, data, deleted, client_at, seq
    into v_row
    from public.records
    where school_id = v_school
      and tbl = p_tbl
      and id = p_id
    limit 1;

    if not found then
        return null;
    end if;

    return jsonb_build_object(
        'tbl', v_row.tbl,
        'id', v_row.id,
        'owner_id', v_row.owner_id,
        'data', v_row.data,
        'deleted', v_row.deleted,
        'client_at', v_row.client_at,
        'seq', v_row.seq
    );
end;
$$;

-- ai_bump: pemeriksa keanggotaan + batas harian pemakaian AI per guru (dipanggil dari api/gemini.js)
create or replace function public.ai_bump(p_limit integer default 150, p_tokens integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_school uuid;
    v_lim integer := greatest(coalesce(p_limit, 150), 1);
    v_tok integer := greatest(coalesce(p_tokens, 0), 0);
    v_req integer;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'reason', 'UNAUTHENTICATED');
    end if;

    select school_id into v_school from public.members where user_id = v_uid limit 1;
    if v_school is null then
        return jsonb_build_object('ok', false, 'reason', 'NOT_MEMBER');
    end if;

    insert into public.ai_usage (school_id, user_id, day, requests, tokens)
    values (v_school, v_uid, current_date, 0, 0)
    on conflict (user_id, day) do nothing;

    if v_tok > 0 then
        update public.ai_usage
        set tokens = tokens + v_tok, updated_at = now()
        where user_id = v_uid and day = current_date
        returning requests into v_req;
        return jsonb_build_object('ok', true, 'used', coalesce(v_req, 0), 'limit', v_lim);
    end if;

    update public.ai_usage
    set requests = requests + 1, updated_at = now()
    where user_id = v_uid
      and day = current_date
      and requests < v_lim
    returning requests into v_req;

    if not found then
        select requests into v_req from public.ai_usage where user_id = v_uid and day = current_date;
        return jsonb_build_object('ok', false, 'reason', 'LIMIT', 'used', coalesce(v_req, v_lim), 'limit', v_lim);
    end if;

    return jsonb_build_object('ok', true, 'used', v_req, 'limit', v_lim);
end;
$$;

-- 5. RPC Manajemen Tim Sekolah (khusus Admin) ---------------------------------

create or replace function public.admin_list_team()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_members jsonb;
    v_invites jsonb;
begin
    if v_school is null or public.my_role(v_school) <> 'admin' then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'email', email, 'name', name, 'role', role, 'created_at', created_at
    ) order by role asc, name asc, email asc), '[]'::jsonb)
    into v_members
    from public.members
    where school_id = v_school;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'email', email, 'role', role, 'created_at', created_at
    ) order by created_at desc), '[]'::jsonb)
    into v_invites
    from public.invites
    where school_id = v_school and claimed_by is null;

    return jsonb_build_object('members', v_members, 'invites', v_invites);
end;
$$;

create or replace function public.admin_invite_member(p_email text, p_role text default 'teacher')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_email text := lower(trim(coalesce(p_email, '')));
    v_role text := case when p_role = 'admin' then 'admin' else 'teacher' end;
    v_inv record;
begin
    if v_school is null or public.my_role(v_school) <> 'admin' then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_email = '' or position('@' in v_email) < 2 then
        return jsonb_build_object('ok', false, 'reason', 'INVALID_EMAIL');
    end if;
    if exists (select 1 from public.members where school_id = v_school and lower(email) = v_email) then
        return jsonb_build_object('ok', false, 'reason', 'ALREADY_MEMBER');
    end if;

    insert into public.invites (school_id, email, role, invited_by, claimed_by, claimed_at)
    values (v_school, v_email, v_role, auth.uid(), null, null)
    on conflict (school_id, email) do update
        set role = excluded.role,
            invited_by = auth.uid(),
            claimed_by = null,
            claimed_at = null,
            created_at = now()
    returning id, email, role, created_at into v_inv;

    return jsonb_build_object('ok', true, 'invite', jsonb_build_object(
        'id', v_inv.id, 'email', v_inv.email, 'role', v_inv.role, 'created_at', v_inv.created_at
    ));
end;
$$;

create or replace function public.admin_revoke_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
begin
    if v_school is null or public.my_role(v_school) <> 'admin' then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    delete from public.invites where id = p_invite_id and school_id = v_school and claimed_by is null;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_member_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_role text := case when p_role = 'admin' then 'admin' else 'teacher' end;
    v_admins integer;
begin
    if v_school is null or public.my_role(v_school) <> 'admin' then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_role <> 'admin' then
        select count(*) into v_admins from public.members where school_id = v_school and role = 'admin' and user_id <> p_user_id;
        if v_admins < 1 then
            return jsonb_build_object('ok', false, 'reason', 'LAST_ADMIN');
        end if;
    end if;
    update public.members set role = v_role where school_id = v_school and user_id = p_user_id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_member(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_school uuid := public.my_school_id();
    v_admins integer;
begin
    if v_school is null or public.my_role(v_school) <> 'admin' then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p_user_id = auth.uid() then
        return jsonb_build_object('ok', false, 'reason', 'CANNOT_REMOVE_SELF');
    end if;
    select count(*) into v_admins from public.members where school_id = v_school and role = 'admin' and user_id <> p_user_id;
    if v_admins < 1 then
        return jsonb_build_object('ok', false, 'reason', 'LAST_ADMIN');
    end if;
    delete from public.members where school_id = v_school and user_id = p_user_id;
    return jsonb_build_object('ok', true);
end;
$$;

-- Hak eksekusi RPC hanya untuk pengguna terautentikasi
revoke all on function public.claim_invite() from public, anon;
revoke all on function public.push_records(jsonb) from public, anon;
revoke all on function public.pull_records(bigint, integer) from public, anon;
revoke all on function public.get_record(text, text) from public, anon;
revoke all on function public.ai_bump(integer, integer) from public, anon;
revoke all on function public.admin_list_team() from public, anon;
revoke all on function public.admin_invite_member(text, text) from public, anon;
revoke all on function public.admin_revoke_invite(uuid) from public, anon;
revoke all on function public.admin_set_member_role(uuid, text) from public, anon;
revoke all on function public.admin_remove_member(uuid) from public, anon;

grant execute on function public.claim_invite() to authenticated;
grant execute on function public.push_records(jsonb) to authenticated;
grant execute on function public.pull_records(bigint, integer) to authenticated;
grant execute on function public.get_record(text, text) to authenticated;
grant execute on function public.ai_bump(integer, integer) to authenticated;
grant execute on function public.admin_list_team() to authenticated;
grant execute on function public.admin_invite_member(text, text) to authenticated;
grant execute on function public.admin_revoke_invite(uuid) to authenticated;
grant execute on function public.admin_set_member_role(uuid, text) to authenticated;
grant execute on function public.admin_remove_member(uuid) to authenticated;
