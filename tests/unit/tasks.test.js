const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../../js/ai/schema.js');
const T = require('../../js/ai/tasks.js');
const AIService = require('../../js/ai/aiService.js');

const tp = { tpId: 'TP-1', code: 'TP-1.1', description: 'Peserta didik mampu menganalisis klasifikasi zat', iktp: '1. Mampu menganalisis (C4) klasifikasi zat' };

// ---------- skema dikirim ke Gemini ----------
test('sendableSchema: membuang kata kunci yang tidak didukung Gemini, validasi lokal tetap utuh', () => {
    const sent = AIService.sendableSchema(T.soal.schema);
    assert.ok(!JSON.stringify(sent).includes('minLength'));
    assert.ok(JSON.stringify(sent).includes('minItems'));
    assert.ok(JSON.stringify(T.soal.schema).includes('minLength'));
    assert.ok(Schema.validate(T.soal.schema, { soal: [{ tipe: 'Pilihan Ganda', pertanyaan: 'x', kunci: 'A', pembahasan: 'ok', level: 'C2', kesulitan: 'Mudah', indikator: 'Peserta didik' }] }).length > 0);
});

// ---------- CP ----------
const cpData = { butir: [
    { kompetensi: 'Menganalisis', materi: 'Klasifikasi zat', level: 'C4', tp: 'Melalui diskusi, peserta didik mampu menganalisis klasifikasi zat.', atp: 'Tahap analisis.', iktp: 'Mampu menganalisis (C4).', kktp: 'Mampu menganalisis dengan tepat.' },
    { kompetensi: 'Menyebutkan', materi: 'Jenis zat', level: 'C1', tp: 'Melalui membaca, peserta didik mampu menyebutkan jenis zat.', atp: 'Tahap mengenal.', iktp: 'Mampu menyebutkan (C1).', kktp: 'Menyebutkan dengan benar.' },
    { kompetensi: 'Menjelaskan', materi: 'Sifat zat', level: 'C2', tp: 'Peserta didik mampu menjelaskan sifat zat dengan\nbenar.', atp: 'Tahap paham.', iktp: 'Mampu menjelaskan (C2).', kktp: 'Menjelaskan dengan benar.' }] };

test('cp.build: memuat CP, fokus, referensi sebagai DATA; PDF dilampirkan inline', () => {
    const t = T.cp.build({ desc: 'CP asli', topic: 'zat padat', subject: 'IPA', fase: 'D', ref: { kind: 'text', name: 'buku.docx', text: 'ISI BUKU' } });
    assert.match(t.prompt, /CP asli/); assert.match(t.prompt, /zat padat/); assert.match(t.prompt, /<<<\nISI BUKU\n>>>/); assert.match(t.prompt, /DATA/);
    assert.equal(t.schema, T.cp.schema);
    const p = T.cp.build({ desc: 'x', ref: { kind: 'pdf', name: 'a.pdf', inline: { mimeType: 'application/pdf', data: 'QQ==' } } });
    assert.deepEqual(p.inline, [{ mimeType: 'application/pdf', data: 'QQ==' }]); assert.ok(!p.prompt.includes('QQ=='));
    const none = T.cp.build({ desc: 'x' }); assert.deepEqual(none.inline, []); assert.ok(!/undefined|null/.test(none.prompt));
});

test('cp.build: referensi teks disaring (scrub) sebelum dikirim', () => {
    const t = T.cp.build({ desc: 'x', ref: { kind: 'text', name: 'a', text: 'catatan Budi Santoso' }, scrub: s => s.replace('Budi Santoso', '[S01]') });
    assert.match(t.prompt, /\[S01\]/); assert.ok(!t.prompt.includes('Budi'));
});

test('cp.toFields: urut level naik, bernomor, satu baris, level tertinggi untuk uniCogLevel', () => {
    assert.deepEqual(Schema.validate(T.cp.schema, cpData), []);
    const f = T.cp.toFields(cpData);
    const lines = f.comp.split('\n');
    assert.equal(lines[0], '1. Menyebutkan [C1]'); assert.equal(lines[2], '3. Menganalisis [C4]');
    assert.equal(f.cogLevel, 'C4 (Menganalisis)');
    assert.equal(f.count, 3);
    for (const k of ['comp', 'mat', 'tp', 'atp', 'iktp', 'kktp']) {
        const ls = f[k].split('\n'); assert.equal(ls.length, 3, k);
        ls.forEach((l, i) => assert.match(l, new RegExp('^' + (i + 1) + '\\. \\S')));
    }
    assert.ok(!f.tp.includes('  ') && f.tp.split('\n')[1].includes('dengan benar.'));
});

