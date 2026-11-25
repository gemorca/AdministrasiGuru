const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../../js/ai/schema.js');
const T = require('../../js/ai/tasks.js');

const rows = [
    { code: '[S01]', final: 88, pred: 'B', passed: true, attPct: 95, tpOk: [{ code: 'TP1', description: 'Menganalisis zat' }], tpWeak: [] },
    { code: '[S02]', final: 60, pred: 'D', passed: false, attPct: 70, tpOk: [], tpWeak: [{ code: 'TP2', description: 'Menjelaskan sifat zat' }] }
];
const ctx = { subject: 'IPA', fase: 'D', kktp: 75 };
const ok = (t, d) => assert.deepEqual(t.validate(d), []);
const bad = (t, d, re) => { const p = t.validate(d); assert.ok(p.length && re.test(p.join(' | ')), 'harus ditolak: ' + re + ' <- ' + JSON.stringify(p)); };

test('trendOf: naik, turun, stabil, data kurang', () => {
    assert.equal(T.trendOf([60, 62, 80, 85]), 'naik');
    assert.equal(T.trendOf([90, 88, 70, 65]), 'turun');
    assert.equal(T.trendOf([75, 76, 74, 75]), 'stabil');
    assert.equal(T.trendOf([80]), 'belum cukup data');
    assert.equal(T.trendOf([]), 'belum cukup data');
    assert.equal(T.trendOf([null, 'x', 70]), 'belum cukup data');
});

test('claimsPassed / claimsNotPassed membedakan penyangkal', () => {
    assert.ok(T.claimsPassed('Ananda telah tuntas.'));
    assert.ok(T.claimsPassed('Ananda menuntaskan semua TP.'));
    assert.ok(!T.claimsPassed('Ananda belum tuntas pada TP2.'));
    assert.ok(!T.claimsPassed('Ananda tidak tuntas.'));
    assert.ok(!T.claimsPassed('Ketuntasan belajar masih dikejar.'));
    assert.ok(T.claimsNotPassed('Ananda belum mencapai KKTP.'));
    assert.ok(!T.claimsNotPassed('Ananda mencapai KKTP.'));
});

test('rapor.build: hanya kode, tanpa nama; skema dan batch', () => {
    const t = T.rapor.build({ rows, ctx });
    assert.ok(t.prompt.includes('[S01]') && t.prompt.includes('[S02]'));
    assert.ok(t.prompt.includes('KKTP = 75') && t.prompt.includes('TP2'));
    assert.equal(T.rapor.BATCH, 10);
    assert.deepEqual(Schema.validate(t.schema, { narasi: [{ kode: '[S01]', teks: 'x'.repeat(60) }] }), []);
    assert.ok(Schema.validate(t.schema, { narasi: [{ kode: '[S01]', teks: 'pendek' }] }).length > 0);
});

test('rapor.validate: lengkap, tanpa duplikat, tanpa kode asing, konsisten ketuntasan', () => {
    const t = T.rapor.build({ rows, ctx });
    const a = 'Ananda [S01] telah tuntas dengan nilai akhir 88 dan kehadiran 95 persen; pertahankan semangat belajarnya.';
    const b = 'Ananda [S02] belum tuntas, perlu menguatkan TP2 tentang sifat zat dengan latihan terbimbing di kelas.';
    ok(t, { narasi: [{ kode: '[S01]', teks: a }, { kode: '[S02]', teks: b }] });
    bad(t, { narasi: [{ kode: '[S01]', teks: a }] }, /\[S02\] belum diberi narasi/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a }, { kode: '[S01]', teks: a }, { kode: '[S02]', teks: b }] }, /lebih dari sekali/);
    bad(t, { narasi: [{ kode: '[S09]', teks: a }, { kode: '[S01]', teks: a }, { kode: '[S02]', teks: b }] }, /tidak ada dalam permintaan/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a + ' Sama seperti [S02].' }, { kode: '[S02]', teks: b }] }, /kode siswa lain/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a }, { kode: '[S02]', teks: 'Ananda [S02] telah tuntas seluruh kompetensi dengan sangat baik sekali.' }] }, /BELUM TUNTAS/);
    bad(t, { narasi: [{ kode: '[S01]', teks: 'Ananda [S01] belum mencapai KKTP dan perlu bimbingan tambahan di sekolah ini.' }, { kode: '[S02]', teks: b }] }, /TUNTAS, teks tidak boleh/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a + ' Ananda mengalami gangguan belajar.' }, { kode: '[S02]', teks: b }] }, /diagnosis/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a + ' Lihat www.contoh.com untuk detail.' }, { kode: '[S02]', teks: b }] }, /tautan/);
    bad(t, { narasi: [{ kode: '[S01]', teks: a + ' x'.repeat(400) }, { kode: '[S02]', teks: b }] }, /terlalu panjang/);
});

const prow = { code: '[S01]', final: 62, pred: 'D', passed: false, missing: [], trend: 'turun', attPct: 72, H: 18, S: 2, I: 1, A: 4, taskDone: 3, taskTotal: 6 };

