const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../../js/ai/schema.js');
const Anonymizer = require('../../js/ai/anonymizer.js');
const AIService = require('../../js/ai/aiService.js');

// ---------- helpers ----------
const ok = (text, extra) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 42 }, ...extra } });
const httpErr = (status, error) => ({ status, json: { error: { code: status, ...error } } });

function setup({ cfg = {}, secret = 'KEY-123', responses = [], online = true } = {}) {
    const calls = [], sleeps = [];
    let usage = null;
    const config = { enabled: true, mode: 'direct', model: 'gemini-test', privacyAckAt: '2026-01-01', ...cfg };
    AIService.use({
        config: () => config,
        secret: () => secret,
        online: () => online,
        sleep: async ms => { sleeps.push(ms); },
        usageGet: () => usage, usageSet: v => { usage = v; },
        today: () => '2026-11-22',
        onStyleResolved: s => { config.styleResolved = s; },
        fetch: async (url, init) => {
            calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
            const r = responses.shift();
            if (!r) throw new Error('mock kehabisan respons');
            if (r instanceof Error) throw r;
            if (typeof r === 'function') return r(url, init);
            return { status: r.status, json: async () => r.json };
        }
    });
    return { calls, sleeps, config, usage: () => usage };
}
const schemaOK = { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] };