test('cp.validate: TP kembar dan TP tanpa "peserta didik" ditolak', () => {
    assert.deepEqual(T.cp.validate(cpData), []);
    const dup = { butir: [cpData.butir[0], { ...cpData.butir[0] }] };
    assert.ok(T.cp.validate(dup).some(e => /duplikat/.test(e)));
    assert.ok(T.cp.validate({ butir: [{ ...cpData.butir[0], tp: 'Siswa mampu x' }] }).some(e => /peserta didik/.test(e)));
});

// ---------- Soal ----------
const base = { level: 'C3', kesulitan: 'Sedang', indikator: 'Peserta didik dapat menganalisis zat', pembahasan: 'Karena sifatnya.' };
const pg = { ...base, tipe: 'Pilihan Ganda', pertanyaan: 'Manakah yang termasuk zat padat?', opsi: ['Air', 'Batu', 'Udara', 'Uap'], kunci: 'B' };

test('soal.difficulty, plan, batches', () => {
    assert.deepEqual(T.soal.difficulty('HOTS (C4-C6)'), { kesulitan: 'Sulit', levels: 'C4 sampai C6' });
    assert.equal(T.soal.difficulty('Sedang (C3)').kesulitan, 'Sedang');
    assert.equal(T.soal.difficulty('Mudah (C1-C2)').kesulitan, 'Mudah');
    assert.deepEqual(T.soal.plan('Campuran', 8), ['Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Benar-Salah', 'Isian Singkat', 'Menjodohkan', 'Uraian', 'Pilihan Ganda', 'Pilihan Ganda Kompleks']);
    assert.deepEqual(T.soal.plan('Uraian', 2), ['Uraian', 'Uraian']);
    assert.equal(T.soal.plan('Sesuai Kisi-Kisi', 3), null);
    assert.deepEqual(T.soal.batches(20), [8, 8, 4]); assert.deepEqual(T.soal.batches(3), [3]);
});

test('soal.build: memuat TP, IKTP, rencana bentuk, kisi-kisi sebagai DATA, dan menghindari soal sudah ada', () => {
    const t = T.soal.build({ mode: 'soal', tp, iktp: tp.iktp, count: 3, plan: ['Pilihan Ganda', 'Uraian', 'Benar-Salah'], diff: T.soal.difficulty('HOTS'),
        kisi: { kind: 'text', name: 'kisi.docx', text: 'INDIKATOR 1' }, avoid: ['Soal lama satu'], offset: 8 });
    assert.match(t.prompt, /TP-1\.1/); assert.match(t.prompt, /9\. Pilihan Ganda/); assert.match(t.prompt, /11\. Benar-Salah/);
    assert.match(t.prompt, /<<<\nINDIKATOR 1\n>>>/); assert.match(t.prompt, /Soal lama satu/); assert.match(t.prompt, /Sulit/);
    const kisi = T.soal.build({ mode: 'kisi', tp, iktp: 'x', count: 4, plan: null, diff: { kesulitan: 'Campuran', levels: 'C1 sampai C4' } });
    assert.match(kisi.prompt, /KISI-KISI/); assert.match(kisi.prompt, /mengikuti kisi-kisi/);
});

