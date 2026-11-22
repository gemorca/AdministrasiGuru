const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../js/domain/grading.js');
const I = require('../../js/domain/itemAnalysis.js');

const full = (o = {}) => ({ formatif: [80], sumatif: [70], uts: 90, uas: 60, attPct: 100, ...o });

test('contoh PRD: bobot 40/30/15/15 dan nilai 80/70/90/60 = 75,5', () => {
    const r = G.compute(full(), { wForm: 40, wSum: 30, wUts: 15, wUas: 15 });
    assert.equal(r.final, 75.5);
    assert.equal(r.status, 'Tuntas');
});

test('bobot bawaan 30/30/20/20', () => {
    const r = G.compute(full(), {});
    assert.equal(r.final, 75); // 24 + 21 + 18 + 12
});

test('bobot dari pengaturan benar-benar dipakai', () => {
    const a = G.compute(full(), { wForm: 100, wSum: 0, wUts: 0, wUas: 0 });
    assert.equal(a.final, 80);
    const b = G.compute(full(), { wForm: 0, wSum: 0, wUts: 0, wUas: 100 });
    assert.equal(b.final, 60);
});

test('nilai kosong TIDAK diganti 80: status Belum Lengkap, tanpa nilai akhir', () => {
    const r = G.compute(full({ uas: null }), {});
    assert.equal(r.final, null);
    assert.equal(r.passed, false);
    assert.equal(r.status, 'Belum Lengkap');
    assert.deepEqual(r.missing, ['UAS']);
    assert.equal(r.pred, '-');
});

test('semua komponen kosong tetap Belum Lengkap', () => {
    const r = G.compute({ formatif: [], sumatif: [], uts: null, uas: null, attPct: 100 }, {});
    assert.equal(r.final, null);
    assert.equal(r.missing.length, 4);
});

test('kebijakan partial: bobot dinormalkan, ditandai Sementara, tidak pernah Tuntas', () => {
    const r = G.compute(full({ uas: null }), { missingPolicy: 'partial' });
    // (80*30 + 70*30 + 90*20) / 80 = 78,75 -> 78,8
    assert.equal(r.final, 78.8);
    assert.equal(r.partial, true);
    assert.equal(r.status, 'Sementara');
    assert.equal(r.passed, false);
});

test('nilai 0 dihitung sebagai nilai (bukan kosong)', () => {
    const r = G.compute(full({ uts: 0 }), {});
    assert.equal(r.uts, 0);
    assert.deepEqual(r.missing, []);
    assert.equal(r.final, 57); // 24 + 21 + 0 + 12
});

test('rata-rata formatif dan sumatif dari banyak asesmen, null diabaikan', () => {
    const r = G.compute(full({ formatif: [60, 80, null, ''], sumatif: [100] }), {});
    assert.equal(r.f, 70);
    assert.equal(r.sum, 100);
});

test('penalti kehadiran proporsional di bawah ambang', () => {
    const r = G.compute(full({ attPct: 60 }), { wForm: 40, wSum: 30, wUts: 15, wUas: 15 });
    assert.equal(r.final, 56.6); // 75,5 x 60/80 = 56,625
    assert.equal(r.penalized, true);
    assert.equal(r.passed, false);
});

test('penalti dapat dimatikan', () => {
    const r = G.compute(full({ attPct: 60 }), { attPenalty: false, attRequiredToPass: false });
    assert.equal(r.final, 75);
    assert.equal(r.passed, true);
});

test('syarat kehadiran untuk tuntas dapat dimatikan terpisah dari penalti', () => {
    const r = G.compute(full({ attPct: 90, formatif: [100], sumatif: [100], uts: 100, uas: 100 }), { attMin: 95, attPenalty: false, attRequiredToPass: false });
    assert.equal(r.passed, true);
    const r2 = G.compute(full({ attPct: 90, formatif: [100], sumatif: [100], uts: 100, uas: 100 }), { attMin: 95, attPenalty: false, attRequiredToPass: true });
    assert.equal(r2.passed, false);
});

test('ambang kehadiran dapat diubah', () => {
    const r = G.compute(full({ attPct: 70 }), { attMin: 70 });
    assert.equal(r.penalized, false);
    assert.equal(r.final, 75);
});

test('batas KKTP: tepat sama dengan KKTP = tuntas', () => {
    assert.equal(G.compute(full(), { kktp: 75 }).passed, true);
    assert.equal(G.compute(full(), { kktp: 75.1 }).passed, false);
});

test('predikat mengikuti batas yang dapat diatur', () => {
    assert.equal(G.predicate(90, G.config({})), 'A');
    assert.equal(G.predicate(89.9, G.config({})), 'B');
    assert.equal(G.predicate(70, G.config({})), 'C');
    assert.equal(G.predicate(69.9, G.config({})), 'D');
    assert.equal(G.predicate(85, G.config({ predA: 85, predB: 75, predC: 65 })), 'A');
    assert.equal(G.predicate(null, G.config({})), '-');
});

