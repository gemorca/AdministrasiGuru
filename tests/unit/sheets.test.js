const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

/** Spreadsheet tiruan di memori: cukup untuk menguji logika Sheets.gs tanpa Google. */
const googleTokens = {};
const gtok = (email, over = {}) => { const k = ('tok-' + email + '-' + Math.random()).padEnd(120, 'x'); googleTokens[k] = { aud: 'cid-123', email, email_verified: 'true', name: 'Nama Google', exp: String(Math.floor(Date.now() / 1000) + 3600), ...over }; return k; };

function makeBackend(props = {}) {
    const sheets = {};
    const mkSheet = name => {
        const data = []; // data[r][c], 0-based
        const sh = {
            name, data,
            getLastRow: () => data.length,
            setFrozenRows() {},
            appendRow(row) { data.push(row.slice()); },
            deleteRow(r) { data.splice(r - 1, 1); },
            getRange(r, c, nr = 1, nc = 1) {
                if (typeof r === 'string') return { setNumberFormat() {} };
                return {
                    setNumberFormat() { return this; },
                    setFontWeight() { return this; },
                    getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
                    setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { (data[r - 1 + i] = data[r - 1 + i] || [])[c - 1 + j] = String(v); })); return this; },
                    setValue(v) { (data[r - 1] = data[r - 1] || [])[c - 1] = String(v); return this; }
                };
            }
        };
        return sh;
    };
    const ss = {
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = mkSheet(n)),
        getUrl: () => 'https://sheet.test'
    };
    const store = { ...props };
    const cacheStore = new Map();
    const sandbox = {
        console, JSON, Date, Math, Object, Array, String, Number, parseInt, Error,
        Logger: { log() {} },
        UrlFetchApp: { fetch: url => { const cred = decodeURIComponent(url.split('id_token=')[1]); const d = googleTokens[cred]; return { getResponseCode: () => d ? 200 : 400, getContentText: () => JSON.stringify(d || { error: 'invalid' }) }; } },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
        SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); } }) },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        CacheService: { getScriptCache: () => ({ get: k => cacheStore.get(k) ?? null, put: (k, v) => cacheStore.set(k, v), remove: k => cacheStore.delete(k) }) },
        Utilities: {
            DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
            computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
            getUuid: () => crypto.randomUUID()
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Sheets.gs'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), sandbox); // fungsi bersama (safeEquals_) seperti di proyek Apps Script asli
    return { call: req => JSON.parse(JSON.stringify(sandbox.handleSheets_(JSON.parse(JSON.stringify(req))))), sheets, store };
}

const reg = (b, over = {}) => b.call({ action: 'register', name: 'Budi', email: 'budi@mail.com', password: 'rahasia123', school: 'SMPN 1', ...over });

test('register pertama menjadi admin, menyimpan nama sekolah, kata sandi tidak tersimpan polos', () => {
    const b = makeBackend();
    assert.deepEqual(b.call({ action: 'status' }), { ok: true, hasUsers: false, needsCode: false, schoolName: '', googleClientId: '' });
    const r = reg(b);
    assert.equal(r.ok, true);
    assert.equal(r.role, 'admin');
    assert.equal(r.school_name, 'SMPN 1');
    assert.ok(r.token.length >= 32);
    const dump = JSON.stringify(b.sheets['Pengguna'].data) + JSON.stringify(b.sheets['Sesi'].data);
    assert.ok(!dump.includes('rahasia123'));
    assert.ok(!dump.includes(r.token)); // hanya hash token yang disimpan
});

test('register: validasi dan email ganda', () => {
    const b = makeBackend();
    assert.equal(reg(b, { school: '' }).reason, 'SCHOOL_REQUIRED');
    assert.equal(reg(b, { password: 'pendek' }).reason, 'PASSWORD_WEAK');
    assert.equal(reg(b, { email: 'bukan-email' }).reason, 'EMAIL_INVALID');
    assert.equal(reg(b, { name: '' }).reason, 'NAME_REQUIRED');
    assert.equal(reg(b).ok, true);
    assert.equal(reg(b).reason, 'EMAIL_EXISTS');
});