test('soal.itemProblems: butir valid lolos, butir cacat ditolak', () => {
    assert.deepEqual(T.soal.itemProblems(pg), []);
    assert.ok(T.soal.itemProblems({ ...pg, opsi: ['A', 'B', 'C'] }).length);                     // 3 opsi
    assert.ok(T.soal.itemProblems({ ...pg, kunci: 'F' }).length);                                // kunci di luar opsi
    assert.ok(T.soal.itemProblems({ ...pg, opsi: ['Air', 'air', 'Udara', 'Uap'] }).length);      // opsi kembar
    assert.ok(T.soal.itemProblems({ ...pg, pertanyaan: 'Opsi A' }).length);                      // placeholder
    const pgk = { ...base, tipe: 'Pilihan Ganda Kompleks', pertanyaan: 'Pilih yang benar tentang zat!', opsi: ['a1', 'b2', 'c3', 'd4'], kunci: 'A, C' };
    assert.deepEqual(T.soal.itemProblems(pgk), []);
    assert.ok(T.soal.itemProblems({ ...pgk, kunci: 'A, B, C, D' }).length);
    assert.ok(T.soal.itemProblems({ ...pgk, kunci: 'Z' }).length);
    const bs = { ...base, tipe: 'Benar-Salah', pertanyaan: 'Air membeku pada 0 derajat Celsius.', kunci: 'Benar' };
    assert.deepEqual(T.soal.itemProblems(bs), []); assert.ok(T.soal.itemProblems({ ...bs, kunci: 'Mungkin' }).length);
    const mj = { ...base, tipe: 'Menjodohkan', pertanyaan: 'Jodohkan zat dengan wujudnya!', pasangan: [{ kiri: 'Air', kanan: 'Cair' }, { kiri: 'Batu', kanan: 'Padat' }, { kiri: 'Udara', kanan: 'Gas' }], kunci: '' };
    assert.deepEqual(T.soal.itemProblems(mj), []);
    assert.ok(T.soal.itemProblems({ ...mj, pasangan: mj.pasangan.slice(0, 2) }).length);
    assert.ok(T.soal.itemProblems({ ...mj, pasangan: [{ kiri: 'a', kanan: 'x' }, { kiri: 'b', kanan: 'x' }, { kiri: 'c', kanan: 'y' }] }).length);
    assert.ok(T.soal.itemProblems({ ...base, tipe: 'Isian Singkat', pertanyaan: 'Wujud air pada suhu kamar adalah ....', kunci: '' }).length);
    assert.ok(T.soal.itemProblems({ ...base, tipe: 'Uraian', pertanyaan: 'Jelaskan proses penguapan!', kunci: 'singkat' }).length);
});

test('soal.normalize: teks mengikuti format cetak, kunci dibersihkan', () => {
    const q = T.soal.normalize({ ...pg, kunci: ' b. ' });
    assert.equal(q.text, 'Manakah yang termasuk zat padat?\nA. Air\nB. Batu\nC. Udara\nD. Uap');
    assert.equal(q.key, 'B'); assert.equal(q.cog, 'C3'); assert.equal(q.diff, 'Sedang'); assert.equal(q.explanation, 'Karena sifatnya.');
    const k = T.soal.normalize({ ...base, tipe: 'Pilihan Ganda Kompleks', pertanyaan: 'Pilih yang benar!!', opsi: ['a', 'b', 'c', 'd'], kunci: 'a;c' });
    assert.match(k.text, /\[ \] A\. a\n\[ \] B\. b/); assert.equal(k.key, 'A, C');
    assert.equal(T.soal.normalize({ ...base, tipe: 'Benar-Salah', pertanyaan: 'Pernyataan yang tegas.', kunci: 'BENAR' }).key, 'Benar');
    assert.equal(T.soal.normalize({ ...base, tipe: 'Benar-Salah', pertanyaan: 'Pernyataan yang tegas.', kunci: 'salah' }).key, 'Salah');
});

test('soal.normalize Menjodohkan: kolom kanan diacak deterministik dan kunci cocok dengan teks', () => {
    const mj = { ...base, tipe: 'Menjodohkan', pertanyaan: 'Jodohkan zat dengan wujudnya!', kunci: '', pengecoh: 'Plasma',
        pasangan: [{ kiri: 'Air', kanan: 'Cair' }, { kiri: 'Batu', kanan: 'Padat' }, { kiri: 'Udara', kanan: 'Gas' }, { kiri: 'Es', kanan: 'Beku' }] };
    const a = T.soal.normalize(mj), b = T.soal.normalize(mj);
    assert.equal(a.text, b.text); assert.equal(a.key, b.key);
    const rights = {};
    for (const line of a.text.split('\n').slice(1)) { const m = /\(\s?\)\s+([a-z])\.\s+(.+)$/.exec(line); assert.ok(m, line); rights[m[1]] = m[2]; }
    assert.equal(Object.keys(rights).length, 5);          // 4 pasangan + 1 pengecoh
    assert.ok(Object.values(rights).includes('Plasma'));
    const lefts = a.text.split('\n').slice(1).map(l => /^(\d+)\.\s+(.+?)\s{3}/.exec(l)).filter(Boolean);
    const map = Object.fromEntries(a.key.split(', ').map(x => x.split('-')));
    for (const m of lefts) {
        const expected = mj.pasangan.find(p => p.kiri === m[2]).kanan;
        assert.equal(rights[map[m[1]]], expected, `kiri ${m[2]}`);
    }
});

