const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../js/domain/package.js');

const Q = [
    { id: 'Q1', code: 'A-1', type: 'Pilihan Ganda', key: 'B', explanation: 'Karena B.' },
    { id: 'Q2', code: 'A-2', type: 'Uraian', key: '' },
    { id: 'Q3', code: 'A-3', type: 'Isian Singkat', key: '' },
];

test('allocate: total tepat 100 untuk berbagai n, sisa ke butir awal', () => {
    for (const n of [1, 2, 3, 7, 11, 40, 45]) {
        const a = P.allocate(n);
        assert.equal(a.length, n);
        assert.equal(Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100, 100, 'n=' + n);
        assert.ok(a.every(v => v > 0));
        assert.ok(Math.max(...a) - Math.min(...a) <= 0.01 + 1e-9);
    }
    assert.deepEqual(P.allocate(0), []);
    assert.deepEqual(P.allocate(3), [33.34, 33.33, 33.33]);
});

test('validate: nama, jenis, durasi, butir kosong/ganda/hilang', () => {
    const ok = { name: 'UH 1', kind: 'Formatif', duration: 60, questionIds: ['Q1', 'Q2'] };
    assert.deepEqual(P.validate(ok, Q), []);
    assert.deepEqual(P.validate({ ...ok, duration: '' }, Q), []);
    assert.match(P.validate({ ...ok, name: '  ' }, Q).join(), /Nama/);
    assert.match(P.validate({ ...ok, kind: 'X' }, Q).join(), /Jenis/);
    assert.match(P.validate({ ...ok, duration: 0 }, Q).join(), /Durasi/);
    assert.match(P.validate({ ...ok, duration: 301 }, Q).join(), /Durasi/);
    assert.match(P.validate({ ...ok, duration: 1.5 }, Q).join(), /Durasi/);
    assert.match(P.validate({ ...ok, questionIds: [] }, Q).join(), /minimal satu/);
    assert.match(P.validate({ ...ok, questionIds: ['Q1', 'Q1'] }, Q).join(), /dua kali/);
    assert.match(P.validate({ ...ok, questionIds: ['Q1', 'Q9'] }, Q).join(), /1 butir soal tidak ditemukan/);
});

test('answerKey: urutan paket, skor total 100, peringatan kunci kosong (kecuali Uraian) dan butir hilang', () => {
    const k = P.answerKey({ questionIds: ['Q3', 'Q1', 'Q2', 'Q9'] }, Q);
    assert.deepEqual(k.rows.map(r => r.code), ['A-3', 'A-1', 'A-2']);
    assert.equal(k.total, 100);
    assert.equal(k.rows[1].key, 'B');
    assert.ok(k.warnings.some(w => /Butir 1 \(A-3\) belum punya kunci/.test(w)));
    assert.ok(!k.warnings.some(w => /A-2/.test(w)), 'Uraian tanpa kunci tidak diperingatkan');
    assert.ok(k.warnings.some(w => /1 butir soal sudah dihapus/.test(w)));
});

test('prune: membuang id yang hilang', () => {
    assert.deepEqual(P.prune({ questionIds: ['Q1', 'Q9', 'Q2'] }, Q), { questionIds: ['Q1', 'Q2'], removed: 1 });
});
