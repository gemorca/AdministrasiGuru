/**
 * Paket asesmen (murni, tanpa DOM). Dapat diuji di Node.
 *
 * Paket = kumpulan butir Bank Soal berurutan untuk satu asesmen cetak:
 *   { id, periodId, classId, name, kind, duration, instruction, questionIds[] }
 * Skor: setiap butir bobot sama, total tepat 100 (sisa pembulatan dibagi ke butir pertama, 2 desimal).
 * Kunci: dibaca dari butir Bank Soal. Butir bentuk non-Uraian tanpa kunci ditandai peringatan.
 */
const Paket = (() => {
    const KINDS = ['Formatif', 'Sumatif', 'UTS', 'UAS', 'Latihan'];
    const NEEDS_KEY = t => t !== 'Uraian';

    /** Bobot skor per butir: n bobot yang berjumlah tepat 100 (satuan 0,01). */
    function allocate(n) {
        if (!n || n < 1) return [];
        const unit = Math.floor(10000 / n);            // dalam 1/100 poin
        const out = new Array(n).fill(unit);
        let rest = 10000 - unit * n;
        for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i]++;
        return out.map(v => v / 100);
    }

    /** Validasi isian paket. Mengembalikan daftar pesan galat (kosong = valid). */
    function validate(p, questions) {
        const errs = [];
        if (!p || !String(p.name || '').trim()) errs.push('Nama paket wajib diisi.');
        if (!KINDS.includes(p && p.kind)) errs.push('Jenis paket tidak dikenal.');
        const d = p && p.duration;
        if (d !== null && d !== undefined && d !== '' && !(Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 300)) errs.push('Durasi harus bilangan bulat 1 sampai 300 menit.');
        const ids = (p && p.questionIds) || [];
        if (!ids.length) errs.push('Pilih minimal satu butir soal.');
        if (new Set(ids).size !== ids.length) errs.push('Ada butir soal yang dipilih dua kali.');
        const have = new Set((questions || []).map(q => q.id));
        const missing = ids.filter(id => !have.has(id));
        if (missing.length) errs.push(`${missing.length} butir soal tidak ditemukan di Bank Soal.`);
        return errs;
    }

    /** Butir paket berurutan sesuai questionIds; butir yang hilang dilewati dan dilaporkan. */
    function resolve(p, questions) {
        const byId = new Map((questions || []).map(q => [q.id, q]));
        const items = [], missing = [];
        for (const id of p.questionIds || []) { const q = byId.get(id); if (q) items.push(q); else missing.push(id); }
        return { items, missing };
    }

    /** Tabel kunci: { rows:[{no, code, type, key, explanation, points}], total, warnings:[] }. */
    function answerKey(p, questions) {
        const { items, missing } = resolve(p, questions);
        const pts = allocate(items.length);
        const warnings = [];
        if (missing.length) warnings.push(`${missing.length} butir soal sudah dihapus dari Bank Soal.`);
        const rows = items.map((q, i) => {
            const key = String(q.key || '').trim();
            if (!key && NEEDS_KEY(q.type)) warnings.push(`Butir ${i + 1} (${q.code}) belum punya kunci jawaban.`);
            return { no: i + 1, code: q.code, type: q.type, key, explanation: String(q.explanation || '').trim(), points: pts[i] };
        });
        return { rows, total: Math.round(pts.reduce((a, b) => a + b, 0) * 100) / 100, warnings };
    }

    /** Buang id butir yang sudah tidak ada. Mengembalikan { questionIds, removed }. */
    function prune(p, questions) {
        const have = new Set((questions || []).map(q => q.id));
        const keep = (p.questionIds || []).filter(id => have.has(id));
        return { questionIds: keep, removed: (p.questionIds || []).length - keep.length };
    }

    return { KINDS, allocate, validate, resolve, answerKey, prune };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Paket;