test('soal.nextCode: berurutan per bentuk', () => {
    assert.equal(T.soal.nextCode('Pilihan Ganda', []), 'AI-PG-001');
    assert.equal(T.soal.nextCode('Pilihan Ganda', ['AI-PG-001', 'AI-PG-007', 'AI-UR-020', 'PG-099', 'AI-PG-x']), 'AI-PG-008');
    assert.equal(T.soal.nextCode('Menjodohkan', ['AI-PG-001']), 'AI-MJ-001');
});

// ---------- Modul ----------
const kg = m => ({ kegiatan: 'Orientasi', deskripsi: 'Guru: membuka pelajaran dengan pertanyaan. Siswa: menjawab.', menit: m, profil: 'Bernalar kritis' });
const mk = (menit = [15, 55, 10]) => ({ tujuan: 'Peserta didik mampu menganalisis zat.', pendahuluan: [kg(menit[0] / 3), kg(menit[0] - Math.floor(menit[0] / 3))], inti: [kg(menit[1] / 5), kg(menit[1] - Math.floor(menit[1] / 5))], penutup: [kg(menit[2] / 2), kg(menit[2] / 2)] });
const modul = (n = 2, menit) => ({
    judul: 'Klasifikasi Zat', kebutuhan: { kesiapan: 'Perkiraan umum: sudah mengenal zat.', minat: 'Perkiraan umum: suka praktik.', gaya_belajar: 'Perkiraan umum: visual dan kinestetik.' },
    karakteristik: { cakupan: 'Faktual dan konseptual.', relevansi: 'Dekat dengan kehidupan.', tingkat_kesulitan: 'Sedang untuk fase D.', struktur: ['Konsep', 'Klasifikasi'], karakter: 'Bernalar kritis dan mandiri.' },
    profil: [{ dimensi: 'Bernalar Kritis', keterangan: 'Menganalisis data pengamatan.' }, { dimensi: 'Kolaborasi', keterangan: 'Bekerja dalam kelompok.' }],
    desain: { capaian: 'Menganalisis zat.', lintas_disiplin: 'Matematika.', metode: 'Diskusi dan praktik.', kemitraan: 'Guru dan orang tua.', lingkungan: 'Kelas dan halaman.', digital: 'Video singkat.' },
    pertemuan: Array.from({ length: n }, () => mk(menit)),
    lkpd: { judul: 'Observasi Zat', uraian: 'Mengamati sifat zat.', aktivitas: ['Amati benda', 'Catat ciri'], kolom: ['Objek', 'Ciri', 'Kesimpulan'] },
    asesmen: { diagnostik: [{ pertanyaan: 'Apa itu zat?', kunci: 'Segala sesuatu bermassa' }, { pertanyaan: 'Sebutkan wujud zat.', kunci: 'Padat cair gas' }], formatif: [{ aspek: 'Nalar', skor1: 'Keliru', skor4: 'Tepat' }, { aspek: 'Kerja sama', skor1: 'Pasif', skor4: 'Aktif' }] },
    kisi: [{ indikator: 'Menyebutkan jenis zat', level: 'C1', bentuk: 'Pilihan Ganda' }, { indikator: 'Menjelaskan sifat zat', level: 'C2', bentuk: 'Isian Singkat' }, { indikator: 'Menganalisis klasifikasi', level: 'C4', bentuk: 'Uraian' }],
    contoh_soal: [{ bentuk: 'Pilihan Ganda', soal: 'Manakah zat padat? A. Air B. Batu', kunci: 'B' }, { bentuk: 'Uraian', soal: 'Jelaskan klasifikasi zat berdasarkan wujudnya.', kunci: 'Padat, cair, gas' }],
    pengayaan: 'Proyek klasifikasi benda di sekolah.', remedial: 'Bimbingan kelompok kecil dengan benda nyata.',
    bahan_ajar: [{ judul: 'Pengertian Zat', isi: 'Zat adalah segala sesuatu yang memiliki massa dan menempati ruang di sekitar kita sehari-hari.' }, { judul: 'Wujud Zat', isi: 'Zat berwujud padat, cair, dan gas dengan ciri susunan partikel yang berbeda satu sama lain.' }, { judul: 'Klasifikasi', isi: 'Klasifikasi zat dilakukan berdasarkan wujud, sifat, dan komposisi penyusunnya secara ilmiah.' }],
    media: ['Foto benda padat, cair, gas'] });