test('mode remedial kktp: lulus remedial menaikkan nilai paling tinggi ke KKTP', () => {
    const base = full({ formatif: [50], sumatif: [50], uts: 50, uas: 50 });
    assert.equal(G.compute(base, {}).final, 50);
    const r = G.compute({ ...base, remedialScore: 90 }, { remedialMode: 'kktp' });
    assert.equal(r.final, 75);
    assert.equal(r.remedialApplied, true);
    assert.equal(r.passed, true);
    const gagal = G.compute({ ...base, remedialScore: 60 }, { remedialMode: 'kktp' });
    assert.equal(gagal.final, 50);
    const catat = G.compute({ ...base, remedialScore: 90 }, { remedialMode: 'catat' });
    assert.equal(catat.final, 50);
});

test('validasi: total bobot harus 100', () => {
    assert.deepEqual(G.validate(G.config({})), []);
    assert.ok(G.validate(G.config({ wForm: 50 })).some(e => e.includes('100')));
    assert.ok(G.validate(G.config({ wForm: -10, wSum: 70 })).length > 0);
    assert.ok(G.validate(G.config({ predA: 60 })).some(e => e.includes('predikat')));
    assert.ok(G.validate(G.config({ kktp: 120 })).some(e => e.includes('KKTP')));
});

test('config mengabaikan nilai tidak valid dan memakai bawaan', () => {
    const c = G.config({ kktp: 'abc', wForm: '', attMin: null, attPenalty: undefined });
    assert.equal(c.kktp, 75);
    assert.equal(c.wForm, 30);
    assert.equal(c.attMin, 80);
    assert.equal(c.attPenalty, true);
});

test('hasil deterministik: input sama selalu hasil sama', () => {
    const a = JSON.stringify(G.compute(full(), {}));
    for (let i = 0; i < 50; i++) assert.equal(JSON.stringify(G.compute(full(), {})), a);
});

// ---------------- analisis butir ----------------
function pgSet() {
    // 10 siswa, 4 butir. Butir 1 mudah dan membedakan, butir 2 sukar, butir 3 terbalik (kunci salah), butir 4 semua benar.
    const key = ['A', 'B', 'C', 'D'];
    const rows = [
        ['A', 'B', 'A', 'D'], ['A', 'B', 'A', 'D'], ['A', 'B', 'A', 'D'], ['A', 'A', 'B', 'D'],
        ['A', 'A', 'B', 'D'], ['A', 'A', 'C', 'D'], ['B', 'A', 'C', 'D'], ['B', 'A', 'C', 'D'],
        ['B', 'A', 'C', 'D'], ['B', 'A', 'C', 'D']
    ];
    return I.fromDailyTest({ qCount: 4, type: 'PG', masterKey: key }, rows.map(a => ({ answers: a })));
}

test('analisis butir: tingkat kesukaran dan daya pembeda dihitung dari data', () => {
    const { items, students } = pgSet();
    const r = I.analyze(items, students);
    assert.equal(r.n, 10);
    assert.equal(r.items[0].p, 0.6);          // 6 dari 10 benar butir 1
    assert.equal(r.items[3].p, 1);            // butir 4 semua benar
    assert.equal(r.items[3].pLabel, 'Mudah');
    assert.equal(r.items[3].d, 0);            // semua benar: tidak membedakan
    assert.equal(r.items[3].dLabel, 'Kurang');
});

test('analisis butir: hasil identik pada pemanggilan berulang (tidak acak)', () => {
    const { items, students } = pgSet();
    const a = JSON.stringify(I.analyze(items, students));
    for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(I.analyze(items, students)), a);
});

test('analisis butir: daya pembeda negatif ditandai Buruk dan disarankan periksa kunci', () => {
    const { items, students } = pgSet();
    const r = I.analyze(items, students);
    const b3 = r.items[2]; // kunci C, kelompok bawah justru benar
    assert.ok(b3.d < 0, 'd=' + b3.d);
    assert.equal(b3.dLabel, 'Buruk');
    assert.match(b3.advice, /kunci/i);
});

test('analisis butir: catatan pengecoh pada butir PG', () => {
    const { items, students } = pgSet();
    const r = I.analyze(items, students);
    assert.ok(r.items[0].distractors.B.n === 4);
    assert.ok(Array.isArray(r.items[0].distractorNotes));
});

test('analisis butir: indikatif bila siswa < 10 dan KR-20 hanya untuk butir dikotomus', () => {
    const small = I.fromDailyTest({ qCount: 3, type: 'PG', masterKey: ['A', 'B', 'C'] },
        [{ answers: ['A', 'B', 'C'] }, { answers: ['A', 'B', 'A'] }, { answers: ['A', 'A', 'A'] }, { answers: ['B', 'A', 'A'] }]);
    const r = I.analyze(small.items, small.students);
    assert.equal(r.indicative, true);
    assert.ok(r.reliability !== null);
    const num = I.fromDailyTest({ qCount: 2, type: 'UR', masterKey: ['10', '5'] }, [{ answers: ['10', '2'] }, { answers: ['4', '5'] }]);
    const rn = I.analyze(num.items, num.students);
    assert.equal(rn.reliability, null);
    assert.equal(rn.items[0].p, 0.7); // (10+4)/2 / 10
});

test('analisis butir: data kosong tidak error', () => {
    const r = I.analyze([], []);
    assert.equal(r.n, 0);
    assert.deepEqual(r.items, []);
});
