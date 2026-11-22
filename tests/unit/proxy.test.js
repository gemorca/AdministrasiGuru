const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeProxy(props = {}, fetchImpl) {
    const store = { GEMINI_API_KEY: 'REAL-GEMINI-KEY', APP_TOKEN: 'tok-secret-1234567890', ...props };
    const fetched = [], logs = [];
    const sandbox = {
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
        PropertiesService: { getScriptProperties: () => ({
            getProperty: k => (k in store ? store[k] : null),
            setProperty: (k, v) => { store[k] = v; } }) },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        Utilities: { formatDate: () => '2026-11-22' },
        Session: { getScriptTimeZone: () => 'Asia/Makassar' },
        UrlFetchApp: { fetch: (url, opt) => { fetched.push({ url, opt }); return fetchImpl ? fetchImpl(url, opt) : { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hai' }] } }] }) }; } },
        Logger: { log: x => logs.push(x) },
        console: { log: x => logs.push(x) }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), sandbox);
    const post = body => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
    return { post, fetched, logs, store, sandbox };
}
const good = { token: 'tok-secret-1234567890', model: 'gemini-3.8-flash', request: { contents: [{ parts: [{ text: 'RAHASIA ISI PERMINTAAN' }] }] } };

test('proxy: permintaan sah diteruskan ke Gemini dengan key di header, bukan URL', () => {
    const p = makeProxy();
    const r = p.post(good);
    assert.equal(r.ok, true); assert.equal(r.status, 200);
    assert.equal(r.data.candidates[0].content.parts[0].text, 'hai');
    const f = p.fetched[0];
    assert.equal(f.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(f.opt.headers['x-goog-api-key'], 'REAL-GEMINI-KEY');
    assert.ok(!f.url.includes('REAL-GEMINI-KEY'));
    assert.equal(f.opt.muteHttpExceptions, true);
    assert.deepEqual(JSON.parse(f.opt.payload), good.request);
});

test('proxy: key Gemini tidak pernah muncul di respons ke browser', () => {
    const p = makeProxy();
    assert.ok(!JSON.stringify(p.post(good)).includes('REAL-GEMINI-KEY'));
    assert.ok(!JSON.stringify(p.post({ ...good, token: 'salah' })).includes('REAL-GEMINI-KEY'));
});

test('proxy: token salah/kosong ditolak tanpa memanggil Gemini', () => {
    const p = makeProxy();
    assert.deepEqual(p.post({ ...good, token: 'salah' }), { proxyError: 'AUTH' });
    assert.deepEqual(p.post({ ...good, token: '' }), { proxyError: 'AUTH' });
    const { token, ...tanpa } = good;
    assert.deepEqual(p.post(tanpa), { proxyError: 'AUTH' });
    assert.deepEqual(p.post({ ...good, token: 'tok-secret-123456789X' }), { proxyError: 'AUTH' }); // panjang sama, beda isi
    assert.equal(p.fetched.length, 0);
});

test('proxy: model di luar pola gemini-* ditolak (tidak bisa dipakai menembak URL lain)', () => {
    const p = makeProxy();
    for (const m of ['', 'gpt-4', '../../evil', 'gemini-3.8-flash:evil', 'gemini-x/../y', 'GEMINI-1', 'gemini-' + 'a'.repeat(80)])
        assert.deepEqual(p.post({ ...good, model: m }), { proxyError: 'BAD_MODEL' }, m);
    assert.equal(p.fetched.length, 0);
});

test('proxy: isi permintaan rusak ditolak', () => {
    const p = makeProxy();
    assert.deepEqual(p.post('bukan json'), { proxyError: 'BAD_REQUEST' });
    assert.deepEqual(p.post({ ...good, request: null }), { proxyError: 'BAD_REQUEST' });
    assert.deepEqual(p.post({ ...good, request: 'teks' }), { proxyError: 'BAD_REQUEST' });
});

test('proxy: belum dikonfigurasi (tanpa key atau token) -> CONFIG', () => {
    assert.deepEqual(makeProxy({ GEMINI_API_KEY: '' }).post(good), { proxyError: 'CONFIG' });
    assert.deepEqual(makeProxy({ APP_TOKEN: '' }).post(good), { proxyError: 'CONFIG' });
});

test('proxy: batas harian DAILY_LIMIT ditegakkan dan reset saat ganti hari', () => {
    const p = makeProxy({ DAILY_LIMIT: '2' });
    assert.equal(p.post(good).ok, true);
    assert.equal(p.post(good).ok, true);
    assert.deepEqual(p.post(good), { proxyError: 'LIMIT' });
    assert.equal(p.fetched.length, 2);
    p.store.USAGE = JSON.stringify({ date: '2026-11-21', count: 99 });
    assert.equal(p.post(good).ok, true);
    assert.equal(JSON.parse(p.store.USAGE).count, 1);
});

test('proxy: batas bawaan 300 dan USAGE rusak tidak membuat crash', () => {
    const p = makeProxy({ USAGE: '{rusak' });
    assert.equal(p.post(good).ok, true);
    const q = makeProxy({ USAGE: JSON.stringify({ date: '2026-11-22', count: 300 }) });
    assert.deepEqual(q.post(good), { proxyError: 'LIMIT' });
});

test('proxy: galat Gemini diteruskan apa adanya dengan status aslinya', () => {
    const p = makeProxy({}, () => ({ getResponseCode: () => 429, getContentText: () => JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }) }));
    const r = p.post(good);
    assert.equal(r.ok, false); assert.equal(r.status, 429); assert.equal(r.data.error.status, 'RESOURCE_EXHAUSTED');
    const q = makeProxy({}, () => ({ getResponseCode: () => 502, getContentText: () => '<html>bad gateway</html>' }));
    const r2 = q.post(good);
    assert.equal(r2.status, 502); assert.ok(r2.data.error.message);
});

test('proxy: tidak menulis isi permintaan/jawaban ke log', () => {
    const p = makeProxy();
    p.post(good); p.post({ ...good, token: 'x' });
    assert.deepEqual(p.logs, []);
    const src = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
    assert.ok(!/Logger\.|console\./.test(src.split('function setupCheck')[0]));
});

test('proxy: doGet hanya menjawab status tanpa membuka konfigurasi', () => {
    const p = makeProxy();
    const t = p.sandbox.doGet().text;
    assert.deepEqual(JSON.parse(t), { ok: true, service: 'gemini-proxy' });
    assert.ok(!t.includes('REAL') && !t.includes('tok-'));
});

test('proxy: setupCheck memberi tahu konfigurasi tanpa membocorkan key ke log', () => {
    const p = makeProxy();
    p.sandbox.setupCheck();
    assert.ok(p.logs.some(l => /GEMINI_API_KEY: terisi/.test(l)));
    assert.ok(!p.logs.join('\n').includes('REAL-GEMINI-KEY'));
    assert.ok(p.logs.some(l => /APP_TOKEN: terisi/.test(l)));
    assert.equal(p.fetched[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
    const q = makeProxy({ GEMINI_API_KEY: '', APP_TOKEN: 'pendek' });
    q.sandbox.setupCheck();
    assert.ok(q.logs.some(l => /BELUM diisi/.test(l)) && q.logs.some(l => /terlalu pendek/.test(l)));
    assert.equal(q.fetched.length, 0);
});

test('proxy: op ping membuktikan token tanpa memanggil Gemini dan tanpa memotong batas harian', () => {
    const p = makeProxy({ DAILY_LIMIT: '1' });
    assert.deepEqual(p.post({ token: 'tok-secret-1234567890', op: 'ping' }), { ok: true, status: 200, ping: true });
    assert.deepEqual(p.post({ token: 'salah', op: 'ping' }), { proxyError: 'AUTH' });
    assert.equal(p.fetched.length, 0);
    assert.equal(p.store.USAGE, undefined);
    assert.equal(p.post(good).ok, true);          // batas 1 masih utuh setelah beberapa ping
    assert.deepEqual(makeProxy({ APP_TOKEN: '' }).post({ token: 'x', op: 'ping' }), { proxyError: 'CONFIG' });
});