test('modul: contoh data sah menurut skema; validasi jumlah pertemuan, menit, dan tautan', () => {
    assert.deepEqual(Schema.validate(T.modul.schema, modul(2)), []);
    assert.deepEqual(T.modul.validate(modul(2), 2), []);
    assert.ok(T.modul.validate(modul(1), 2).some(e => /tepat 2/.test(e)));
    assert.ok(T.modul.validate(modul(2, [15, 40, 10]), 2).some(e => /total menit 65/.test(e)));
    assert.deepEqual(T.modul.validate(modul(2, [15, 58, 10]), 2), []);                 // toleransi 5 menit
    const withUrl = modul(2); withUrl.bahan_ajar[0].isi += ' lihat https://contoh.com';
    assert.ok(T.modul.validate(withUrl, 2).some(e => /tautan/.test(e)));
});

test('modul.build: memuat TP, model, jumlah pertemuan, aturan perkiraan umum, dan batas waktu', () => {
    const t = T.modul.build({ tp, model: 'Problem Based Learning (PBL)', meetings: 3, ctx: { subject: 'IPA', fase: 'D', kelas: 'VII.1', kktp: 75 } });
    assert.match(t.prompt, /Problem Based Learning/); assert.match(t.prompt, /Jumlah pertemuan: 3/); assert.match(t.prompt, /Perkiraan umum/);
    assert.match(t.prompt, /VII\.1/); assert.ok(t.timeoutMs >= 120000); assert.equal(typeof t.validate, 'function');
    assert.deepEqual(t.validate(modul(3)), []);
});

// ---------- Tahap 4 ----------
const p5d = { judul: 'Pameran Inovasi Daur Ulang', deskripsi: 'Peserta didik merancang karya daur ulang untuk mengurangi sampah sekolah dan memamerkannya.',
    tujuan: ['Mengidentifikasi jenis sampah sekolah', 'Membuat karya dari bahan bekas'], tahapan: [{ nama: 'Mengenal masalah', kegiatan: 'Mengamati sampah di sekolah dan mencatatnya.' }, { nama: 'Merancang', kegiatan: 'Membuat sketsa karya dalam kelompok.' }, { nama: 'Membuat', kegiatan: 'Mengerjakan karya dan menguji kekuatannya.' }],
    produk_akhir: 'Karya daur ulang dan pameran', sub_elemen: ['Menghasilkan gagasan orisinal', 'Bekerja sama'] };

test('p5: skema, build memuat parameter, validasi tautan', () => {
    assert.deepEqual(Schema.validate(T.p5.schema, p5d), []);
    const t = T.p5.build({ tema: 'Gaya Hidup Berkelanjutan', topik: 'Sampah', dimensi: 'Kreativitas', skala: '1 Minggu', fase: 'D', kelas: 'VII.1', subject: 'IPA' });
    for (const x of ['Gaya Hidup Berkelanjutan', 'Sampah', 'Kreativitas', '1 Minggu', 'VII.1']) assert.ok(t.prompt.includes(x), x);
    assert.deepEqual(T.p5.validate(p5d), []);
    assert.ok(T.p5.validate({ ...p5d, deskripsi: p5d.deskripsi + ' lihat https://x.com' }).length);
});

