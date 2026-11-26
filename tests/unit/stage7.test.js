const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Store = require('../../js/core/store.js');
const SyncDomain = require('../../js/domain/sync.js');
const Sync = require('../../js/core/sync.js');
const RemoteSupabase = require('../../js/core/remote-supabase.js');
const AIService = require('../../js/ai/aiService.js');
const geminiApi = require('../../api/gemini.js');

// ---------- 1. Skema SQL + RLS ----------

test('schema.sql: tabel inti, RLS aktif, trigger seq pada insert/update, dan seluruh RPC tersedia', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/schema.sql'), 'utf8');
    for (const tbl of ['schools', 'members', 'invites', 'records', 'ai_usage']) {
        assert.match(sql, new RegExp(`create table if not exists public\\.${tbl}\\b`, 'i'), `tabel ${tbl}`);
        assert.match(sql, new RegExp(`alter table public\\.${tbl} enable row level security`, 'i'), `RLS ${tbl}`);
    }
    assert.match(sql, /before insert or update on public\.records/i);
    for (const rpc of ['claim_invite', 'push_records', 'pull_records', 'get_record', 'ai_bump', 'admin_list_team', 'admin_invite_member', 'admin_revoke_invite', 'admin_set_member_role', 'admin_remove_member']) {
        assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`, 'i'), `RPC ${rpc}`);
    }
});

// ---------- 2. SyncDomain (logika murni) ----------

test('SyncDomain: pembagian tabel sekolah vs tabel guru dan hak tulis berdasarkan peran', () => {
    assert.equal(SyncDomain.isSharedTable('g_stu'), true);
    assert.equal(SyncDomain.isSharedTable('g_cls'), true);
    assert.equal(SyncDomain.isSharedTable('g_per'), true);
    assert.equal(SyncDomain.isSharedTable('g_scr'), false);
    assert.equal(SyncDomain.isSharedTable('g_set'), false);

    assert.equal(SyncDomain.canWriteTable('g_stu', 'admin'), true);
    assert.equal(SyncDomain.canWriteTable('g_stu', 'teacher'), false);
    assert.equal(SyncDomain.canWriteTable('g_scr', 'teacher'), true);
    assert.equal(SyncDomain.canWriteTable('g_scr', 'admin'), true);
    assert.equal(SyncDomain.canWriteTable('g_unknown', 'admin'), false);

    assert.equal(SyncDomain.ownerForTable('g_stu', 'u-1'), null);
    assert.equal(SyncDomain.ownerForTable('g_scr', 'u-1'), 'u-1');
});

test('SyncDomain: recordId menangani semua jenis kunci unik tabel', () => {
    assert.equal(SyncDomain.recordId({ id: 'STU-1' }, 'g_stu'), 'STU-1');
    assert.equal(SyncDomain.recordId({ classId: 'CLS-1' }, 'g_cls'), 'CLS-1');
    assert.equal(SyncDomain.recordId({ cpId: 'CP-1' }, 'g_cp'), 'CP-1');
    assert.equal(SyncDomain.recordId({ tpId: 'TP-1' }, 'g_tp'), 'TP-1');
    assert.equal(SyncDomain.recordId({ testId: 'DT-1', studentId: 'STU-1' }, 'g_dts'), 'DT-1|STU-1');
    assert.equal(SyncDomain.recordId({ school: 'SMP 1' }, 'g_set'), 'settings');
});

test('SyncDomain: coalesceQueue menggabungkan edit berulang pada record yang sama termasuk tombstone', () => {
    const q1 = SyncDomain.coalesceQueue([], [
        { tbl: 'g_scr', id: 'S1', ownerId: 'u1', record: { id: 'S1', score: 70 }, deleted: false, clientAt: '2026-11-26T01:00:00Z' },
        { tbl: 'g_scr', id: 'S2', ownerId: 'u1', record: { id: 'S2', score: 80 }, deleted: false, clientAt: '2026-11-26T01:00:01Z' }
    ]);
    assert.equal(q1.length, 2);
    const q2 = SyncDomain.coalesceQueue(q1, [
        { tbl: 'g_scr', id: 'S1', ownerId: 'u1', record: { id: 'S1', score: 95 }, deleted: false, clientAt: '2026-11-26T01:02:00Z' },
        { tbl: 'g_scr', id: 'S2', ownerId: 'u1', record: null, deleted: true, clientAt: '2026-11-26T01:03:00Z' }
    ]);
    assert.equal(q2.length, 2);
    assert.equal(q2[0].data.score, 95);
    assert.equal(q2[1].deleted, true);
    assert.equal(q2[1].data, null);
});

test('SyncDomain: applyPullToList menghormati pending lokal, menerapkan update dan tombstone', () => {
    const local = [
        { id: 'STU-1', name: 'Lokal Edit Pending', updatedAt: '2026-11-26T02:00:00Z', ownerId: null },
        { id: 'STU-2', name: 'Akan Dihapus Server', updatedAt: '2026-11-26T01:00:00Z', ownerId: null },
        { id: 'STU-3', name: 'Lama', updatedAt: '2026-11-26T01:00:00Z', ownerId: null }
    ];
    const remote = [
        { tbl: 'g_stu', id: 'STU-1', owner_id: null, data: { id: 'STU-1', name: 'Versi Server' }, deleted: false, client_at: '2026-11-26T01:30:00Z', seq: 11 },
        { tbl: 'g_stu', id: 'STU-2', owner_id: null, data: null, deleted: true, client_at: '2026-11-26T01:40:00Z', seq: 12 },
        { tbl: 'g_stu', id: 'STU-3', owner_id: null, data: { id: 'STU-3', name: 'Baru Server' }, deleted: false, client_at: '2026-11-26T01:50:00Z', seq: 13 },
        { tbl: 'g_stu', id: 'STU-4', owner_id: null, data: { id: 'STU-4', name: 'Siswa Tambahan' }, deleted: false, client_at: '2026-11-26T01:55:00Z', seq: 14 }
    ];
    const res = SyncDomain.applyPullToList(local, remote, new Set(['STU-1']), 'g_stu');
    assert.equal(res.changed, true);
    assert.deepEqual(res.list.map(x => x.id), ['STU-1', 'STU-3', 'STU-4']);
    assert.equal(res.list.find(x => x.id === 'STU-1').name, 'Lokal Edit Pending');
    assert.equal(res.list.find(x => x.id === 'STU-3').name, 'Baru Server');
});

test('SyncDomain: buildInitialChanges membedakan admin (semua tabel) vs guru (hanya milik guru)', () => {
    const snap = {
        g_stu: [{ id: 'STU-1', name: 'Ahmad' }],
        g_cls: [{ classId: 'CLS-1', className: 'VII.1' }],
        g_per: [{ id: 'PER-1', year: '2026/2027' }],
        g_scr: [{ id: 'SCR-1', score: 90 }],
        g_set: { subject: 'IPA', teacher: 'Pak Budi' }
    };
    const asAdmin = SyncDomain.buildInitialChanges(snap, { userId: 'u-admin', role: 'admin', now: '2026-11-26T00:00:00Z' });
    assert.equal(asAdmin.length, 5);
    assert.equal(asAdmin.find(x => x.tbl === 'g_stu').owner_id, null);
    assert.equal(asAdmin.find(x => x.tbl === 'g_scr').owner_id, 'u-admin');

    const asTeacher = SyncDomain.buildInitialChanges(snap, { userId: 'u-guru', role: 'teacher', now: '2026-11-26T00:00:00Z' });
    assert.equal(asTeacher.length, 2);
    assert.deepEqual(asTeacher.map(x => x.tbl).sort(), ['g_scr', 'g_set']);
    assert.ok(asTeacher.every(x => x.owner_id === 'u-guru'));
});

test('SyncDomain: pullFromCursor memakai tumpang tindih 50 dan tidak pernah negatif', () => {
    assert.equal(SyncDomain.pullFromCursor(0), 0);
    assert.equal(SyncDomain.pullFromCursor(30), 0);
    assert.equal(SyncDomain.pullFromCursor(120), 70);
    assert.equal(SyncDomain.backoffDelay(0), 1000);
    assert.equal(SyncDomain.backoffDelay(99), 60000);
});

// ---------- 3. Store: onChange, silent/keepStamps, metaGet/Set, wipe ----------

test('Store: onChange menangkap tambah, ubah, hapus tombstone; silent dan keepStamps mencegah gema', async () => {
    await Store.init({ mode: 'local' });
    await Store.wipe();
    Store.setOwnerResolver(tbl => (tbl === 'g_stu' ? null : 'u-guru-1'));

    const events = [];
    const unsub = Store.onChange(ch => events.push(...ch));

    Store.write('g_scr', [
        { id: 'SCR-1', score: 80 },
        { id: 'SCR-2', score: 75 }
    ]);
    assert.equal(events.length, 2);
    assert.equal(events[0].ownerId, 'u-guru-1');
    assert.equal(events[0].deleted, false);

    events.length = 0;
    const saved = Store.read('g_scr', []);
    saved[0].score = 88; // ubah SCR-1 saja
    Store.write('g_scr', [saved[0]]); // hapus SCR-2 sekaligus
    assert.equal(events.length, 2);
    assert.equal(events.find(e => e.id === 'SCR-1').deleted, false);
    assert.equal(events.find(e => e.id === 'SCR-1').record.score, 88);
    assert.equal(events.find(e => e.id === 'SCR-2').deleted, true);

    // silent + keepStamps: tidak memicu onChange dan tidak mengubah updatedAt
    events.length = 0;
    const fixedTs = '2025-01-02T03:04:05.000Z';
    Store.write('g_scr', [{ id: 'SCR-9', score: 100, createdAt: fixedTs, updatedAt: fixedTs, ownerId: 'u-guru-1' }], { silent: true, keepStamps: true });
    assert.equal(events.length, 0);
    const readBack = Store.read('g_scr', []);
    assert.equal(readBack[0].updatedAt, fixedTs);

    // Tulis ulang tanpa perubahan sesudah keepStamps tidak boleh mengubah updatedAt maupun memicu onChange
    Store.write('g_scr', readBack);
    assert.equal(events.length, 0);
    assert.equal(Store.read('g_scr', [])[0].updatedAt, fixedTs);

    Store.metaSet('sync_cursor', 42);
    assert.equal(Store.metaGet('sync_cursor', 0), 42);
    await Store.wipe();
    assert.equal(Store.metaGet('sync_cursor', 0), 0);
    assert.deepEqual(Store.read('g_scr', []), []);

    unsub();
    Store.setOwnerResolver(null);
});

// ---------- 4. Mesin Sync (antrean, tarik berhalaman, retry, tanpa gema) ----------

test('Sync: dorong perubahan lokal, abaikan tabel sekolah bagi guru biasa, tarik berhalaman tanpa gema', async () => {
    await Store.init({ mode: 'local' });
    await Store.wipe();

    const pushedBatches = [];
    const pullCalls = [];
    const remotePages = [
        {
            rows: [
                { tbl: 'g_stu', id: 'STU-1', owner_id: null, data: { id: 'STU-1', name: 'Ahmad' }, deleted: false, client_at: '2026-11-26T01:00:00Z', seq: 10 },
                { tbl: 'g_stu', id: 'STU-2', owner_id: null, data: { id: 'STU-2', name: 'Siti' }, deleted: false, client_at: '2026-11-26T01:00:01Z', seq: 60 }
            ],
            has_more: true,
            last_seq: 60
        },
        {
            rows: [
                { tbl: 'g_qst', id: 'Q-1', owner_id: 'u-t1', data: { id: 'Q-1', code: 'PG-1', text: 'Soal?' }, deleted: false, client_at: '2026-11-26T01:05:00Z', seq: 105 }
            ],
            has_more: false,
            last_seq: 105
        }
    ];
    let pullIdx = 0;
    const fakeRemote = {
        push: async items => {
            pushedBatches.push(items);
            return { accepted: items.map((x, i) => ({ tbl: x.tbl, id: x.id, seq: 200 + i })), rejected: [], max_seq: 205 };
        },
        pull: async (since, limit) => {
            pullCalls.push({ since, limit });
            return remotePages[Math.min(pullIdx++, remotePages.length - 1)];
        }
    };

    const applied = [];
    Sync.use({ store: Store, online: () => true });
    Sync.start({ remote: fakeRemote, userId: 'u-t1', role: 'teacher', pollMs: 0, immediate: false, onRemoteApplied: t => applied.push(...t) });

    // Guru biasa mencoba menulis g_stu (harus diabaikan oleh Sync) dan g_scr (harus masuk antrean)
    Store.write('g_stu', [{ id: 'STU-LOKAL', name: 'Tidak Boleh Terkirim' }]);
    Store.write('g_scr', [{ id: 'SCR-1', score: 92 }]);
    assert.equal(Sync.getQueue().length, 1);
    assert.equal(Sync.getQueue()[0].tbl, 'g_scr');

    await Sync.syncNow();
    assert.equal(pushedBatches.length, 1);
    assert.equal(pushedBatches[0][0].id, 'SCR-1');
    assert.equal(Sync.getQueue().length, 0); // tidak ada gema dari hasil pull!
    assert.equal(pullCalls.length, 2);
    assert.equal(pullCalls[0].since, 0);
    assert.equal(pullCalls[1].since, 60);
    assert.equal(Sync.status().cursor, 105);
    assert.ok(applied.includes('g_stu') && applied.includes('g_qst'));
    assert.equal(Store.read('g_qst', [])[0].code, 'PG-1');

    // Tarik berikutnya memakai kursor dikurangi overlap 50 (105 - 50 = 55)
    remotePages.push({ rows: [], has_more: false, last_seq: 105 });
    pullIdx = 2;
    await Sync.pullAll();
    assert.equal(pullCalls[2].since, 55);

    Sync.resetState();
    await Store.wipe();
});

test('Sync: kegagalan jaringan mempertahankan antrean untuk dicoba ulang, dan pelanggaran RLS dikeluarkan ke rejected', async () => {
    await Store.init({ mode: 'local' });
    await Store.wipe();

    let shouldFail = true;
    const fakeRemote = {
        push: async items => {
            if (shouldFail) throw new Error('Jaringan terputus');
            return {
                accepted: items.filter(x => x.id !== 'BAD').map(x => ({ tbl: x.tbl, id: x.id, seq: 1 })),
                rejected: items.filter(x => x.id === 'BAD').map(x => ({ tbl: x.tbl, id: x.id, reason: 'RLS_FORBIDDEN' })),
                max_seq: 1
            };
        },
        pull: async () => ({ rows: [], has_more: false, last_seq: 1 })
    };

    Sync.use({ store: Store, online: () => true });
    Sync.start({ remote: fakeRemote, userId: 'u-t1', role: 'teacher', pollMs: 0, immediate: false });
    Store.write('g_scr', [{ id: 'OK-1', score: 85 }, { id: 'BAD', score: 50 }]);

    const stErr = await Sync.syncNow();
    assert.equal(stErr.state, 'error');
    assert.equal(stErr.pending, 2); // Antrean tetap utuh saat gagal jaringan

    shouldFail = false;
    const drain = await Sync.waitUntilDrained(3000);
    assert.equal(drain.drained, true);
    assert.equal(Sync.status().rejected.length, 1);
    assert.equal(Sync.status().rejected[0].id, 'BAD');

    Sync.resetState();
    await Store.wipe();
});

// ---------- 5. Fungsi Serverless Vercel api/gemini.js ----------

function mockReqRes(method, body, headers = {}) {
    const req = { method, body, headers };
    const out = { statusCode: 0, headers: {}, body: null };
    const res = {
        set statusCode(c) { out.statusCode = c; },
        get statusCode() { return out.statusCode; },
        setHeader(k, v) { out.headers[k] = v; },
        end(txt) { out.body = JSON.parse(txt); }
    };
    return { req, res, out };
}

test('api/gemini: verifikasi env, JWT, keanggotaan, kuota harian ai_bump, dan keamanan header key Gemini', async () => {
    const env = {
        GEMINI_API_KEY: 'SECRET-VERCEL-GEMINI-KEY',
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_ANON_KEY: 'sb-anon-key',
        AI_DAILY_LIMIT: '2'
    };
    const calls = [];
    let usedCount = 0;
    let isMember = true;

    const handler = geminiApi.createHandler({
        env,
        fetch: async (url, opt = {}) => {
            calls.push({ url, opt });
            if (url.endsWith('/auth/v1/user')) {
                const auth = (opt.headers && opt.headers.Authorization) || '';
                if (auth === 'Bearer valid-jwt') return { status: 200, json: async () => ({ id: 'u-1', email: 'guru@sekolah.id' }) };
                return { status: 401, json: async () => ({ error: 'invalid token' }) };
            }
            if (url.includes('/rest/v1/members')) {
                return { status: 200, json: async () => (isMember ? [{ role: 'teacher', school_id: 's-1' }] : []) };
            }
            if (url.endsWith('/rest/v1/rpc/ai_bump')) {
                const p = JSON.parse(opt.body);
                if (!isMember) return { status: 200, json: async () => ({ ok: false, reason: 'NOT_MEMBER' }) };
                if (p.p_tokens > 0) return { status: 200, json: async () => ({ ok: true, used: usedCount, limit: p.p_limit }) };
                if (usedCount >= p.p_limit) return { status: 200, json: async () => ({ ok: false, reason: 'LIMIT', used: usedCount, limit: p.p_limit }) };
                usedCount++;
                return { status: 200, json: async () => ({ ok: true, used: usedCount, limit: p.p_limit }) };
            }
            if (url.includes(':generateContent')) {
                return {
                    status: 200,
                    json: async () => ({
                        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
                        usageMetadata: { totalTokenCount: 33 }
                    })
                };
            }
            if (url.includes('/v1beta/models?pageSize=200')) {
                return { status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.6-flash' }] }) };
            }
            throw new Error('URL tidak terduga: ' + url);
        }
    });

    // GET status aman
    {
        const { req, res, out } = mockReqRes('GET');
        await handler(req, res);
        assert.deepEqual(out.body, { ok: true, service: 'gemini-cloud' });
        assert.ok(!JSON.stringify(out.body).includes('SECRET-VERCEL-GEMINI-KEY'));
    }

    // Tanpa token / token salah -> AUTH
    {
        const { req, res, out } = mockReqRes('POST', { op: 'ping' }, {});
        await handler(req, res);
        assert.deepEqual(out.body, { cloudError: 'AUTH' });
    }
    {
        const { req, res, out } = mockReqRes('POST', { op: 'ping' }, { authorization: 'Bearer salah' });
        await handler(req, res);
        assert.deepEqual(out.body, { cloudError: 'AUTH' });
    }

    // Ping dan daftar model tidak memotong kuota harian
    {
        const { req, res, out } = mockReqRes('POST', { op: 'ping' }, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.deepEqual(out.body, { ok: true, status: 200, ping: true });
        assert.equal(usedCount, 0);
    }
    {
        const { req, res, out } = mockReqRes('POST', { op: 'models', pageToken: 'Abc_1' }, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.equal(out.body.ok, true);
        assert.equal(usedCount, 0);
    }

    // Model jahat ditolak
    {
        const { req, res, out } = mockReqRes('POST', { model: '../evil', request: {} }, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.deepEqual(out.body, { cloudError: 'BAD_MODEL' });
    }

    // Dua permintaan sah lolos, permintaan ke-3 kena LIMIT (AI_DAILY_LIMIT=2)
    const validReq = { model: 'gemini-3.6-flash', request: { contents: [{ parts: [{ text: 'Halo' }] }] } };
    for (let i = 0; i < 2; i++) {
        const { req, res, out } = mockReqRes('POST', validReq, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.equal(out.body.ok, true);
        assert.ok(!JSON.stringify(out.body).includes('SECRET-VERCEL-GEMINI-KEY'));
    }
    const gCall = calls.find(c => c.url.includes(':generateContent'));
    assert.equal(gCall.opt.headers['x-goog-api-key'], 'SECRET-VERCEL-GEMINI-KEY');
    assert.ok(!gCall.url.includes('SECRET-VERCEL-GEMINI-KEY'));

    {
        const { req, res, out } = mockReqRes('POST', validReq, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.equal(out.body.cloudError, 'LIMIT');
    }

    // Pengguna bukan anggota sekolah -> AUTH
    isMember = false;
    {
        const { req, res, out } = mockReqRes('POST', { op: 'ping' }, { authorization: 'Bearer valid-jwt' });
        await handler(req, res);
        assert.deepEqual(out.body, { cloudError: 'AUTH' });
    }

    // Env belum lengkap -> CONFIG
    const broken = geminiApi.createHandler({ env: { GEMINI_API_KEY: '' }, fetch: async () => ({}) });
    {
        const { req, res, out } = mockReqRes('POST', { op: 'ping' }, { authorization: 'Bearer valid-jwt' });
        await broken(req, res);
        assert.deepEqual(out.body, { cloudError: 'CONFIG' });
    }

    // Tidak ada console.log/Logger di api/gemini.js
    const src = fs.readFileSync(path.join(__dirname, '../../api/gemini.js'), 'utf8');
    assert.ok(!/console\.(log|info|debug|warn|error)/.test(src));
});

// ---------- 6. AIService mode cloud ----------

test('AIService mode cloud: status siap tanpa secret lokal, kirim Bearer JWT, petakan CLOUD_AUTH/LIMIT/CONFIG, dan ping 2 tahap', async () => {
    const sent = [];
    let nextReply = () => ({ status: 200, json: async () => ({ ok: true, status: 200, data: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { totalTokenCount: 12 } } }) });

    AIService.use({
        online: () => true,
        sleep: async () => {},
        config: () => ({ enabled: true, model: 'gemini-3.6-flash', privacyAckAt: '2026-11-26T00:00:00Z' }),
        secret: () => '',
        cloud: () => ({ endpoint: '/api/gemini', getToken: async () => 'jwt-123' }),
        fetch: async (url, opt) => {
            sent.push({ url, opt });
            const b = JSON.parse(opt.body);
            if (b.op === 'ping') return { status: 200, json: async () => ({ ok: true, status: 200, ping: true }) };
            if (b.op === 'models') return { status: 200, json: async () => ({ ok: true, status: 200, data: { models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] } }) };
            return nextReply(b);
        }
    });

    try {
        const st = AIService.status();
        assert.equal(st.mode, 'cloud');
        assert.equal(st.configured, true);
        assert.equal(st.ready, true);

        const stages = [];
        const pingRes = await AIService.ping(undefined, s => stages.push(s));
        assert.equal(pingRes.ok, true);
        assert.deepEqual(stages, ['proxy', 'gemini']);
        assert.equal(sent[0].url, '/api/gemini');
        assert.equal(sent[0].opt.headers.Authorization, 'Bearer jwt-123');

        const models = await AIService.listModels();
        assert.equal(models.length, 1);
        assert.equal(models[0].id, 'gemini-3.6-flash');

        for (const [ce, expectedCode] of [['AUTH', 'CLOUD_AUTH'], ['LIMIT', 'CLOUD_LIMIT'], ['CONFIG', 'CLOUD_CONFIG']]) {
            nextReply = () => ({ status: 200, json: async () => ({ cloudError: ce }) });
            await assert.rejects(() => AIService.generate({ task: 'uji', prompt: 'Tes' }), e => e.code === expectedCode);
        }
    } finally {
        AIService.use({ cloud: () => null });
    }
});

// ---------- 7. Adaptor RemoteSupabase ----------

test('RemoteSupabase.fromClient: memetakan sesi OAuth, RPC sinkronisasi, overlap kursor ±50, dan RPC admin', async () => {
    const rpcCalls = [];
    let shouldErr = false;
    let authListener = null;
    const mockClient = {
        auth: {
            getSession: async () => ({
                data: { session: { access_token: 'tok-abc', user: { id: 'u-9', email: 'siti@sekolah.id', user_metadata: { full_name: 'Ibu Siti' } } } },
                error: null
            }),
            onAuthStateChange: cb => { authListener = cb; return { data: { subscription: { unsubscribe() { authListener = null; } } } }; },
            signInWithOAuth: async opts => ({ data: { url: 'https://accounts.google.com', opts }, error: null }),
            signOut: async () => ({ error: null })
        },
        rpc: async (name, params) => {
            rpcCalls.push({ name, params });
            if (shouldErr) return { data: null, error: { message: 'Ditolak RLS', code: '42501' } };
            return { data: { ok: true, name, params }, error: null };
        }
    };

    const adapter = RemoteSupabase.fromClient(mockClient);
    const sess = await adapter.getSession();
    assert.deepEqual(sess, { accessToken: 'tok-abc', user: { id: 'u-9', email: 'siti@sekolah.id', name: 'Ibu Siti' } });
    assert.equal(await adapter.getAccessToken(), 'tok-abc');

    const events = [];
    const unsub = adapter.onAuthStateChange((ev, s) => events.push({ ev, s }));
    authListener('SIGNED_IN', { access_token: 'tok-2', user: { id: 'u-9', email: 'siti@sekolah.id' } });
    assert.equal(events.length, 1);
    assert.equal(events[0].s.user.name, 'siti');
    unsub();
    assert.equal(authListener, null);

    const oauth = await adapter.signInWithGoogle('https://app.sekolah.id/');
    assert.equal(oauth.opts.provider, 'google');
    assert.equal(oauth.opts.options.redirectTo, 'https://app.sekolah.id/');

    await adapter.claimInvite();
    await adapter.push([{ tbl: 'g_scr', id: 'S1' }]);
    await adapter.pull(120, 300); // tanpa opsi overlap (dipakai halaman lanjutan Sync)
    await adapter.pull(120, 300, { overlap: true }); // dengan overlap ±50 -> p_since = 70
    await adapter.getRecord('g_stu', 'STU-1');
    await adapter.listTeam();
    await adapter.inviteMember(' guru@sekolah.id ', 'teacher');
    await adapter.revokeInvite('inv-1');
    await adapter.setMemberRole('u-2', 'admin');
    await adapter.removeMember('u-2');
    await adapter.signOut();

    assert.equal(rpcCalls.find(c => c.name === 'pull_records' && c.params.p_since === 120).params.p_limit, 300);
    assert.ok(rpcCalls.some(c => c.name === 'pull_records' && c.params.p_since === 70));
    assert.equal(rpcCalls.find(c => c.name === 'admin_invite_member').params.p_email, 'guru@sekolah.id');

    shouldErr = true;
    await assert.rejects(() => adapter.claimInvite(), e => e.code === '42501');
});

