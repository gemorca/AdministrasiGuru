/**
 * Analisis butir soal (murni, tanpa DOM). Dapat diuji di Node.
 *
 * Input:
 *   items:   [{ max: number, key?: string }]   // max = skor maksimal butir; key = kunci (PG)
 *   students:[{ scores: (number|null)[], answers?: string[] }]
 *            scores[i] = skor perolehan butir i (PG: 0 atau 1)
 *
 * Output per butir:
 *   p        tingkat kesukaran = rata-rata skor / skor maks (0..1)
 *   pLabel   'Sukar' (<0,30) | 'Sedang' (0,30-0,70) | 'Mudah' (>0,70)
 *   d        daya pembeda = (rata-rata kelompok atas - kelompok bawah) / skor maks
 *   dLabel   'Sangat baik' (>=0,40) | 'Baik' (0,30-0,39) | 'Cukup' (0,20-0,29) | 'Kurang' (0,00-0,19) | 'Buruk' (<0)
 *   advice   rekomendasi singkat
 *   distractors (hanya PG, bila answers ada): { opsi: {n, atas, bawah} } + catatan pengecoh
 * Kelompok atas/bawah = 27% siswa berdasar total skor (minimal 1 siswa). Bila siswa < 10, hasil bersifat indikatif.
 */
const ItemAnalysis = (() => {
    const round2 = v => Math.round(v * 100) / 100;
    const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

    function pLabel(p) { return p < 0.30 ? 'Sukar' : p > 0.70 ? 'Mudah' : 'Sedang'; }
    function dLabel(d) {
        if (d < 0) return 'Buruk';
        if (d >= 0.40) return 'Sangat baik';
        if (d >= 0.30) return 'Baik';
        if (d >= 0.20) return 'Cukup';
        return 'Kurang';
    }
    function advice(p, d) {
        if (d < 0) return 'Periksa kunci jawaban dan redaksi soal: siswa berkemampuan rendah justru lebih banyak benar.';
        if (d < 0.20) return p > 0.70 ? 'Terlalu mudah dan kurang membedakan. Naikkan tingkat kesulitan atau ganti.' :
                              p < 0.30 ? 'Terlalu sukar dan kurang membedakan. Periksa kejelasan soal atau materi belum diajarkan.' :
                                         'Daya pembeda rendah. Revisi pengecoh atau redaksi.';
        if (d < 0.30) return 'Cukup. Dapat dipakai, perbaiki bila memungkinkan.';
        return 'Butir baik. Simpan di bank soal.';
    }

    function analyze(items, students) {
        const n = students.length;
        const k = items.length;
        const totals = students.map(s => s.scores.reduce((a, v) => a + (num(v) || 0), 0));
        const order = totals.map((t, i) => i).sort((a, b) => totals[b] - totals[a]);
        const g = Math.max(1, Math.round(n * 0.27));
        const upper = new Set(order.slice(0, g));
        const lower = new Set(order.slice(Math.max(0, n - g)));

        const result = { n, groupSize: g, indicative: n < 10, items: [], mean: null, reliability: null };
        if (!n || !k) return result;

        result.mean = round2(totals.reduce((a, b) => a + b, 0) / n);

        for (let i = 0; i < k; i++) {
            const max = num(items[i].max) > 0 ? num(items[i].max) : 1;
            const col = students.map(s => num(s.scores[i]) || 0);
            const mean = col.reduce((a, b) => a + b, 0) / n;
            const mu = [...upper].reduce((a, idx) => a + col[idx], 0) / upper.size;
            const ml = [...lower].reduce((a, idx) => a + col[idx], 0) / lower.size;
            const p = mean / max;
            const d = (mu - ml) / max;
            const row = { no: i + 1, p: round2(p), pLabel: pLabel(p), d: round2(d), dLabel: dLabel(d), advice: advice(p, d) };

            if (items[i].key && students.every(s => Array.isArray(s.answers))) {
                const key = String(items[i].key).toUpperCase();
                const dist = {};
                students.forEach((s, idx) => {
                    const a = String(s.answers[i] === undefined || s.answers[i] === null ? '' : s.answers[i]).toUpperCase() || '-';
                    dist[a] = dist[a] || { n: 0, atas: 0, bawah: 0 };
                    dist[a].n++;
                    if (upper.has(idx)) dist[a].atas++;
                    if (lower.has(idx)) dist[a].bawah++;
                });
                const notes = [];
                for (const [opt, c] of Object.entries(dist)) {
                    if (opt === key || opt === '-') continue;
                    if (c.n / n < 0.05) notes.push(`Pengecoh ${opt} hampir tidak dipilih`);
                    else if (c.atas > c.bawah) notes.push(`Pengecoh ${opt} lebih banyak dipilih kelompok atas`);
                }
                row.distractors = dist;
                row.distractorNotes = notes;
            }
            result.items.push(row);
        }

        // Reliabilitas KR-20, hanya bila semua butir dikotomus (skor 0/1) dan ada variansi
        const dichotomous = items.every((it, i) => (num(it.max) || 1) === 1 && students.every(s => [0, 1].includes(num(s.scores[i]) || 0)));
        if (dichotomous && k > 1 && n > 1) {
            const mean = totals.reduce((a, b) => a + b, 0) / n;
            const variance = totals.reduce((a, t) => a + (t - mean) ** 2, 0) / n;
            if (variance > 0) {
                const sumPQ = result.items.reduce((a, it) => a + it.p * (1 - it.p), 0);
                result.reliability = round2((k / (k - 1)) * (1 - sumPQ / variance));
            }
        }
        return result;
    }

    /** Ubah data ulangan harian aplikasi (dt, dailyScores) menjadi masukan analyze(). */
    function fromDailyTest(dt, scoreRows) {
        const numeric = ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
        const mk = dt.masterKey || Array(dt.qCount).fill('');
        const items = Array.from({ length: dt.qCount }, (_, i) => numeric
            ? { max: parseFloat(mk[i]) || 0 }
            : { max: 1, key: mk[i] || '' });
        const students = scoreRows.map(r => {
            const ans = r.answers || [];
            const scores = items.map((it, i) => {
                const v = ans[i];
                if (numeric) return (v === '' || v === undefined || v === null) ? 0 : (parseFloat(v) || 0);
                return (mk[i] && String(v).toUpperCase() === String(mk[i]).toUpperCase()) ? 1 : 0;
            });
            return { scores, answers: numeric ? undefined : ans };
        });
        return { items: items.map(it => ({ ...it, max: it.max || 1 })), students };
    }

    return { analyze, fromDailyTest, pLabel, dLabel };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ItemAnalysis;