const p5m = {
    judul: 'Modul Pameran Daur Ulang', latar: 'Sampah sekolah menumpuk sehingga perlu aksi nyata dari peserta didik.', tujuan: ['Memilah sampah', 'Membuat karya'],
    dimensi: [{ dimensi: 'Kreativitas', sub_elemen: 'Menghasilkan gagasan', indikator: 'Menyampaikan gagasan orisinal.' }],
    tahapan: [1, 2, 3, 4].map(i => ({ tahap: 'Tahap ' + i, waktu: 'Hari ' + i, kegiatan: 'Guru dan siswa melakukan kegiatan nomor ' + i + ' secara bertahap.', hasil: 'Catatan' })),
    asesmen: { formatif: ['Observasi kerja kelompok', 'Jurnal harian'], sumatif: ['Penilaian produk akhir'] },
    rubrik: ['Gagasan', 'Kolaborasi', 'Produk'].map(a => ({ aspek: a, skor1: 'Belum tampak', skor2: 'Mulai tampak', skor3: 'Tampak', skor4: 'Sangat menonjol' })),
    produk: 'Karya daur ulang dan pameran kelas', kata_kunci: ['daur ulang sampah', 'ecobrick'], refleksi: ['Apa yang kamu pelajari?', 'Apa yang bisa diperbaiki?'] };

test('p5modul: skema, build memakai data proyek tersimpan, tanpa tautan', () => {
    assert.deepEqual(Schema.validate(T.p5modul.schema, p5m), []);
    const proyek = { theme: 'T', topic: 'Sampah', title: 'Judul P', description: 'Deskripsi', dimension: 'Kreativitas', scale: '1 Minggu', goals: ['G1', 'G2'], stages: [{ nama: 'A' }, { nama: 'B' }], product: 'Karya X' };
    const t = T.p5modul.build({ proyek, ctx: { subject: 'IPA', fase: 'D', kelas: 'VII.1' } });
    assert.match(t.prompt, /G1 \| G2/); assert.match(t.prompt, /A > B/); assert.match(t.prompt, /Karya X/); assert.ok(!/undefined/.test(t.prompt));
    const bare = T.p5modul.build({ proyek: { topic: 'x', title: 't', description: 'd', dimension: 'k' }, ctx: { subject: 'IPA', fase: 'D', kelas: '-' } });
    assert.ok(!/Tujuan rancangan|Tahapan rancangan/.test(bare.prompt));
    assert.ok(T.p5modul.validate({ ...p5m, latar: 'lihat www.contoh.com' }).length);
});

const asgD = { judul: 'LKPD Klasifikasi Zat', pengantar: 'Lembar ini membimbing kalian mengamati zat di sekitar.', langkah: ['Amati tiga benda', 'Catat sifatnya', 'Kelompokkan benda'], dikumpulkan: 'Lembar kerja yang telah diisi',
    rubrik: [{ kriteria: 'Data', bobot: 40, skor4: 'Lengkap', skor1: 'Kurang' }, { kriteria: 'Analisis', bobot: 40, skor4: 'Tepat', skor1: 'Keliru' }, { kriteria: 'Kesimpulan', bobot: 20, skor4: 'Jelas', skor1: 'Tidak ada' }] };

test('asg: bobot rubrik wajib tepat 100; toFields menyusun instruksi dan rubrik', () => {
    assert.deepEqual(Schema.validate(T.asg.schema, asgD), []);
    assert.deepEqual(T.asg.validate(asgD), []);
    const bad = { ...asgD, rubrik: asgD.rubrik.map((r, i) => i ? r : { ...r, bobot: 35 }) };
    assert.ok(T.asg.validate(bad).some(e => /jumlah bobot rubrik 95/.test(e)));
    const f = T.asg.toFields(asgD, tp);
    assert.equal(f.title, 'LKPD Klasifikasi Zat');
    assert.match(f.instructions, /^Tujuan Pembelajaran: Peserta didik mampu menganalisis klasifikasi zat/);
    assert.match(f.instructions, /1\. Amati tiga benda\n2\. Catat sifatnya/); assert.match(f.instructions, /Yang dikumpulkan: Lembar kerja/);
    assert.equal(f.rubric.split('\n').length, 3); assert.match(f.rubric, /^1\. Data \(40%\) \| Skor 4: Lengkap \| Skor 1: Kurang/);
    const t = T.asg.build({ tp, jenis: 'LKPD', ctx: { subject: 'IPA', fase: 'D' } });
    assert.match(t.prompt, /TEPAT 100/); assert.equal(typeof t.validate, 'function');
});

