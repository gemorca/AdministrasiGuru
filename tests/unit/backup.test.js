const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../js/domain/backup.js');

const tables = () => ({ students: [{ id: 'S1', name: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }, { id: 'S2', name: 'B', updatedAt: '2026-01-01T00:00:00.000Z' }],
    classes: [{ classId: 'C1' }], dailyScores: [{ testId: 'T1', studentId: 'S1', score: 5, updatedAt: '2026-01-01T00:00:00.000Z' }] });

test('build: berversi, counts, tanpa pengaturan AI', () => {
    const d = B.build({ settings: { school: 'X', ai: { enabled: true } }, tables: tables(), now: new Date('2026-02-01T00:00:00Z') });
    assert.equal(d.schemaVersion, 2); assert.equal(d.appName, B.APP_NAME);
    assert.equal(d.counts.students, 2); assert.equal(d.counts.cp, 0); assert.ok(Array.isArray(d.tp));
    assert.equal(d.settings.ai, undefined); assert.equal(d.createdAt, '2026-02-01T00:00:00.000Z');
    assert.equal(Object.keys(d.counts).length, B.TABLES.length);
});

test('parse: backup v2 hasil build valid', () => {
    const r = B.parse(JSON.stringify(B.build({ settings: {}, tables: tables() })));
    assert.ok(r.ok, r.problems.join(';')); assert.equal(r.schemaVersion, 2); assert.equal(r.legacy, false); assert.equal(r.counts.students, 2);
});

test('parse: backup lama (tanpa schemaVersion, tabel sebagian) tetap valid sebagai skema 1', () => {
    const r = B.parse(JSON.stringify({ appName: B.APP_NAME, backupVersion: '19.0', settings: { school: 'X' }, students: [{ id: 'S1' }] }));
    assert.ok(r.ok, r.problems.join(';')); assert.equal(r.legacy, true); assert.equal(r.schemaVersion, 1); assert.equal(r.counts.students, 1); assert.equal(r.counts.scores, 0);
});

test('parse: menolak JSON rusak, aplikasi lain, versi lebih baru, tabel rusak, counts tidak cocok', () => {
    assert.ok(!B.parse('{rusak').ok);
    assert.match(B.parse(JSON.stringify({ appName: 'Lain', settings: {} })).problems.join(), /bukan backup/);
    assert.match(B.parse('[]').problems.join(), /bukan objek/);
    assert.match(B.parse(JSON.stringify({ appName: B.APP_NAME, settings: {} , schemaVersion: 9 })).problems.join(), /lebih baru/);
    assert.match(B.parse(JSON.stringify({ appName: B.APP_NAME, settings: {}, students: 'x' })).problems.join(), /students rusak/);
    assert.match(B.parse(JSON.stringify({ appName: B.APP_NAME, settings: {}, students: [1] })).problems.join(), /baris yang rusak/);
    const d = B.build({ settings: {}, tables: tables() }); d.students.pop();
    assert.match(B.parse(JSON.stringify(d)).problems.join(), /students tidak lengkap: seharusnya 2 baris, terbaca 1/);
    const d2 = B.build({ settings: {}, tables: tables() }); delete d2.tp;
    assert.match(B.parse(JSON.stringify(d2)).problems.join(), /Tabel tp tidak ada/);
});

test('parse: ID ganda jadi peringatan, bukan galat', () => {
    const r = B.parse(JSON.stringify({ appName: B.APP_NAME, settings: {}, students: [{ id: 'S1' }, { id: 'S1' }] }));
    assert.ok(r.ok); assert.match(r.warnings.join(), /1 ID ganda/);
});

test('merge: tambah baru, ganti hanya bila updatedAt lebih baru, tidak menghapus data saat ini', () => {
    const cur = tables();
    const inc = { students: [{ id: 'S1', name: 'A-baru', updatedAt: '2026-03-01T00:00:00.000Z' }, { id: 'S2', name: 'B-lama', updatedAt: '2025-01-01T00:00:00.000Z' }, { id: 'S3', name: 'C' }],
        classes: [], dailyScores: [{ testId: 'T1', studentId: 'S1', score: 9, updatedAt: '2026-05-01T00:00:00.000Z' }, { testId: 'T1', studentId: 'S2', score: 7 }] };
    const snap = JSON.stringify(cur);
    const { tables: m, stats } = B.merge(cur, inc);
    assert.equal(JSON.stringify(cur), snap, 'masukan tidak berubah');
    assert.deepEqual(m.students.map(s => s.name), ['A-baru', 'B', 'C']);
    assert.equal(m.classes.length, 1);
    assert.deepEqual(m.dailyScores.map(s => s.score), [9, 7]);
    assert.equal(stats.byTable.students.updated, 1); assert.equal(stats.byTable.students.kept, 1); assert.equal(stats.byTable.students.added, 1);
    assert.equal(stats.added, 2); assert.equal(stats.updated, 2);
});

test('merge: record tanpa id tidak digandakan; record tanpa updatedAt tidak menimpa', () => {
    const { tables: m } = B.merge({ journals: [{ x: 1 }], students: [{ id: 'S1', name: 'lama' }] }, { journals: [{ x: 1 }, { x: 2 }], students: [{ id: 'S1', name: 'baru' }] });
    assert.equal(m.journals.length, 2); assert.equal(m.students[0].name, 'lama');
});

test('due: 7 hari, belum pernah, tanpa data', () => {
    const now = new Date('2026-02-10T00:00:00Z');
    assert.deepEqual(B.due('2026-02-04T00:00:00Z', now, true), { due: false, days: 6 });
    assert.deepEqual(B.due('2026-02-03T00:00:00Z', now, true), { due: true, days: 7 });
    assert.deepEqual(B.due('', now, true), { due: true, days: null });
    assert.deepEqual(B.due(null, now, false), { due: false, days: null });
    assert.deepEqual(B.due('bukan-tanggal', now, true), { due: true, days: null });
});