test('register berikutnya = guru; kode pendaftaran dan undangan peran dihormati', () => {
    const b = makeBackend({ REG_CODE: 'KODE-SEKOLAH' });
    const admin = reg(b);
    assert.equal(b.call({ action: 'status' }).needsCode, true);
    assert.equal(reg(b, { email: 'ani@mail.com' }).reason, 'BAD_CODE');
    const t = reg(b, { email: 'ani@mail.com', code: 'KODE-SEKOLAH' });
    assert.equal(t.ok, true);
    assert.equal(t.role, 'teacher');
    // admin menetapkan peran admin untuk email tertentu: tidak butuh kode
    assert.equal(b.call({ action: 'invite', token: admin.token, email: 'wakil@mail.com', role: 'admin' }).ok, true);
    const w = reg(b, { email: 'wakil@mail.com', name: 'Wakil' });
    assert.equal(w.role, 'admin');
    // guru tidak boleh memakai endpoint admin
    assert.equal(b.call({ action: 'team', token: t.token }).error, 'FORBIDDEN');
});

test('login: sukses, salah sandi, pembatasan percobaan, logout mencabut sesi', () => {
    const b = makeBackend();
    reg(b);
    const bad = b.call({ action: 'login', email: 'budi@mail.com', password: 'salah' });
    assert.equal(bad.reason, 'BAD_CREDENTIALS');
    assert.equal(b.call({ action: 'login', email: 'tidak@ada.com', password: 'x' }).reason, 'BAD_CREDENTIALS');
    const ok = b.call({ action: 'login', email: 'BUDI@mail.com', password: 'rahasia123' });
    assert.equal(ok.ok, true);
    assert.equal(b.call({ action: 'me', token: ok.token }).email, 'budi@mail.com');
    b.call({ action: 'logout', token: ok.token });
    assert.equal(b.call({ action: 'me', token: ok.token }).error, 'AUTH');
    for (let i = 0; i < 6; i++) b.call({ action: 'login', email: 'budi@mail.com', password: 'salah' });
    assert.equal(b.call({ action: 'login', email: 'budi@mail.com', password: 'rahasia123' }).reason, 'LOCKED');
});

test('tanpa token / token palsu ditolak', () => {
    const b = makeBackend();
    reg(b);
    assert.equal(b.call({ action: 'pull', since: 0 }).error, 'AUTH');
    assert.equal(b.call({ action: 'push', items: [], token: 'x'.repeat(40) }).error, 'AUTH');
});

test('push/pull: isolasi data guru, data sekolah dibagi, hanya admin menulis tabel sekolah', () => {
    const b = makeBackend();
    const admin = reg(b);
    const guru = reg(b, { email: 'ani@mail.com', name: 'Ani' });
    const guru2 = reg(b, { email: 'eko@mail.com', name: 'Eko' });
    const at = '2026-01-01T00:00:00.000Z';

    const pa = b.call({ action: 'push', token: admin.token, items: [
        { tbl: 'g_cls', id: 'CLS-1', data: { classId: 'CLS-1', className: 'VII.1' }, client_at: at },
        { tbl: 'g_set', id: 'settings', data: { teacher: 'Budi' }, client_at: at }
    ] });
    assert.equal(pa.ok, true); assert.equal(pa.rejected.length, 0);

    const pg = b.call({ action: 'push', token: guru.token, items: [
        { tbl: 'g_cls', id: 'CLS-HACK', data: { classId: 'CLS-HACK' }, client_at: at },       // ditolak: bukan admin
        { tbl: 'g_scr', id: 'SCR-1', data: { id: 'SCR-1', value: 90 }, client_at: at },
        { tbl: 'g_set', id: 'settings', data: { teacher: 'Ani' }, client_at: at },
        { tbl: 'tabel_aneh', id: 'x', data: {}, client_at: at }                               // ditolak: tabel tidak dikenal
    ] });
    assert.deepEqual(pg.rejected.map(r => r.id).sort(), ['CLS-HACK', 'x']);

    const pull = tok => b.call({ action: 'pull', token: tok, since: 0, limit: 500 });
    const ra = pull(admin.token).rows, rg = pull(guru.token).rows, re = pull(guru2.token).rows;
    assert.deepEqual(ra.map(r => r.id).sort(), ['CLS-1', 'settings']);
    assert.equal(ra.find(r => r.id === 'settings').data.teacher, 'Budi');
    assert.deepEqual(rg.map(r => r.id).sort(), ['CLS-1', 'SCR-1', 'settings']);
    assert.equal(rg.find(r => r.id === 'settings').data.teacher, 'Ani');   // pengaturan per guru, tidak bentrok
    assert.deepEqual(re.map(r => r.id), ['CLS-1']);                         // guru lain tidak melihat nilai Ani
    assert.equal(rg.find(r => r.id === 'CLS-1').owner_id, null);
});

