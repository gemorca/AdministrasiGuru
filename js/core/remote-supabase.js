/**
 * Adaptor Supabase untuk autentikasi Google OAuth, klaim undangan, sinkronisasi RPC,
 * dan manajemen tim sekolah.
 *
 * Mendukung dua cara penyediaan:
 *   1. `window.RemoteAdapter` (suntikan tiruan untuk uji browser otomatis tanpa internet).
 *   2. Klien resmi `@supabase/supabase-js` v2 (dimuat dari vendor/supabase.js atau CDN hanya bila
 *      APP_CONFIG.supabaseUrl terisi, sehingga mode lokal tetap 100% bebas jaringan).
 */
const RemoteSupabase = (() => {
    const _Domain = (typeof SyncDomain !== 'undefined') ? SyncDomain : (typeof require === 'function' ? require('../domain/sync.js') : null);
    const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    const SUPABASE_VENDOR = 'vendor/supabase.js';

    function normalizeSession(session) {
        if (!session || !session.user) return null;
        const u = session.user;
        const meta = u.user_metadata || {};
        return {
            accessToken: session.access_token || '',
            user: {
                id: u.id,
                email: u.email || meta.email || '',
                name: meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : '')
            }
        };
    }

    function unwrapRpc(res, rpcName) {
        if (!res) throw new Error(`RPC ${rpcName} tidak mengembalikan respons.`);
        if (res.error) {
            const err = new Error(res.error.message || `Gagal memanggil ${rpcName}`);
            err.code = res.error.code || 'RPC_ERROR';
            throw err;
        }
        return res.data;
    }

    /** Membungkus instance klien supabase-js menjadi antarmuka adaptor seragam. */
    function fromClient(client) {
        if (!client) throw new Error('Klien Supabase tidak tersedia.');
        return {
            async getSession() {
                const { data, error } = await client.auth.getSession();
                if (error) throw new Error(error.message || 'Gagal membaca sesi login.');
                return normalizeSession(data && data.session);
            },
            async getAccessToken() {
                const s = await this.getSession();
                return s ? s.accessToken : '';
            },
            onAuthStateChange(callback) {
                const { data } = client.auth.onAuthStateChange((event, session) => {
                    if (typeof callback === 'function') callback(event, normalizeSession(session));
                });
                return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
            },
            async signInWithGoogle(redirectTo) {
                const target = redirectTo || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined);
                const { data, error } = await client.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: target }
                });
                if (error) throw new Error(error.message || 'Gagal memulai login Google.');
                return data;
            },
            async signOut() {
                const { error } = await client.auth.signOut();
                if (error) throw new Error(error.message || 'Gagal keluar dari sesi.');
            },
            async claimInvite() {
                return unwrapRpc(await client.rpc('claim_invite'), 'claim_invite');
            },
            async push(items) {
                return unwrapRpc(await client.rpc('push_records', { p_items: items || [] }), 'push_records');
            },
            /**
             * Menarik perubahan dari kursor seq.
             * Bila opts.overlap === true, kursor otomatis dimundurkan ±50 (CURSOR_OVERLAP).
             * Mesin Sync memanggil pull(since, limit) sesudah menghitung overlap pada halaman pertama
             * agar halaman lanjutan (has_more) maju lurus tanpa pengulangan.
             */
            async pull(sinceSeq = 0, limit = 500, opts = {}) {
                const overlap = opts && opts.overlap
                    ? (_Domain ? _Domain.CURSOR_OVERLAP : 50)
                    : 0;
                const p_since = Math.max(0, (Number(sinceSeq) || 0) - overlap);
                const p_limit = Math.max(1, Math.min(Number(limit) || 500, 1000));
                return unwrapRpc(await client.rpc('pull_records', { p_since, p_limit }), 'pull_records');
            },
            async getRecord(tbl, id) {
                return unwrapRpc(await client.rpc('get_record', { p_tbl: String(tbl), p_id: String(id) }), 'get_record');
            },
            async listTeam() {
                return unwrapRpc(await client.rpc('admin_list_team'), 'admin_list_team');
            },
            async inviteMember(email, role = 'teacher') {
                return unwrapRpc(await client.rpc('admin_invite_member', { p_email: String(email || '').trim(), p_role: role }), 'admin_invite_member');
            },
            async revokeInvite(inviteId) {
                return unwrapRpc(await client.rpc('admin_revoke_invite', { p_invite_id: String(inviteId) }), 'admin_revoke_invite');
            },
            async setMemberRole(userId, role) {
                return unwrapRpc(await client.rpc('admin_set_member_role', { p_user_id: String(userId), p_role: role }), 'admin_set_member_role');
            },
            async removeMember(userId) {
                return unwrapRpc(await client.rpc('admin_remove_member', { p_user_id: String(userId) }), 'admin_remove_member');
            }
        };
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => { s.remove(); reject(new Error('Gagal memuat skrip ' + src)); };
            document.head.appendChild(s);
        });
    }

    async function ensureSupabaseGlobal() {
        if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
            return window.supabase;
        }
        try {
            await loadScript(SUPABASE_VENDOR);
            if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase;
        } catch (_) {}
        await loadScript(SUPABASE_CDN);
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('Pustaka Supabase gagal dimuat. Periksa koneksi internet Anda.');
        }
        return window.supabase;
    }

    let cachedInstance = null;
    async function init(cfg) {
        if (typeof window !== 'undefined' && window.RemoteAdapter) {
            return window.RemoteAdapter;
        }
        if (cachedInstance) return cachedInstance;
        const conf = cfg || (typeof window !== 'undefined' && window.APP_CONFIG) || {};
        const url = String(conf.supabaseUrl || '').trim();
        const key = String(conf.supabaseAnonKey || '').trim();
        if (!url || !key) throw new Error('Konfigurasi Supabase (supabaseUrl / supabaseAnonKey) belum lengkap di app-config.js.');
        const sb = await ensureSupabaseGlobal();
        const client = sb.createClient(url, key, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        cachedInstance = fromClient(client);
        return cachedInstance;
    }

    return { init, fromClient, normalizeSession };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RemoteSupabase;
