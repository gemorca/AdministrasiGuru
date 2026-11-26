/**
 * Adaptor Google Spreadsheet (via Google Apps Script Web App) untuk login, register, dan sinkronisasi.
 * Antarmukanya sengaja sama dengan adaptor lama sehingga mesin Sync tidak berubah:
 *   getSession, signOut, push, pull, getRecord, listTeam, inviteMember, revokeInvite, setMemberRole, removeMember.
 * Tambahan: status, register, login, changePassword, resetMemberPassword, sessionToken, onAuthLost.
 *
 * Token sesi disimpan di localStorage perangkat (kunci terpisah dari data aplikasi); kata sandi tidak pernah disimpan.
 * Bila `window.RemoteAdapter` ada (suntikan uji), itu yang dipakai.
 */
const RemoteSheets = (() => {
    const _Domain = (typeof SyncDomain !== 'undefined') ? SyncDomain : (typeof require === 'function' ? require('../domain/sync.js') : null);
    const TOKEN_KEY = 'ag_session_token';
    const TIMEOUT_MS = 60000;

    function lsGet() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
    function lsSet(v) { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

    function create(url) {
        let token = lsGet();
        const authLost = new Set();

        function fail(message, code) { const e = new Error(message); e.code = code || 'ERROR'; return e; }

        async function call(body, opts = {}) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
            let res;
            try {
                // text/plain menghindari preflight CORS yang tidak dijawab Apps Script.
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ ...body, token: opts.noToken ? body.token : token }),
                    signal: ctl.signal
                });
            } catch (e) {
                throw fail(e && e.name === 'AbortError'
                    ? 'Server terlalu lama menjawab. Coba lagi.'
                    : 'Tidak dapat terhubung ke server. Periksa koneksi internet.', 'NETWORK');
            } finally { clearTimeout(timer); }
            let env;
            try { env = await res.json(); } catch (_) { throw fail('Respons server tidak valid. Pastikan URL Web App benar dan sudah di-deploy ulang.', 'BAD_RESPONSE'); }
            if (env && env.error === 'AUTH') {
                token = ''; lsSet('');
                authLost.forEach(fn => { try { fn(); } catch (_) {} });
                throw fail('Sesi berakhir. Silakan masuk kembali.', 'AUTH');
            }
            if (!env || env.error) throw fail((env && env.message) || 'Server mengembalikan galat (' + (env && env.error) + ').', (env && env.error) || 'ERROR');
            return env;
        }

        function toSession(me) {
            return {
                accessToken: token,
                user: { id: me.user_id, email: me.email, name: me.name },
                role: me.role === 'admin' ? 'admin' : 'teacher',
                school: { id: me.school_id || 'sekolah', name: me.school_name || '' }
            };
        }

        return {
            sessionToken: () => token,
            onAuthLost(fn) { authLost.add(fn); return () => authLost.delete(fn); },
            status: () => call({ action: 'status' }, { noToken: true }),

            async register(data) {
                const env = await call({ action: 'register', ...data }, { noToken: true });
                if (!env.ok) return env;
                token = env.token; lsSet(token);
                return { ok: true, session: toSession(env) };
            },
            async login(email, password) {
                const env = await call({ action: 'login', email, password }, { noToken: true });
                if (!env.ok) return env;
                token = env.token; lsSet(token);
                return { ok: true, session: toSession(env) };
            },
            async googleLogin(data) {
                const env = await call({ action: 'google_login', ...data }, { noToken: true });
                if (!env.ok) return env;
                token = env.token; lsSet(token);
                return { ok: true, session: toSession(env) };
            },
            async getSession() {
                if (!token) return null;
                try {
                    const env = await call({ action: 'me' });
                    return env.ok ? toSession(env) : null;
                } catch (e) {
                    if (e.code === 'AUTH') return null;
                    throw e;
                }
            },
            async getAccessToken() { return token; },
            async signOut() {
                const t = token;
                token = ''; lsSet('');
                if (t) { try { await call({ action: 'logout', token: t }, { noToken: true }); } catch (_) {} }
            },
            changePassword: (oldPassword, newPassword) => call({ action: 'change_password', oldPassword, newPassword }),

            async push(items) { const r = await call({ action: 'push', items: items || [] }); return { rejected: r.rejected || [] }; },
            async pull(sinceSeq = 0, limit = 500, opts = {}) {
                const overlap = opts && opts.overlap ? (_Domain ? _Domain.CURSOR_OVERLAP : 50) : 0;
                const since = Math.max(0, (Number(sinceSeq) || 0) - overlap);
                const r = await call({ action: 'pull', since, limit: Math.max(1, Math.min(Number(limit) || 500, 1000)) });
                return { rows: r.rows || [], last_seq: r.last_seq || 0, has_more: !!r.has_more };
            },
            async getRecord(tbl, id) { const r = await call({ action: 'get_record', tbl: String(tbl), id: String(id) }); return r.record || null; },

            listTeam: () => call({ action: 'team' }),
            inviteMember: (email, role = 'teacher') => call({ action: 'invite', email: String(email || '').trim(), role }),
            revokeInvite: inviteId => call({ action: 'revoke_invite', invite_id: String(inviteId) }),
            setMemberRole: (userId, role) => call({ action: 'set_role', user_id: String(userId), role }),
            removeMember: userId => call({ action: 'remove_member', user_id: String(userId) }),
            resetMemberPassword: userId => call({ action: 'reset_password', user_id: String(userId) })
        };
    }

    let cached = null;
    async function init(cfg) {
        if (typeof window !== 'undefined' && window.RemoteAdapter) return window.RemoteAdapter;
        if (cached) return cached;
        const conf = cfg || (typeof window !== 'undefined' && window.APP_CONFIG) || {};
        const url = String(conf.sheetsUrl || '').trim();
        if (!url) throw new Error('sheetsUrl belum diisi di app-config.js.');
        cached = create(url);
        return cached;
    }

    return { init, create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RemoteSheets;