test('update menimpa baris yang sama, hapus menjadi tombstone, seq naik dan pull berhalaman', () => {
    const b = makeBackend();
    const u = reg(b);
    const at = '2026-01-01T00:00:00.000Z';
    b.call({ action: 'push', token: u.token, items: [{ tbl: 'g_jour', id: 'J1', data: { id: 'J1', t: 'a' }, client_at: at }] });
    b.call({ action: 'push', token: u.token, items: [{ tbl: 'g_jour', id: 'J1', data: { id: 'J1', t: 'b' }, client_at: at }] });
    assert.equal(b.sheets['Data'].data.length, 2); // header + 1 baris
    let r = b.call({ action: 'pull', token: u.token, since: 0 });
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].data.t, 'b');
    b.call({ action: 'push', token: u.token, items: [{ tbl: 'g_jour', id: 'J1', deleted: true, data: null, client_at: at }] });
    r = b.call({ action: 'pull', token: u.token, since: 0 });
    assert.equal(r.rows[0].deleted, true);
    assert.equal(r.rows[0].data, null);

    const many = Array.from({ length: 30 }, (_, i) => ({ tbl: 'g_jour', id: 'M' + i, data: { id: 'M' + i }, client_at: at }));
    b.call({ action: 'push', token: u.token, items: many });
    const p1 = b.call({ action: 'pull', token: u.token, since: 0, limit: 10 });
    assert.equal(p1.rows.length, 10); assert.equal(p1.has_more, true);
    const p2 = b.call({ action: 'pull', token: u.token, since: p1.last_seq, limit: 500 });
    assert.equal(p2.has_more, false);
    assert.equal(p1.rows.length + p2.rows.length, 31);
    const after = b.call({ action: 'pull', token: u.token, since: p2.last_seq });
    assert.equal(after.rows.length, 0);
});

test('catatan besar dipecah ke beberapa sel dan utuh saat dibaca; terlalu besar ditolak; banyak update sekaligus', () => {
    const b = makeBackend();
    const u = reg(b);
    const big = { id: 'B1', text: 'x'.repeat(120000) };
    const r = b.call({ action: 'push', token: u.token, items: [{ tbl: 'g_docs', id: 'B1', data: big, client_at: 'x' }] });
    assert.equal(r.rejected.length, 0);
    assert.equal(b.call({ action: 'pull', token: u.token, since: 0 }).rows[0].data.text.length, 120000);
    const huge = b.call({ action: 'push', token: u.token, items: [{ tbl: 'g_docs', id: 'H', data: { t: 'y'.repeat(400000) }, client_at: 'x' }] });
    assert.equal(huge.rejected[0].reason, 'TOO_LARGE');

    const items = Array.from({ length: 40 }, (_, i) => ({ tbl: 'g_jour', id: 'K' + i, data: { id: 'K' + i, v: 1 }, client_at: 'x' }));
    b.call({ action: 'push', token: u.token, items });
    b.call({ action: 'push', token: u.token, items: items.map(i => ({ ...i, data: { ...i.data, v: 2 } })) }); // jalur tulis massal
    const rows = b.call({ action: 'pull', token: u.token, since: 0 }).rows.filter(x => x.tbl === 'g_jour');
    assert.equal(rows.length, 40);
    assert.ok(rows.every(x => x.data.v === 2));
});

