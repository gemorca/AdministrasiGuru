/**
 * AIService: satu-satunya pintu ke Google Gemini.
 *
 * Dua jalur pengiriman (isi permintaan Gemini identik):
 *   proxy  : browser -> Google Apps Script (menyimpan API key) -> Gemini. Browser hanya memegang token aplikasi.
 *   direct : browser -> Gemini dengan header x-goog-api-key. Key tersimpan di browser (kurang aman).
 *
 * Fitur:
 *   - timeout per percobaan, pembatalan (AbortSignal), retry 429 / 5xx / jaringan dengan jeda bertambah
 *   - galat dinormalkan ke AIError berbahasa Indonesia (kode: AUTH, QUOTA, BILLING, REGION, ...)
 *   - keluaran terstruktur: skema JSON dikirim ke Gemini DAN divalidasi ulang di sini; satu kali perbaikan otomatis
 *   - gaya konfigurasi skema otomatis: responseFormat (dokumentasi terkini) -> responseJsonSchema (lama) -> hanya prompt
 *   - jaring pengaman privasi: permintaan yang masih memuat nama/NIS/telepon dikenal ditolak
 *   - penghitung pemakaian lokal (perkiraan, bukan angka resmi Google)
 *
 * Dapat dipakai di Node untuk uji lewat AIService.use({...}) yang menyuntik fetch, sleep, config, secret, dll.
 */
