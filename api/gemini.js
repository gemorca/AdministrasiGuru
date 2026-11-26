/**
 * Fungsi Serverless Vercel: pintu Gemini untuk mode multi-guru (Supabase).
 *
 * Keamanan & Privasi:
 *   - GEMINI_API_KEY hanya ada di environment variable Vercel, tidak pernah terkirim ke browser.
 *   - Setiap permintaan wajib menyertakan JWT Supabase (Authorization: Bearer <token>).
 *   - Memverifikasi sesi pengguna ke Supabase Auth DAN keanggotaan sekolah serta kuota harian
 *     per guru lewat RPC `ai_bump` sebelum meneruskan permintaan ke Gemini.
 *   - Tidak pernah mencatat isi prompt maupun jawaban ke log.
 */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_LIST = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_RE = /^gemini-[a-z0-9][a-z0-9.\-]{0,60}$/;
const PAGE_TOKEN_RE = /^[A-Za-z0-9_\-=.]{1,300}$/;

function parseBearer(headers) {
    if (!headers) return '';
    const raw = headers.authorization || headers.Authorization || '';
    const m = String(raw).match(/^Bearer\s+([A-Za-z0-9._\-]+)$/i);
    return m ? m[1] : '';
}

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
    }
    const text = JSON.stringify(payload);
    if (typeof res.end === 'function') res.end(text);
    return payload;
}

async function readBody(req) {
    if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'string') return JSON.parse(req.body);
        if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
        if (typeof req.body === 'object') return req.body;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const raw = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(raw);
}