test('admin: kelola anggota, reset sandi, peran terakhir terlindungi, anggota dikeluarkan kehilangan akses', () => {
    const b = makeBackend();
    const admin = reg(b);
    const guru = reg(b, { email: 'ani@mail.com', name: 'Ani' });
    const team = b.call({ action: 'team', token: admin.token });
    assert.equal(team.members.length, 2);
    const ani = team.members.find(m => m.email === 'ani@mail.com');
    const bud = team.members.find(m => m.email === 'budi@mail.com');

    assert.equal(b.call({ action: 'set_role', token: admin.token, user_id: bud.user_id, role: 'teacher' }).reason, 'LAST_ADMIN');
    assert.equal(b.call({ action: 'remove_member', token: admin.token, user_id: bud.user_id }).reason, 'SELF');

    const rp = b.call({ action: 'reset_password', token: admin.token, user_id: ani.user_id });
    assert.equal(rp.ok, true);
    assert.equal(b.call({ action: 'me', token: guru.token }).error, 'AUTH'); // sesi lama dicabut
    assert.equal(b.call({ action: 'login', email: 'ani@mail.com', password: rp.tempPassword }).ok, true);
    assert.equal(b.call({ action: 'login', email: 'ani@mail.com', password: 'rahasia123' }).reason, 'BAD_CREDENTIALS');

    const ch = b.call({ action: 'login', email: 'ani@mail.com', password: rp.tempPassword });
    assert.equal(b.call({ action: 'change_password', token: ch.token, oldPassword: 'salah', newPassword: 'barubaru123' }).reason, 'BAD_CREDENTIALS');
    assert.equal(b.call({ action: 'change_password', token: ch.token, oldPassword: rp.tempPassword, newPassword: 'barubaru123' }).ok, true);
    assert.equal(b.call({ action: 'login', email: 'ani@mail.com', password: 'barubaru123' }).ok, true);

    assert.equal(b.call({ action: 'remove_member', token: admin.token, user_id: ani.user_id }).ok, true);
    assert.equal(b.call({ action: 'me', token: ch.token }).error, 'AUTH');
    assert.equal(b.call({ action: 'login', email: 'ani@mail.com', password: 'barubaru123' }).reason, 'BAD_CREDENTIALS');
});

test('google_login: verifikasi token, pendaftar pertama admin, guru baru butuh kode, akun lama langsung masuk', () => {
    const b = makeBackend({ GOOGLE_CLIENT_ID: 'cid-123', REG_CODE: 'KODE' });
    assert.equal(b.call({ action: 'status' }).googleClientId, 'cid-123');
    assert.equal(b.call({ action: 'google_login', credential: 'palsu'.padEnd(120, 'x') }).reason, 'GOOGLE_INVALID');
    assert.equal(b.call({ action: 'google_login', credential: gtok('a@mail.com', { aud: 'cid-lain' }) }).reason, 'GOOGLE_INVALID');
    assert.equal(b.call({ action: 'google_login', credential: gtok('a@mail.com', { email_verified: 'false' }) }).reason, 'GOOGLE_INVALID');
    assert.equal(b.call({ action: 'google_login', credential: gtok('a@mail.com', { exp: '1' }) }).reason, 'GOOGLE_INVALID');

    const first = b.call({ action: 'google_login', credential: gtok('kepsek@mail.com') });
    assert.equal(first.reason, 'SCHOOL_REQUIRED');
    assert.equal(first.email, 'kepsek@mail.com');
    const adm = b.call({ action: 'google_login', credential: gtok('kepsek@mail.com'), school: 'SMPN 9', name: 'Kepsek' });
    assert.equal(adm.role, 'admin'); assert.equal(adm.school_name, 'SMPN 9');

    assert.equal(b.call({ action: 'google_login', credential: gtok('guru@mail.com') }).reason, 'BAD_CODE');
    const g = b.call({ action: 'google_login', credential: gtok('guru@mail.com'), code: 'KODE' });
    assert.equal(g.role, 'teacher');
    // masuk lagi tanpa kode; email sama dengan akun sandi juga bisa lewat Google
    assert.equal(b.call({ action: 'google_login', credential: gtok('guru@mail.com') }).ok, true);
    assert.equal(b.call({ action: 'google_login', credential: gtok('KEPSEK@mail.com') }).role, 'admin');
    // akun Google tidak bisa dimasuki dengan menebak sandi
    assert.equal(b.call({ action: 'login', email: 'guru@mail.com', password: 'apapun1234' }).reason, 'BAD_CREDENTIALS');
});