const AIService = (() => {
    const _Schema = (typeof Schema !== 'undefined') ? Schema : require('./schema.js');
    const _Prompts = (typeof Prompts !== 'undefined') ? Prompts : require('./prompts.js');

    const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const DEFAULT_MODEL = 'gemini-3.6-flash';
    const USAGE_KEY = 'g_ai_usage';

    class AIError extends Error {
        constructor(code, message, extra) {
            super(message);
            this.name = 'AIError';
            this.code = code;
            Object.assign(this, extra || {});
        }
    }

    // ---------- dependensi yang dapat disuntik (untuk uji) ----------
    const deps = {
        fetch: (...a) => fetch(...a),
        sleep: (ms, signal) => new Promise((res, rej) => {
            const t = setTimeout(res, ms);
            if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new AIError('ABORTED', 'Dibatalkan.')); }, { once: true });
        }),
        online: () => (typeof navigator === 'undefined' || navigator.onLine !== false),
        config: () => (typeof settings !== 'undefined' && settings.ai) ? settings.ai : {},
        secret: () => (typeof Store !== 'undefined' && Store.secretGet) ? Store.secretGet() : '',
        usageGet: () => { try { return JSON.parse(localStorage.getItem(USAGE_KEY) || 'null'); } catch (_) { return null; } },
        usageSet: v => { try { localStorage.setItem(USAGE_KEY, JSON.stringify(v)); } catch (_) {} },
        today: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
        now: () => Date.now(),
        onStyleResolved: null,
        proxyPingMs: 20000,
        pingMs: 60000
    };
    function use(overrides) { Object.assign(deps, overrides || {}); }

    const MESSAGES = {
        NOT_CONFIGURED: 'Fitur AI belum dikonfigurasi. Isi pengaturan di Pengaturan > AI (Google Gemini).',
        DISABLED: 'Fitur AI sedang dimatikan di Pengaturan.',
        PRIVACY: 'Anda belum menyetujui pemberitahuan privasi penggunaan AI.',
        OFFLINE: 'Tidak ada koneksi internet. Fitur AI membutuhkan internet; fitur lain tetap berjalan.',
        AUTH: 'API key atau token tidak valid atau tidak punya izin. Periksa di Pengaturan > AI.',
        QUOTA: 'Batas penggunaan Gemini tercapai (per menit atau per hari). Tunggu sebentar lalu coba lagi.',
        BILLING: 'Saldo kredit Gemini API habis. Tambahkan kredit di Google AI Studio, lalu coba lagi.',
        REGION: 'Tier gratis Gemini API tidak tersedia untuk proyek ini. Aktifkan penagihan di Google AI Studio.',
        SERVER: 'Layanan Gemini sedang bermasalah. Coba lagi beberapa saat lagi.',
        TIMEOUT: 'Permintaan terlalu lama tanpa jawaban. Coba lagi, atau kurangi ukuran dokumen/jumlah soal.',
        ABORTED: 'Permintaan dibatalkan.',
        BLOCKED: 'Permintaan atau jawaban diblokir oleh filter keamanan Gemini. Ubah redaksi permintaan lalu coba lagi.',
        TRUNCATED: 'Jawaban terpotong karena terlalu panjang. Kurangi jumlah butir/permintaan lalu coba lagi.',
        EMPTY: 'Gemini tidak mengembalikan jawaban. Coba lagi.',
        INVALID_JSON: 'Jawaban AI tidak sesuai format yang diminta meskipun sudah diulang. Coba lagi.',
        PII_BLOCKED: 'Permintaan dibatalkan karena masih memuat data siswa atau wali (nama/NIS/telepon). Ini kesalahan program, bukan kesalahan Anda.',
        PROXY_AUTH: 'Token aplikasi ditolak oleh proxy Apps Script. Periksa token di Pengaturan > AI.',
        PROXY_LIMIT: 'Batas harian proxy Apps Script tercapai. Coba lagi besok atau naikkan DAILY_LIMIT di Script Properties.',
        PROXY_CONFIG: 'Proxy Apps Script tidak merespons dengan benar. Pastikan deploy sebagai Web App dengan akses "Siapa saja" dan URL berakhiran /exec.',
        NETWORK: 'Gagal terhubung ke layanan AI. Periksa koneksi internet lalu coba lagi.',
        PROXY_TIMEOUT: 'Proxy Apps Script tidak menjawab dalam 20 detik. Periksa: URL Web App benar (berakhiran /exec), deploy "Siapa saja" (Anyone), dan buka tab Executions di Apps Script untuk melihat apakah permintaan masuk.',
        PROXY_OLD: 'Proxy Apps Script masih memakai kode lama. Tempel ulang isi apps-script/Code.gs, lalu Deploy > Manage deployments > Edit > Version: New version > Deploy.',
        PROXY_UNREACHABLE: 'URL Web App tidak dapat dijangkau dari browser. Penyebab umum: deploy belum "Siapa saja" (Anyone), URL salah, atau salinan URL dari tab Test deployment (harus URL Web app berakhiran /exec).'
    };
    function err(code, extra) { return new AIError(code, (extra && extra.message) || MESSAGES[code] || code, extra); }

    // ---------- status & konfigurasi ----------
    function status() {
        const c = deps.config() || {};
        const sec = deps.secret();
        const mode = c.mode === 'direct' ? 'direct' : 'proxy';
        const configured = !!sec && (mode === 'direct' || !!c.proxyUrl);
        return {
            enabled: !!c.enabled, configured, hasSecret: !!sec, mode,
            model: c.model || DEFAULT_MODEL, privacyAck: !!c.privacyAckAt,
            ready: !!c.enabled && configured && !!c.privacyAckAt
        };
    }

    // ---------- pemakaian lokal ----------
    function usageToday() {
        const u = deps.usageGet();
        const d = deps.today();
        return (u && u.date === d) ? u : { date: d, requests: 0, tokens: 0, byTask: {} };
    }
    function recordUsage(task, tokens) {
        const u = usageToday();
        u.requests += 1;
        u.tokens += tokens || 0;
        u.byTask[task || 'lain'] = (u.byTask[task || 'lain'] || 0) + 1;
        deps.usageSet(u);
    }

    // ---------- pembangun isi permintaan ----------
    // Gemini hanya mendukung sebagian kata kunci JSON Schema. Kata kunci yang tidak didukung dibuang
    // dari yang DIKIRIM, tetapi tetap dipakai pada validasi lokal (Schema.validate).
    const UNSUPPORTED = ['minLength', 'maxLength', 'pattern', 'minProperties', 'maxProperties'];
    function sendableSchema(sc) {
        if (Array.isArray(sc)) return sc.map(sendableSchema);
        if (sc && typeof sc === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(sc)) if (!UNSUPPORTED.includes(k)) out[k] = sendableSchema(v);
            return out;
        }
        return sc;
    }

    function styleOrder(cfg) {
        const pref = cfg.styleResolved || (cfg.style && cfg.style !== 'auto' ? cfg.style : 'format');
        const all = ['format', 'legacy', 'prompt'];
        return [pref, ...all.filter(s => s !== pref)];
    }

    function buildBody(o, style, extraTurns) {
        const parts = [{ text: o.prompt }];
        (o.inline || []).forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
        const gen = {};
        if (o.temperature !== undefined) gen.temperature = o.temperature;
        if (o.maxTokens) gen.maxOutputTokens = o.maxTokens;
        if (o.schema) {
            if (style === 'format') gen.responseFormat = { text: { mimeType: 'APPLICATION_JSON', schema: sendableSchema(o.schema) } };
            else if (style === 'legacy') { gen.responseMimeType = 'application/json'; gen.responseJsonSchema = sendableSchema(o.schema); }
        }
        const contents = [{ role: 'user', parts }, ...(extraTurns || [])];
        const body = { contents, generationConfig: gen };
        body.systemInstruction = { parts: [{ text: o.system || _Prompts.BASE_SYSTEM }] };
        return body;
    }

    // ---------- pengiriman ----------
    function mapHttpError(status, json) {
        const e = (json && json.error) || {};
        const msg = e.message || '';
        const reason = ((e.details || []).find(d => d.reason) || {}).reason || '';
        if (status === 400) {
            if (e.status === 'FAILED_PRECONDITION') return err('REGION', { status });
            if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)) return err('AUTH', { status });
            return err('BAD_REQUEST', {
                status, message: 'Permintaan ditolak Gemini: ' + (msg || 'format tidak valid'),
                schemaStyle: /responseFormat|responseSchema|responseJsonSchema|response_mime|responseMimeType|Unknown name|Invalid JSON payload|schema|mimeType/i.test(msg)
            });
        }
        if (status === 401 || status === 403) return err('AUTH', { status });
        if (status === 402) return err('BILLING', { status });
        if (status === 404) return err('BAD_REQUEST', { status, message: 'Model tidak ditemukan. Ganti nama model di Pengaturan > AI.' });
        if (status === 429) {
            const ri = (e.details || []).find(d => d.retryDelay);
            const sec = ri ? parseFloat(String(ri.retryDelay)) : null;
            return err('QUOTA', { status, retryAfterMs: sec ? sec * 1000 : null });
        }
        if (status >= 500) {
            const why = msg ? ` Pesan dari server: "${String(msg).replace(/\s+/g, ' ').slice(0, 200)}".` : '';
            const tip = status === 503 ? ' Biasanya sementara karena model sedang padat: tunggu sekitar satu menit lalu coba lagi, atau ganti/isi "Model cadangan" di Pengaturan > AI.' : '';
            return err('SERVER', { status, upstream: msg || '', message: `${MESSAGES.SERVER} (kode ${status}).${why}${tip}` });
        }
        return err('BAD_REQUEST', { status, message: `Galat tak terduga (kode ${status}). ${msg}` });
    }

    async function rawSend(body, cfg, secret, signal) {
        const model = cfg.model || DEFAULT_MODEL;
        if ((cfg.mode || 'proxy') === 'direct') {
            const res = await deps.fetch(GEMINI_BASE + encodeURIComponent(model) + ':generateContent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': secret },
                body: JSON.stringify(body), signal
            });
            let json = null; try { json = await res.json(); } catch (_) {}
            return { status: res.status, json };
        }
        // Apps Script: text/plain menghindari preflight CORS yang tidak dijawab Apps Script.
        const res = await deps.fetch(cfg.proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ token: secret, model, request: body }), signal
        });
        let env = null;
        try { env = await res.json(); } catch (_) { throw err('PROXY_CONFIG'); }
        if (!env || typeof env !== 'object') throw err('PROXY_CONFIG');
        if (env.proxyError === 'AUTH') throw err('PROXY_AUTH');
        if (env.proxyError === 'LIMIT') throw err('PROXY_LIMIT');
        if (env.proxyError) throw err('PROXY_CONFIG', { message: MESSAGES.PROXY_CONFIG + ' (' + env.proxyError + ')' });
        return { status: env.status, json: env.data };
    }

    async function attempt(body, cfg, secret, o) {
        const ctl = new AbortController();
        const onAbort = () => ctl.abort('user');
        if (o.signal) { if (o.signal.aborted) throw err('ABORTED'); o.signal.addEventListener('abort', onAbort, { once: true }); }
        const timer = setTimeout(() => ctl.abort('timeout'), o.timeoutMs || 60000);
        try {
            return await rawSend(body, cfg, secret, ctl.signal);
        } catch (e) {
            if (e instanceof AIError) throw e;
            if (ctl.signal.aborted) throw err(ctl.signal.reason === 'timeout' ? 'TIMEOUT' : 'ABORTED');
            throw err(deps.online() ? 'NETWORK' : 'OFFLINE');
        } finally {
            clearTimeout(timer);
            if (o.signal) o.signal.removeEventListener('abort', onAbort);
        }
    }

    async function sendWithRetry(body, cfg, secret, o) {
        let n429 = 0, n5xx = 0, nNet = 0;
        for (;;) {
            let res;
            try {
                res = await attempt(body, cfg, secret, o);
                recordUsage(o.task, 0);
            } catch (e) {
                if (e.code === 'NETWORK' && nNet < 1) { nNet++; await deps.sleep(1500, o.signal); continue; }
                throw e;
            }
            if (res.status >= 200 && res.status < 300) return res.json;
            const e = mapHttpError(res.status, res.json);
            if (res.status === 429 && n429 < 2) {
                const wait = e.retryAfterMs != null ? e.retryAfterMs : [2000, 4000][n429];
                if (wait > 30000) { e.message = MESSAGES.QUOTA + ` Coba lagi sekitar ${Math.ceil(wait / 1000)} detik.`; throw e; }
                n429++; await deps.sleep(wait, o.signal); continue;
            }
            if ([500, 503, 504].includes(res.status) && n5xx < 2) { await deps.sleep([2000, 5000][n5xx], o.signal); n5xx++; continue; }
            throw e;
        }
    }

    // ---------- membaca jawaban ----------
    function extract(json) {
        const pf = json && json.promptFeedback;
        if (pf && pf.blockReason) throw err('BLOCKED', { detail: pf.blockReason });
        const cand = json && json.candidates && json.candidates[0];
        if (!cand) throw err('EMPTY');
        const fr = cand.finishReason;
        if (fr === 'SAFETY' || fr === 'BLOCKLIST' || fr === 'PROHIBITED_CONTENT' || fr === 'SPII') throw err('BLOCKED', { detail: fr });
        const text = ((cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
        if (fr === 'MAX_TOKENS') throw err('TRUNCATED', { partial: text });
        if (!text.trim()) throw err('EMPTY');
        return text;
    }
    function parseJson(text) {
        let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        return JSON.parse(t);
    }

    // ---------- API utama ----------
    /**
     * @param o { task, prompt, system?, schema?, validate?(data)->string[], inline?: [{mimeType,data}], temperature?, maxTokens?,
     *            signal?, timeoutMs?, pii?: Anonymizer-ctx }
     * @returns { text, data?, tokens, style, model, ms }
     */
    async function generate(o) {
        const st = status();
        if (!st.enabled) throw err('DISABLED');
        if (!st.configured) throw err('NOT_CONFIGURED');
        if (!st.privacyAck) throw err('PRIVACY');
        if (!deps.online()) throw err('OFFLINE');
        const cfg = deps.config();
        const secret = deps.secret();

        if (o.pii && !cfg.allowNames) {
            const leaks = o.pii.findLeaks((o.prompt || '') + '\n' + (o.system || ''));
            if (leaks.length) throw err('PII_BLOCKED', { leaks: leaks.length });
        }

        const t0 = deps.now();
        const styles = o.schema ? styleOrder(cfg) : ['none'];
        let si = 0, repaired = false, extraTurns = [];
        let useCfg = cfg, usedFallback = false;
        for (;;) {
            const style = styles[si];
            const body = buildBody(o, style, extraTurns);
            let json;
            try {
                json = await sendWithRetry(body, useCfg, secret, o);
            } catch (e) {
                if (e.code === 'BAD_REQUEST' && e.schemaStyle && si + 1 < styles.length) { si++; continue; }
                // Layanan/model padat: pindah sekali ke model cadangan bila diatur.
                if (e.code === 'SERVER' && !usedFallback && cfg.fallbackModel && cfg.fallbackModel !== (cfg.model || DEFAULT_MODEL)) {
                    usedFallback = true; useCfg = { ...cfg, model: cfg.fallbackModel }; continue;
                }
                throw e;
            }
            const tokens = (json.usageMetadata && json.usageMetadata.totalTokenCount) || 0;
            if (tokens) { const u = usageToday(); u.tokens += tokens; deps.usageSet(u); }
            const text = extract(json);
            const meta = { text, tokens, style, model: useCfg.model || DEFAULT_MODEL, fallback: usedFallback, ms: deps.now() - t0 };
            if (!o.schema) return meta;

            let data, problems;
            try { data = parseJson(text); problems = _Schema.validate(o.schema, data); if (!problems.length && o.validate) problems = o.validate(data) || []; }
            catch (e) { problems = ['bukan JSON yang valid: ' + e.message]; }
            if (!problems.length) {
                if (style !== 'none' && style !== (cfg.styleResolved || 'format') && deps.onStyleResolved) deps.onStyleResolved(style);
                return { ...meta, data };
            }
            if (!repaired) {
                repaired = true;
                extraTurns = [
                    { role: 'model', parts: [{ text }] },
                    { role: 'user', parts: [{ text: 'Jawaban sebelumnya tidak valid:\n- ' + problems.slice(0, 8).join('\n- ') + '\nPerbaiki dan kembalikan HANYA JSON yang sesuai skema.' }] }
                ];
                continue;
            }
            throw err('INVALID_JSON', { raw: text, problems });
        }
    }

    /** Tahap 1 uji koneksi (hanya mode proxy): membuktikan URL, deploy, dan token tanpa memanggil Gemini. */
    async function pingProxy(signal) {
        const cfg = deps.config();
        const t0 = deps.now();
        const ctl = new AbortController();
        const onAbort = () => ctl.abort('user');
        if (signal) { if (signal.aborted) throw err('ABORTED'); signal.addEventListener('abort', onAbort, { once: true }); }
        const timer = setTimeout(() => ctl.abort('timeout'), deps.proxyPingMs);
        let res;
        try {
            res = await deps.fetch(cfg.proxyUrl, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ token: deps.secret(), op: 'ping' }), signal: ctl.signal
            });
        } catch (e) {
            if (ctl.signal.aborted) throw err(ctl.signal.reason === 'timeout' ? 'PROXY_TIMEOUT' : 'ABORTED');
            throw err(deps.online() ? 'PROXY_UNREACHABLE' : 'OFFLINE');
        } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
        let env = null;
        try { env = await res.json(); } catch (_) { throw err('PROXY_CONFIG'); }
        if (!env || typeof env !== 'object') throw err('PROXY_CONFIG');
        if (env.proxyError === 'AUTH') throw err('PROXY_AUTH');
        if (env.proxyError === 'CONFIG') throw err('PROXY_CONFIG', { message: 'Proxy belum lengkap: isi GEMINI_API_KEY dan APP_TOKEN di Script properties.' });
        if (env.proxyError === 'BAD_REQUEST' || env.proxyError === 'BAD_MODEL') throw err('PROXY_OLD');
        if (env.proxyError) throw err('PROXY_CONFIG', { message: MESSAGES.PROXY_CONFIG + ' (' + env.proxyError + ')' });
        if (env.ping !== true) throw err('PROXY_OLD');
        return deps.now() - t0;
    }

    /**
     * Uji koneksi dua tahap. Mode proxy: (1) proxy dan token, (2) Gemini lewat proxy. Mode langsung: hanya (2).
     * Galat menyebut tahap yang gagal supaya penyebabnya jelas.
     */
    async function ping(signal, onStage) {
        const st = status();
        if (!st.enabled) throw err('DISABLED');
        if (!st.configured) throw err('NOT_CONFIGURED');
        if (!st.privacyAck) throw err('PRIVACY');
        if (!deps.online()) throw err('OFFLINE');
        let proxyMs = null;
        if (st.mode === 'proxy') {
            if (onStage) onStage('proxy');
            proxyMs = await pingProxy(signal);
        }
        if (onStage) onStage('gemini');
        const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
        try {
            const r = await generate({ task: 'ping', prompt: 'Kembalikan JSON {"ok": true}.', schema, temperature: 0, maxTokens: 256, signal, timeoutMs: deps.pingMs });
            return { ok: r.data.ok === true, model: r.model, fallback: r.fallback, style: r.style, ms: r.ms, tokens: r.tokens, proxyMs };
        } catch (e) {
            if (e.code === 'TIMEOUT') {
                e.message = proxyMs !== null
                    ? `Proxy terhubung (${proxyMs} ms), tetapi Gemini tidak menjawab dalam 60 detik. Kemungkinan: model tidak tersedia atau sangat lambat (coba model lain, mis. gemini-3.5-flash-lite), kuota/penagihan bermasalah, atau eksekusi Apps Script tertahan. Buka tab Executions di Apps Script untuk melihat statusnya.`
                    : 'Gemini tidak menjawab dalam 60 detik. Periksa koneksi internet, VPN atau firewall yang memblokir generativelanguage.googleapis.com, dan nama model.';
                e.stage = 'gemini';
            }
            throw e;
        }
    }

    return { AIError, use, sendableSchema, status, generate, ping, usageToday, MESSAGES, DEFAULT_MODEL, buildBody, mapHttpError, extract, parseJson };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AIService;