const stats = { n: 4, indicative: true, mean: 2.5, reliability: 0.4, items: [
    { no: 1, p: 0.9, pLabel: 'Mudah', d: 0.1, dLabel: 'Kurang', advice: 'x', distractorNotes: [] },
    { no: 2, p: 0.2, pLabel: 'Sukar', d: -0.2, dLabel: 'Buruk', advice: 'y', distractorNotes: ['Pengecoh C lebih banyak dipilih kelompok atas'] }] };

test('interp: prompt hanya memuat statistik butir (tanpa nama/jawaban), validasi nomor butir', () => {
    const t = T.interp.build({ dt: { topic: 'Zat', type: 'PG', qCount: 2 }, tp: null, stats });
    assert.match(t.prompt, /Butir 2: kesukaran p=0.2 \(Sukar\), daya pembeda D=-0.2 \(Buruk\); catatan pengecoh: Pengecoh C/);
    assert.match(t.prompt, /indikatif/); assert.match(t.prompt, /Angka sudah dihitung dan BENAR/);
    const d = { ringkasan: 'Dua butir bermasalah dan perlu direvisi sebelum dipakai lagi.', butir: [{ no: 2, penyebab: 'Kunci mungkin keliru.', saran: 'Periksa ulang kunci.' }], remedial: ['Bimbingan kecil'], pengayaan: ['Soal HOTS tambahan'] };
    assert.deepEqual(Schema.validate(T.interp.schema, d), []);
    assert.deepEqual(t.validate(d), []);
    assert.ok(t.validate({ ...d, butir: [{ no: 5, penyebab: 'xxxxxxxxxxx', saran: 'yyyyyyyyyyy' }] }).some(e => /melebihi/.test(e)));
});

const fRows = [{ code: '[S01]', passed: false, final: 60, weak: [{ code: 'TP-1.1', description: 'Menganalisis zat' }] }, { code: '[S02]', passed: true, final: 90, weak: [] }];
test('followup: prompt memakai kode saja; validasi kode, jenis, kelengkapan', () => {
    const t = T.followup.build({ rows: fRows, kktp: 75, ctx: { subject: 'IPA', fase: 'D' } });
    assert.match(t.prompt, /\[S01\] \| status: Belum Tuntas \| nilai akhir: 60 \| TP belum tercapai: TP-1\.1 \(Menganalisis zat\)/);
    assert.match(t.prompt, /\[S02\] \| status: Tuntas/); assert.equal(T.followup.BATCH, 10);
    const ok = { rekomendasi: [{ kode: '[S01]', jenis: 'Remedial', aktivitas: 'Latihan terbimbing TP-1.1 selama 30 menit.' }, { kode: '[S02]', jenis: 'Pengayaan', aktivitas: 'Studi kasus klasifikasi zat lanjutan.' }] };
    assert.deepEqual(Schema.validate(T.followup.schema, ok), []);
    assert.deepEqual(T.followup.validate(ok, fRows), []);
    assert.ok(T.followup.validate({ rekomendasi: [ok.rekomendasi[0]] }, fRows).some(e => /\[S02\] belum/.test(e)));
    assert.ok(T.followup.validate({ rekomendasi: [{ ...ok.rekomendasi[0], jenis: 'Pengayaan' }, ok.rekomendasi[1]] }, fRows).some(e => /jenis harus Remedial/.test(e)));
    assert.ok(T.followup.validate({ rekomendasi: [...ok.rekomendasi, { kode: '[S09]', jenis: 'Remedial', aktivitas: 'xxxxxxxxxxxxxxxx' }] }, fRows).some(e => /tidak ada dalam permintaan/.test(e)));
    assert.ok(T.followup.validate({ rekomendasi: [...ok.rekomendasi, ok.rekomendasi[0]] }, fRows).some(e => /lebih dari sekali/.test(e)));
});