test('google_login tanpa GOOGLE_CLIENT_ID ditolak', () => {
    const b = makeBackend();
    assert.equal(b.call({ action: 'google_login', credential: gtok('a@mail.com') }).reason, 'GOOGLE_INVALID');
});

test('update_profile: memperbarui nama pengguna dan hanya admin yang dapat mengubah nama sekolah', () => {
    const b = makeBackend();
    const admin = reg(b);
    const guru = reg(b, { email: 'ani@mail.com', name: 'Ani' });

    assert.equal(b.call({ action: 'update_profile', token: guru.token, name: '   ' }).reason, 'NAME_REQUIRED');
    const upGuru = b.call({ action: 'update_profile', token: guru.token, name: 'Ani Wijaya, S.Pd.', school: 'Sekolah Palsu' });
    assert.equal(upGuru.ok, true);
    assert.equal(upGuru.name, 'Ani Wijaya, S.Pd.');
    assert.equal(upGuru.school_name, 'SMPN 1'); // guru tidak bisa mengubah nama sekolah

    const meGuru = b.call({ action: 'me', token: guru.token });
    assert.equal(meGuru.name, 'Ani Wijaya, S.Pd.');

    const upAdmin = b.call({ action: 'update_profile', token: admin.token, name: 'Budi Santoso, M.Pd.', school: 'SMP Negeri 2 Maju' });
    assert.equal(upAdmin.ok, true);
    assert.equal(upAdmin.name, 'Budi Santoso, M.Pd.');
    assert.equal(upAdmin.school_name, 'SMP Negeri 2 Maju');
});

test('google_login: ubah kata sandi pertama kali tanpa sandi saat ini, perubahan kedua wajib sandi saat ini', () => {
    const b = makeBackend({ GOOGLE_CLIENT_ID: 'cid-123' });
    const g = b.call({ action: 'google_login', credential: gtok('guru.google@mail.com'), school: 'SMPN 1', name: 'Guru Google' });
    assert.equal(g.ok, true);
    assert.equal(g.has_password, false);
    assert.equal(b.call({ action: 'me', token: g.token }).has_password, false);

    // Pertama kali membuat sandi: tidak perlu oldPassword
    const firstSet = b.call({ action: 'change_password', token: g.token, oldPassword: '', newPassword: 'sandibaru123' });
    assert.equal(firstSet.ok, true);
    assert.equal(firstSet.has_password, true);
    assert.equal(b.call({ action: 'me', token: g.token }).has_password, true);

    // Kini bisa masuk lewat email + sandi
    assert.equal(b.call({ action: 'login', email: 'guru.google@mail.com', password: 'sandibaru123' }).ok, true);

    // Perubahan kedua dan seterusnya: WAJIB mengisi oldPassword yang benar
    assert.equal(b.call({ action: 'change_password', token: g.token, oldPassword: '', newPassword: 'sandikedua456' }).reason, 'BAD_CREDENTIALS');
    assert.equal(b.call({ action: 'change_password', token: g.token, oldPassword: 'salah', newPassword: 'sandikedua456' }).reason, 'BAD_CREDENTIALS');
    assert.equal(b.call({ action: 'change_password', token: g.token, oldPassword: 'sandibaru123', newPassword: 'sandikedua456' }).ok, true);
    assert.equal(b.call({ action: 'login', email: 'guru.google@mail.com', password: 'sandikedua456' }).ok, true);
});