// ---------- Schema ----------
test('Schema: tipe, required, enum, rentang, array', () => {
    const s = { type: 'object', required: ['a', 'b'], properties: {
        a: { type: 'string', enum: ['x', 'y'] }, b: { type: 'array', minItems: 2, items: { type: 'integer', minimum: 0, maximum: 5 } } } };
    assert.deepEqual(Schema.validate(s, { a: 'x', b: [1, 2] }), []);
    assert.ok(Schema.validate(s, { a: 'z', b: [1, 2] }).some(e => e.includes('$.a')));
    assert.ok(Schema.validate(s, { a: 'x', b: [1] }).some(e => e.includes('minimal 2')));
    assert.ok(Schema.validate(s, { a: 'x', b: [1, 9] }).some(e => e.includes('b[1]') && e.includes('maksimal')));
    assert.ok(Schema.validate(s, { a: 'x' }).some(e => e.includes('$.b: wajib')));
    assert.ok(Schema.validate(s, { a: 'x', b: [1.5, 2] }).some(e => e.includes('tipe')));
    assert.ok(Schema.validate({ type: ['string', 'null'] }, null).length === 0);
    assert.ok(Schema.validate({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, true).length === 1);
});

// ---------- Anonymizer ----------
const stu = [{ id: 'a', name: 'Budi Santoso', nis: '12345' }, { id: 'b', name: 'Siti Aminah', nis: '67890' }];
const grd = [{ name: 'Pak Ahmad Santoso', phone: '0812-3456-7890' }];

test('Anonymizer: kode stabil, scrub nama/NIS/telepon, restore dua arah', () => {
    const a = Anonymizer.create({ students: stu, guardians: grd });
    assert.equal(a.code('a'), '[S01]');
    assert.equal(a.code('b'), '[S02]');
    const t = a.scrub('Budi Santoso (NIS 12345) dan siti   aminah. Hubungi pak ahmad santoso di 0812-3456-7890.');
    assert.ok(!/budi|12345|siti|ahmad|0812/i.test(t), t);
    assert.deepEqual(a.findLeaks(t), []);
    assert.equal(a.restore('[S01] naik nilai, [S02] turun. Wali [W01].'), 'Budi Santoso naik nilai, Siti Aminah turun. Wali Pak Ahmad Santoso.');
    assert.deepEqual(a.restore({ x: ['[S02]'], y: { z: '[S01]!' }, n: 5 }), { x: ['Siti Aminah'], y: { z: 'Budi Santoso!' }, n: 5 });
});

test('Anonymizer: findLeaks mendeteksi kebocoran tanpa menyebut isinya', () => {
    const a = Anonymizer.create({ students: stu, guardians: grd });
    const leaks = a.findLeaks('Nilai BUDI  SANTOSO rendah, NIS 67890');
    assert.deepEqual(leaks.sort(), ['NIS', 'nama siswa']);
    assert.deepEqual(a.findLeaks('Angka 123456 bukan NIS 12345'), ['NIS'].filter(() => false).concat(['NIS'])); // 12345 berdiri sendiri terdeteksi
    assert.deepEqual(a.findLeaks('Nomor 9912345 dan 123456'), []); // sisipan angka lain tidak dianggap NIS
});

test('Anonymizer: kode tak dikenal dibiarkan', () => {
    const a = Anonymizer.create({ students: stu });
    assert.equal(a.restore('[S09] dan [S01]'), '[S09] dan Budi Santoso');
});

// ---------- AIService: konfigurasi & jalur direct ----------
test('direct: key hanya di header x-goog-api-key, bukan URL/body; isi permintaan sesuai dokumentasi', async () => {
    const m = setup({ responses: [ok('Halo')] });
    const r = await AIService.generate({ task: 't', prompt: 'Sapa', temperature: 0.2, maxTokens: 100 });
    assert.equal(r.text, 'Halo');
    const c = m.calls[0];
    assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.equal(c.init.headers['x-goog-api-key'], 'KEY-123');
    assert.ok(!c.url.includes('KEY-123') && !c.init.body.includes('KEY-123'));
    assert.equal(c.body.contents[0].role, 'user');
    assert.equal(c.body.contents[0].parts[0].text, 'Sapa');
    assert.equal(c.body.generationConfig.temperature, 0.2);
    assert.equal(c.body.generationConfig.maxOutputTokens, 100);
    assert.match(c.body.systemInstruction.parts[0].text, /Kurikulum Merdeka/);
});

test('proxy: POST text/plain berisi token (bukan key Gemini), amplop respons dibaca', async () => {
    const m = setup({ cfg: { mode: 'proxy', proxyUrl: 'https://script.google.com/macros/s/X/exec' }, secret: 'TOKEN-ABC',
        responses: [{ status: 200, json: { ok: true, status: 200, data: ok('Hai').json } }] });
    const r = await AIService.generate({ task: 't', prompt: 'Sapa' });
    assert.equal(r.text, 'Hai');
    const c = m.calls[0];
    assert.equal(c.url, 'https://script.google.com/macros/s/X/exec');
    assert.match(c.init.headers['Content-Type'], /^text\/plain/);
    assert.equal(c.body.token, 'TOKEN-ABC');
    assert.equal(c.body.model, 'gemini-test');
    assert.ok(c.body.request.contents);
    assert.ok(!('x-goog-api-key' in c.init.headers));
});

test('proxy: galat dari proxy dipetakan (token salah, batas harian, HTML bukan JSON)', async () => {
    const cfg = { mode: 'proxy', proxyUrl: 'https://script.google.com/macros/s/X/exec' };
    setup({ cfg, responses: [{ status: 200, json: { proxyError: 'AUTH' } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'PROXY_AUTH');
    setup({ cfg, responses: [{ status: 200, json: { proxyError: 'LIMIT' } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'PROXY_LIMIT');
    setup({ cfg, responses: [() => ({ status: 200, json: async () => { throw new Error('<html>'); } })] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'PROXY_CONFIG');
    setup({ cfg, responses: [{ status: 200, json: { ok: false, status: 403, data: { error: { message: 'x' } } } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'AUTH');
});

test('prasyarat: dimatikan, belum dikonfigurasi, belum setuju privasi, offline', async () => {
    setup({ cfg: { enabled: false } });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'DISABLED');
    setup({ secret: '' });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'NOT_CONFIGURED');
    setup({ cfg: { mode: 'proxy', proxyUrl: '' } });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'NOT_CONFIGURED');
    setup({ cfg: { privacyAckAt: null } });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'PRIVACY');
    setup({ online: false });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'OFFLINE');
    const m = setup({});
    assert.equal(AIService.status().ready, true);
    assert.equal(m.calls.length, 0);
});

// ---------- retry & galat ----------
test('429: ulang 2 kali dengan jeda 2s lalu 4s, lalu berhasil', async () => {
    const m = setup({ responses: [httpErr(429, { status: 'RESOURCE_EXHAUSTED' }), httpErr(429, { status: 'RESOURCE_EXHAUSTED' }), ok('ok')] });
    const r = await AIService.generate({ prompt: 'x' });
    assert.equal(r.text, 'ok');
    assert.deepEqual(m.sleeps, [2000, 4000]);
    assert.equal(m.calls.length, 3);
});

test('429 terus-menerus: berhenti setelah 2 ulangan dengan galat QUOTA', async () => {
    const m = setup({ responses: [httpErr(429, {}), httpErr(429, {}), httpErr(429, {}), ok('tidak tercapai')] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'QUOTA');
    assert.equal(m.calls.length, 3);
});

test('429 dengan retryDelay panjang: tidak menunggu, pesan memuat detik', async () => {
    const m = setup({ responses: [httpErr(429, { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '47s' }] })] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'QUOTA' && /47 detik/.test(e.message));
    assert.deepEqual(m.sleeps, []);
});

test('429 dengan retryDelay pendek dihormati', async () => {
    const m = setup({ responses: [httpErr(429, { details: [{ retryDelay: '7s' }] }), ok('ok')] });
    await AIService.generate({ prompt: 'x' });
    assert.deepEqual(m.sleeps, [7000]);
});

test('503: ulang dua kali (2 dtk, 5 dtk); tetap gagal menjadi SERVER dengan pesan asli Gemini', async () => {
    const m = setup({ responses: [httpErr(503, { message: 'The model is overloaded. Please try again later.' }), httpErr(503, {}), httpErr(503, { message: 'The model is overloaded. Please try again later.' })] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'SERVER' && /503/.test(e.message) && /model is overloaded/.test(e.message) && /Model cadangan/.test(e.message));
    assert.equal(m.calls.length, 3);
    assert.deepEqual(m.sleeps, [2000, 5000]);
    const m2 = setup({ responses: [httpErr(500, {}), ok('pulih')] });
    assert.equal((await AIService.generate({ prompt: 'x' })).text, 'pulih');
    assert.equal(m2.calls.length, 2);
});

test('galat tanpa ulang: 401/403/API key salah, 402, 400 wilayah, 404 model', async () => {
    for (const [r, code] of [
        [httpErr(400, { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] }), 'AUTH'],
        [httpErr(403, { status: 'PERMISSION_DENIED' }), 'AUTH'],
        [httpErr(401, {}), 'AUTH'],
        [httpErr(402, { status: 'RESOURCE_EXHAUSTED' }), 'BILLING'],
        [httpErr(400, { status: 'FAILED_PRECONDITION' }), 'REGION'],
        [httpErr(404, { status: 'NOT_FOUND' }), 'BAD_REQUEST']
    ]) {
        const m = setup({ responses: [r, ok('tidak boleh dipanggil')] });
        await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === code, code);
        assert.equal(m.calls.length, 1, code + ' tidak boleh diulang');
        assert.deepEqual(m.sleeps, []);
    }
});

test('jaringan putus: ulang sekali; online=false memberi OFFLINE', async () => {
    const m = setup({ responses: [new TypeError('Failed to fetch'), ok('pulih')] });
    assert.equal((await AIService.generate({ prompt: 'x' })).text, 'pulih');
    assert.deepEqual(m.sleeps, [1500]);
    setup({ responses: [new TypeError('f'), new TypeError('f')] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'NETWORK');
});

test('timeout dan pembatalan pengguna', async () => {
    const hang = (url, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    setup({ responses: [hang] });
    await assert.rejects(AIService.generate({ prompt: 'x', timeoutMs: 20 }), e => e.code === 'TIMEOUT');
    setup({ responses: [hang] });
    const ctl = new AbortController();
    const p = AIService.generate({ prompt: 'x', signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await assert.rejects(p, e => e.code === 'ABORTED');
    const pre = new AbortController(); pre.abort();
    setup({ responses: [ok('x')] });
    await assert.rejects(AIService.generate({ prompt: 'x', signal: pre.signal }), e => e.code === 'ABORTED');
});

test('jawaban diblokir / terpotong / kosong', async () => {
    setup({ responses: [{ status: 200, json: { promptFeedback: { blockReason: 'SAFETY' } } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'BLOCKED');
    setup({ responses: [{ status: 200, json: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'BLOCKED');
    setup({ responses: [{ status: 200, json: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"n":' }] } }] } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'TRUNCATED');
    setup({ responses: [{ status: 200, json: { candidates: [] } }] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'EMPTY');
    setup({ responses: [ok('   ')] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'EMPTY');
});

test('bagian "thought" tidak ikut menjadi jawaban', async () => {
    setup({ responses: [{ status: 200, json: { candidates: [{ content: { parts: [{ text: 'pikiran', thought: true }, { text: 'jawaban' }] }, finishReason: 'STOP' }] } }] });
    assert.equal((await AIService.generate({ prompt: 'x' })).text, 'jawaban');
});

// ---------- keluaran terstruktur ----------
test('terstruktur: gaya responseFormat dipakai pertama dan data tervalidasi', async () => {
    const m = setup({ responses: [ok('{"n": 7}')] });
    const r = await AIService.generate({ prompt: 'x', schema: schemaOK });
    assert.deepEqual(r.data, { n: 7 });
    assert.deepEqual(m.calls[0].body.generationConfig.responseFormat, { text: { mimeType: 'APPLICATION_JSON', schema: schemaOK } });
    assert.equal(r.style, 'format');
});

test('terstruktur: pagar kode ```json dibuang', async () => {
    setup({ responses: [ok('```json\n{"n": 3}\n```')] });
    assert.deepEqual((await AIService.generate({ prompt: 'x', schema: schemaOK })).data, { n: 3 });
});

test('terstruktur: gaya ditolak API (400 skema) -> coba gaya lama -> berhasil dan gaya diingat', async () => {
    const m = setup({ responses: [
        httpErr(400, { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received. Unknown name "responseFormat"' }),
        ok('{"n": 1}')] });
    const r = await AIService.generate({ prompt: 'x', schema: schemaOK });
    assert.equal(r.style, 'legacy');
    assert.equal(m.calls[1].body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(m.calls[1].body.generationConfig.responseJsonSchema, schemaOK);
    assert.ok(!('responseFormat' in m.calls[1].body.generationConfig));
    assert.equal(m.config.styleResolved, 'legacy');
});

test('terstruktur: semua gaya ditolak -> gaya hanya-prompt tanpa konfigurasi skema', async () => {
    const bad = httpErr(400, { message: 'Unknown name "responseMimeType"' });
    const m = setup({ responses: [bad, bad, ok('{"n": 2}')] });
    const r = await AIService.generate({ prompt: 'x', schema: schemaOK });
    assert.equal(r.style, 'prompt');
    assert.deepEqual(m.calls[2].body.generationConfig, {});
});

test('terstruktur: galat 400 yang bukan soal skema tidak memicu pergantian gaya', async () => {
    const m = setup({ responses: [httpErr(400, { message: 'Permintaan tidak valid lainnya' }), ok('{"n":1}')] });
    await assert.rejects(AIService.generate({ prompt: 'x', schema: schemaOK }), e => e.code === 'BAD_REQUEST');
    assert.equal(m.calls.length, 1);
});

test('terstruktur: JSON tidak sesuai -> satu perbaikan otomatis menyertakan daftar masalah', async () => {
    const m = setup({ responses: [ok('{"n": "bukan angka"}'), ok('{"n": 5}')] });
    const r = await AIService.generate({ prompt: 'x', schema: schemaOK });
    assert.deepEqual(r.data, { n: 5 });
    const turns = m.calls[1].body.contents;
    assert.equal(turns.length, 3);
    assert.equal(turns[1].role, 'model');
    assert.match(turns[2].parts[0].text, /tidak valid/);
    assert.match(turns[2].parts[0].text, /\$\.n/);
});

test('terstruktur: tetap salah setelah perbaikan -> INVALID_JSON membawa teks mentah', async () => {
    const m = setup({ responses: [ok('{"x":1}'), ok('bukan json sama sekali')] });
    await assert.rejects(AIService.generate({ prompt: 'x', schema: schemaOK }), e => e.code === 'INVALID_JSON' && e.raw === 'bukan json sama sekali');
    assert.equal(m.calls.length, 2);
});

// ---------- privasi ----------
test('jaring pengaman privasi: permintaan memuat nama/NIS ditolak sebelum dikirim', async () => {
    const pii = Anonymizer.create({ students: stu, guardians: grd });
    const m = setup({ responses: [ok('x')] });
    await assert.rejects(AIService.generate({ prompt: 'Narasi untuk Budi Santoso', pii }), e => e.code === 'PII_BLOCKED' && !/Budi/.test(e.message));
    assert.equal(m.calls.length, 0);
    await assert.rejects(AIService.generate({ prompt: 'ok', system: 'NIS 12345', pii }), e => e.code === 'PII_BLOCKED');
    const m2 = setup({ responses: [ok('[S01] naik')] });
    const r = await AIService.generate({ prompt: pii.scrub('Narasi untuk Budi Santoso'), pii });
    assert.equal(pii.restore(r.text), 'Budi Santoso naik');
    assert.equal(m2.calls.length, 1);
    assert.ok(!m2.calls[0].init.body.includes('Budi'));
    const m3 = setup({ cfg: { allowNames: true }, responses: [ok('x')] });
    await AIService.generate({ prompt: 'Budi Santoso', pii });
    assert.equal(m3.calls.length, 1);
});

test('PDF dilampirkan sebagai inlineData', async () => {
    const m = setup({ responses: [ok('x')] });
    await AIService.generate({ prompt: 'baca', inline: [{ mimeType: 'application/pdf', data: 'QUJD' }] });
    assert.deepEqual(m.calls[0].body.contents[0].parts[1], { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } });
});

// ---------- pemakaian & ping ----------
test('penghitung pemakaian: permintaan dan token dicatat per hari dan per tugas', async () => {
    const m = setup({ responses: [ok('a'), httpErr(503, {}), ok('b')] });
    await AIService.generate({ task: 'soal', prompt: 'x' });
    await AIService.generate({ task: 'soal', prompt: 'x' });
    const u = m.usage();
    assert.equal(u.date, '2026-11-22');
    assert.equal(u.requests, 3);          // 1 + (503 + ulang)
    assert.equal(u.tokens, 84);           // dua jawaban x 42
    assert.equal(u.byTask.soal, 3);
});

test('ping: sukses melaporkan model, gaya, dan token', async () => {
    setup({ responses: [ok('{"ok": true}')] });
    const r = await AIService.ping();
    assert.equal(r.ok, true);
    assert.equal(r.model, 'gemini-test');
    assert.equal(r.style, 'format');
    assert.equal(r.tokens, 42);
});

// ---------- uji koneksi dua tahap ----------
const proxyCfg = { mode: 'proxy', proxyUrl: 'https://script.google.com/macros/s/X/exec' };
const pingOk = { status: 200, json: { ok: true, status: 200, ping: true } };
const wrap = r => ({ status: 200, json: { ok: true, status: 200, data: r.json } });

test('ping mode proxy: tahap 1 (op ping, tanpa Gemini) lalu tahap 2 (Gemini), urutan dan tahap dilaporkan', async () => {
    const m = setup({ cfg: proxyCfg, secret: 'TOK', responses: [pingOk, wrap(ok('{"ok": true}'))] });
    const stages = [];
    const r = await AIService.ping(undefined, s => stages.push(s));
    assert.deepEqual(stages, ['proxy', 'gemini']);
    assert.equal(m.calls.length, 2);
    assert.deepEqual(m.calls[0].body, { token: 'TOK', op: 'ping' });
    assert.ok(m.calls[1].body.request);
    assert.equal(r.ok, true); assert.ok(r.proxyMs >= 0);
});

test('ping mode langsung: hanya tahap Gemini', async () => {
    const m = setup({ responses: [ok('{"ok": true}')] });
    const stages = [];
    const r = await AIService.ping(undefined, s => stages.push(s));
    assert.deepEqual(stages, ['gemini']); assert.equal(m.calls.length, 1); assert.equal(r.proxyMs, null);
});

test('ping: galat tahap 1 membedakan token salah, kode proxy lama, belum dikonfigurasi, tak terjangkau', async () => {
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { proxyError: 'AUTH' } }] });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_AUTH');
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { proxyError: 'BAD_REQUEST' } }] });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_OLD' && /New version/.test(e.message));
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { ok: true, status: 200, data: {} } }] });   // proxy lama tanpa ping
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_OLD');
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { proxyError: 'CONFIG' } }] });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_CONFIG' && /GEMINI_API_KEY/.test(e.message));
    setup({ cfg: proxyCfg, responses: [new TypeError('Failed to fetch')] });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_UNREACHABLE' && /Siapa saja/.test(e.message));
    setup({ cfg: proxyCfg, responses: [() => ({ status: 200, json: async () => { throw new Error('<html>'); } })] });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_CONFIG');
});

test('ping: proxy tidak menjawab -> PROXY_TIMEOUT (tahap 1) dan Gemini tidak dihubungi', async () => {
    const hang = (url, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const m = setup({ cfg: proxyCfg, responses: [hang] });
    AIService.use({ proxyPingMs: 20 });
    await assert.rejects(AIService.ping(), e => e.code === 'PROXY_TIMEOUT' && /Executions/.test(e.message));
    assert.equal(m.calls.length, 1);
    AIService.use({ proxyPingMs: 20000 });
});

test('ping: proxy sehat tetapi Gemini lambat -> TIMEOUT dengan pesan yang menyebut tahap 2 dan ms proxy', async () => {
    const hang = (url, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    setup({ cfg: proxyCfg, responses: [pingOk, hang] });
    AIService.use({ pingMs: 25 });
    await assert.rejects(AIService.ping(), e => e.code === 'TIMEOUT' && e.stage === 'gemini' && /Proxy terhubung/.test(e.message) && /60 detik/.test(e.message));
    setup({ responses: [hang] });
    await assert.rejects(AIService.ping(), e => e.code === 'TIMEOUT' && /VPN/.test(e.message));
    AIService.use({ pingMs: 60000 });
});

test('ping: prasyarat dicek sebelum jaringan', async () => {
    const m = setup({ cfg: { enabled: false } });
    await assert.rejects(AIService.ping(), e => e.code === 'DISABLED');
    assert.equal(m.calls.length, 0);
});

test('model cadangan: 503 berulang pada model utama -> pindah sekali ke model cadangan dan berhasil', async () => {
    const m = setup({ cfg: { model: 'gemini-utama', fallbackModel: 'gemini-cadangan' }, responses: [httpErr(503, {}), httpErr(503, {}), httpErr(503, {}), ok('dari cadangan')] });
    const r = await AIService.generate({ prompt: 'x' });
    assert.equal(r.text, 'dari cadangan'); assert.equal(r.fallback, true); assert.equal(r.model, 'gemini-cadangan');
    assert.ok(m.calls[0].url.includes('gemini-utama')); assert.ok(m.calls[3].url.includes('gemini-cadangan'));
});

test('model cadangan: tidak dipakai untuk galat non-5xx, dan hanya sekali', async () => {
    const m = setup({ cfg: { model: 'u', fallbackModel: 'c' }, responses: [httpErr(403, {}), ok('x')] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'AUTH');
    assert.equal(m.calls.length, 1);
    const m2 = setup({ cfg: { model: 'u', fallbackModel: 'c' }, responses: Array(6).fill(0).map(() => httpErr(503, {})) });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'SERVER');
    assert.equal(m2.calls.length, 6);                              // 3 pada utama + 3 pada cadangan, lalu berhenti
    const m3 = setup({ cfg: { model: 'sama', fallbackModel: 'sama' }, responses: [httpErr(503, {}), httpErr(503, {}), httpErr(503, {})] });
    await assert.rejects(AIService.generate({ prompt: 'x' }), e => e.code === 'SERVER');
    assert.equal(m3.calls.length, 3);
});

test('ping melaporkan pemakaian model cadangan', async () => {
    setup({ cfg: { model: 'u', fallbackModel: 'c' }, responses: [httpErr(503, {}), httpErr(503, {}), httpErr(503, {}), ok('{"ok": true}')] });
    const r = await AIService.ping();
    assert.equal(r.fallback, true); assert.equal(r.model, 'c');
});

// ---------- gaya ringkas (hanya fitur internal) ----------
const Prompts = require('../../js/ai/prompts.js');
test('terse: hanya dipakai bila fitur menandai terse DAN guru mengaktifkan; tugas dokumen tidak pernah', async () => {
    const m = setup({ cfg: { styleTerse: true }, responses: [ok('a'), ok('b'), ok('c')] });
    await AIService.generate({ task: 'interpretasi', prompt: 'x', terse: true });
    await AIService.generate({ task: 'modul', prompt: 'x' });                           // tidak menandai terse
    assert.ok(m.calls[0].body.systemInstruction.parts[0].text.includes(Prompts.TERSE));
    assert.ok(m.calls[0].body.systemInstruction.parts[0].text.includes('Kurikulum Merdeka'));     // basis tetap ada
    assert.ok(!m.calls[1].body.systemInstruction.parts[0].text.includes('Gaya jawaban ringkas'));
    const m2 = setup({ cfg: { styleTerse: false }, responses: [ok('a')] });
    await AIService.generate({ task: 'interpretasi', prompt: 'x', terse: true });
    assert.ok(!m2.calls[0].body.systemInstruction.parts[0].text.includes('Gaya jawaban ringkas'));
});

test('terse: aturan menjaga kata negasi, angka, dan kalimat lengkap', () => {
    assert.match(Prompts.TERSE, /tidak/); assert.match(Prompts.TERSE, /bukan/); assert.match(Prompts.TERSE, /hanya/); assert.match(Prompts.TERSE, /kecuali/);
    assert.match(Prompts.TERSE, /angka/); assert.match(Prompts.TERSE, /lengkap dan sopan/);
});

test('pemakaian: token dicatat per tugas', async () => {
    const m = setup({ responses: [ok('a'), ok('b'), ok('c')] });
    await AIService.generate({ task: 'interpretasi', prompt: 'x' });
    await AIService.generate({ task: 'interpretasi', prompt: 'x' });
    await AIService.generate({ task: 'modul', prompt: 'x' });
    assert.deepEqual(m.usage().tokensByTask, { interpretasi: 84, modul: 42 });
});

// ---------- daftar model ----------
const mdl = (name, methods = ['generateContent'], displayName) => ({ name: 'models/' + name, displayName: displayName || name, supportedGenerationMethods: methods });
const LIST = [mdl('gemini-3.8-flash'), mdl('gemini-3.6-flash', undefined, 'Gemini 3.6 Flash'), mdl('gemini-3.5-flash-lite'), mdl('gemini-3.5-pro'),
    mdl('gemini-embedding-001', ['embedContent']), mdl('gemini-3.6-flash-preview-tts'), mdl('gemini-3.6-flash-image'), mdl('gemini-live-3'),
    mdl('gemini-3.6-flash-native-audio'), mdl('gemma-3-27b'), mdl('imagen-4', ['predict']), mdl('gemini-nongenerate', ['countTokens']), mdl('gemini-3.6-flash')];

test('filterModels: hanya gemini yang mendukung generateContent, tanpa embedding/tts/gambar/live, tanpa duplikat, flash lebih dulu', () => {
    const r = AIService.filterModels(LIST);
    assert.deepEqual(r.map(x => x.id), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-pro']);
    assert.equal(r.find(x => x.id === 'gemini-3.6-flash').label, 'Gemini 3.6 Flash');
    assert.deepEqual(AIService.filterModels(null), []);
});

test('listModels mode langsung: GET dengan header key, mengikuti halaman berikutnya', async () => {
    const m = setup({ responses: [
        { status: 200, json: { models: [mdl('gemini-3.6-flash')], nextPageToken: 'P2' } },
        { status: 200, json: { models: [mdl('gemini-3.5-flash-lite')] } }] });
    const r = await AIService.listModels();
    assert.deepEqual(r.map(x => x.id), ['gemini-3.5-flash-lite', 'gemini-3.6-flash']);
    assert.equal(m.calls.length, 2);
    assert.equal(m.calls[0].init.method, 'GET'); assert.equal(m.calls[0].init.headers['x-goog-api-key'], 'KEY-123');
    assert.ok(m.calls[0].url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'));
    assert.ok(!m.calls[0].url.includes('KEY-123')); assert.ok(m.calls[1].url.includes('pageToken=P2'));
});

test('listModels mode proxy: op models lewat proxy; galat dipetakan', async () => {
    const m = setup({ cfg: proxyCfg, secret: 'TOK', responses: [{ status: 200, json: { ok: true, status: 200, data: { models: [mdl('gemini-3.6-flash')] } } }] });
    assert.deepEqual((await AIService.listModels()).map(x => x.id), ['gemini-3.6-flash']);
    assert.deepEqual(m.calls[0].body, { token: 'TOK', op: 'models', pageToken: null });
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { proxyError: 'BAD_MODEL' } }] });
    await assert.rejects(AIService.listModels(), e => e.code === 'PROXY_OLD');
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { proxyError: 'AUTH' } }] });
    await assert.rejects(AIService.listModels(), e => e.code === 'PROXY_AUTH');
    setup({ cfg: proxyCfg, responses: [{ status: 200, json: { ok: false, status: 403, data: { error: {} } } }] });
    await assert.rejects(AIService.listModels(), e => e.code === 'AUTH');
    setup({ responses: [httpErr(403, {})] });
    await assert.rejects(AIService.listModels(), e => e.code === 'AUTH');
    setup({ responses: [{ status: 200, json: {} }] });
    await assert.rejects(AIService.listModels(), e => e.code === 'EMPTY');
    setup({ secret: '' });
    await assert.rejects(AIService.listModels(), e => e.code === 'NOT_CONFIGURED');
});