test('progress.build: kode saja, fakta lengkap; nilai kosong tidak dikarang', () => {
    const t = T.progress.build({ row: prow, ctx });
    assert.ok(t.prompt.includes('[S01]') && t.prompt.includes('Tren nilai formatif dan sumatif: turun') && t.prompt.includes('3 dari 6 tugas'));
    const t2 = T.progress.build({ row: { ...prow, final: null, pred: '-', passed: false, missing: ['UTS'], trend: 'belum cukup data' }, ctx });
    assert.ok(t2.prompt.includes('belum lengkap (komponen kosong: UTS)') && !t2.prompt.includes('status Tuntas') );
    const t3 = T.progress.build({ row: { ...prow, taskTotal: 0, taskDone: 0 }, ctx });
    assert.ok(t3.prompt.includes('belum ada tugas'));
});

test('progress.validate: konsistensi status, diagnosis, kode, tautan', () => {
    const good = 'Ananda [S01] belum tuntas dengan nilai akhir 62 dan kehadiran 72 persen. Mohon dampingi ananda menyelesaikan tugas di rumah setiap hari.';
    ok(T.progress.build({ row: prow, ctx }), { laporan: good });
    bad(T.progress.build({ row: prow, ctx }), { laporan: 'Ananda [S01] telah tuntas dengan nilai akhir 62 dan kehadiran 72 persen, terus semangat ya ananda.' }, /BELUM TUNTAS/);
    bad(T.progress.build({ row: { ...prow, passed: true, final: 90 }, ctx }), { laporan: 'Ananda [S01] belum mencapai KKTP walau nilai akhir 90 dan kehadiran 72 persen, perlu dampingan tambahan.' }, /TUNTAS: teks/);
    bad(T.progress.build({ row: prow, ctx }), { laporan: good + ' Ananda tampak depresi.' }, /diagnosis/);
    bad(T.progress.build({ row: prow, ctx }), { laporan: good + ' Hubungi [S05].' }, /kode siswa lain/);
    bad(T.progress.build({ row: prow, ctx }), { laporan: good + ' https://contoh.id/x' }, /tautan/);
    const inc = { ...prow, final: null, pred: '-', passed: false, missing: ['UTS'] };
    bad(T.progress.build({ row: inc, ctx }), { laporan: 'Ananda [S01] belum tuntas pada semester ini karena nilai masih kurang dari target belajar.' }, /belum lengkap/);
    ok(T.progress.build({ row: inc, ctx }), { laporan: 'Capaian ananda [S01] belum dapat disimpulkan karena komponen UTS belum terisi; kehadiran ananda 72 persen.' });
});

const srow = { code: '[S01]', final: 62, pred: 'D', passed: false, attPct: 72, H: 18, S: 2, I: 1, A: 4, taskDone: 3, taskTotal: 6 };
const isi = 'Dengan hormat,\n\nKami mengundang Bapak/Ibu untuk berdiskusi tentang perkembangan ananda [S01] pada waktu yang akan kami informasikan kemudian.\n\nDemikian surat ini kami sampaikan. Terima kasih atas perhatian Bapak/Ibu.';

test('surat.build: hanya isi, data pendukung, larangan nomor/tanda tangan/tanggal', () => {
    const t = T.surat.build({ type: 'Pemanggilan Orang Tua / Wali', row: srow, ctx });
    assert.ok(t.prompt.includes('Pemanggilan Orang Tua / Wali') && t.prompt.includes('alpa 4') && t.prompt.includes('[S01]'));
    assert.ok(/JANGAN menulis nomor surat/.test(t.prompt) && /JANGAN mengarang tanggal/.test(t.prompt));
});

test('surat.validate: awalan, tanpa nomor/tanda tangan/tanggal/tautan/diagnosis/kode asing', () => {
    const t = T.surat.build({ type: 'X', row: srow, ctx });
    ok(t, { isi });
    bad(t, { isi: isi.replace('Dengan hormat,', 'Kepada Yth. Bapak/Ibu,') }, /Dengan hormat/);
    bad(t, { isi: isi + '\nNomor: 421/01' }, /nomor/);
    bad(t, { isi: isi + '\n\nHormat kami,\nKepala Sekolah' }, /tanda tangan/);
    bad(t, { isi: isi + ' Hadir pada 12/08/2026.' }, /tanggal/);
    bad(t, { isi: isi + ' Hadir pukul 08.00.' }, /tanggal atau jam/);
    bad(t, { isi: isi + ' Info di www.sekolah.id' }, /tautan/);
    bad(t, { isi: isi + ' Ananda mengalami trauma.' }, /diagnosis/);
    bad(t, { isi: isi + ' Juga [S03].' }, /kode siswa lain/);
});

test('surat.normalize: rapikan baris dan spasi', () => {
    assert.equal(T.surat.normalize('A  \r\n\r\n\r\n\r\nB \n'), 'A\n\nB');
});