function createHandler(deps = {}) {
    const fetchFn = deps.fetch || ((...a) => fetch(...a));
    const getEnv = () => deps.env || process.env || {};

    return async function handler(req, res) {
        const method = String((req && req.method) || 'GET').toUpperCase();
        if (method === 'GET') {
            return sendJson(res, 200, { ok: true, service: 'gemini-cloud' });
        }
        if (method !== 'POST') {
            return sendJson(res, 405, { cloudError: 'METHOD_NOT_ALLOWED' });
        }

        const env = getEnv();
        const geminiKey = String(env.GEMINI_API_KEY || '').trim();
        const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
        const supabaseAnon = String(env.SUPABASE_ANON_KEY || '').trim();
        const dailyLimit = Math.max(1, parseInt(env.AI_DAILY_LIMIT || '150', 10) || 150);

        if (!geminiKey || !supabaseUrl || !supabaseAnon || !/^https?:\/\//i.test(supabaseUrl)) {
            return sendJson(res, 200, { cloudError: 'CONFIG' });
        }

        const jwt = parseBearer(req.headers);
        if (!jwt) {
            return sendJson(res, 200, { cloudError: 'AUTH' });
        }

        let body;
        try {
            body = await readBody(req);
        } catch (_) {
            return sendJson(res, 200, { cloudError: 'BAD_REQUEST' });
        }
        if (!body || typeof body !== 'object') {
            return sendJson(res, 200, { cloudError: 'BAD_REQUEST' });
        }

        // 1. Verifikasi JWT ke Supabase Auth
        const sbHeaders = {
            apikey: supabaseAnon,
            Authorization: 'Bearer ' + jwt,
            'Content-Type': 'application/json'
        };
        let authRes;
        try {
            authRes = await fetchFn(supabaseUrl + '/auth/v1/user', { method: 'GET', headers: sbHeaders });
        } catch (_) {
            return sendJson(res, 200, { cloudError: 'CONFIG' });
        }
        if (!authRes || authRes.status !== 200) {
            return sendJson(res, 200, { cloudError: 'AUTH' });
        }

        // Pembantu cek keanggotaan tanpa memotong kuota (untuk ping dan daftar model)
        async function verifyMembershipOnly() {
            const memRes = await fetchFn(supabaseUrl + '/rest/v1/members?select=role,school_id&limit=1', {
                method: 'GET',
                headers: sbHeaders
            });
            if (!memRes || memRes.status < 200 || memRes.status >= 300) return false;
            let rows = null;
            try { rows = await memRes.json(); } catch (_) { return false; }
            return Array.isArray(rows) && rows.length > 0;
        }

        if (body.op === 'ping') {
            let isMember = false;
            try { isMember = await verifyMembershipOnly(); } catch (_) { return sendJson(res, 200, { cloudError: 'CONFIG' }); }
            if (!isMember) return sendJson(res, 200, { cloudError: 'AUTH' });
            return sendJson(res, 200, { ok: true, status: 200, ping: true });
        }

        if (body.op === 'models') {
            let isMember = false;
            try { isMember = await verifyMembershipOnly(); } catch (_) { return sendJson(res, 200, { cloudError: 'CONFIG' }); }
            if (!isMember) return sendJson(res, 200, { cloudError: 'AUTH' });
            const pt = body.pageToken ? String(body.pageToken) : '';
            if (pt && !PAGE_TOKEN_RE.test(pt)) return sendJson(res, 200, { cloudError: 'BAD_REQUEST' });
            const url = GEMINI_LIST + '?pageSize=200' + (pt ? '&pageToken=' + encodeURIComponent(pt) : '');
            const mRes = await fetchFn(url, { method: 'GET', headers: { 'x-goog-api-key': geminiKey } });
            let mData = null;
            try { mData = await mRes.json(); } catch (_) { mData = { error: { message: 'Respons Gemini bukan JSON' } }; }
            return sendJson(res, 200, { ok: mRes.status >= 200 && mRes.status < 300, status: mRes.status, data: mData });
        }

        const model = String(body.model || '');
        if (!MODEL_RE.test(model)) return sendJson(res, 200, { cloudError: 'BAD_MODEL' });
        if (!body.request || typeof body.request !== 'object' || Array.isArray(body.request)) {
            return sendJson(res, 200, { cloudError: 'BAD_REQUEST' });
        }

        // 2. Verifikasi keanggotaan + potong 1 dari kuota harian per guru lewat RPC ai_bump
        let bumpRes, bumpJson = null;
        try {
            bumpRes = await fetchFn(supabaseUrl + '/rest/v1/rpc/ai_bump', {
                method: 'POST',
                headers: sbHeaders,
                body: JSON.stringify({ p_limit: dailyLimit, p_tokens: 0 })
            });
            try { bumpJson = await bumpRes.json(); } catch (_) {}
        } catch (_) {
            return sendJson(res, 200, { cloudError: 'CONFIG' });
        }
        if (!bumpRes || bumpRes.status === 401 || bumpRes.status === 403) {
            return sendJson(res, 200, { cloudError: 'AUTH' });
        }
        if (bumpRes.status < 200 || bumpRes.status >= 300 || !bumpJson || typeof bumpJson !== 'object') {
            return sendJson(res, 200, { cloudError: 'CONFIG' });
        }
        if (!bumpJson.ok) {
            if (bumpJson.reason === 'LIMIT') {
                return sendJson(res, 200, { cloudError: 'LIMIT', used: bumpJson.used, limit: bumpJson.limit });
            }
            return sendJson(res, 200, { cloudError: 'AUTH' });
        }

        // 3. Teruskan ke Google Gemini (key hanya di header x-goog-api-key)
        let gRes, gData = null;
        try {
            gRes = await fetchFn(GEMINI_BASE + model + ':generateContent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
                body: JSON.stringify(body.request)
            });
            try { gData = await gRes.json(); } catch (_) { gData = { error: { message: 'Respons Gemini bukan JSON' } }; }
        } catch (_) {
            return sendJson(res, 200, { ok: false, status: 502, data: { error: { message: 'Gagal menghubungi Gemini dari server' } } });
        }

        // Catat jumlah token secara best-effort (tanpa memotong kuota permintaan lagi)
        const totalTokens = (gData && gData.usageMetadata && Number(gData.usageMetadata.totalTokenCount)) || 0;
        if (totalTokens > 0) {
            try {
                await fetchFn(supabaseUrl + '/rest/v1/rpc/ai_bump', {
                    method: 'POST',
                    headers: sbHeaders,
                    body: JSON.stringify({ p_limit: dailyLimit, p_tokens: totalTokens })
                });
            } catch (_) {}
        }

        return sendJson(res, 200, {
            ok: gRes.status >= 200 && gRes.status < 300,
            status: gRes.status,
            data: gData
        });
    };
}

const defaultHandler = createHandler();
defaultHandler.createHandler = createHandler;
module.exports = defaultHandler;
