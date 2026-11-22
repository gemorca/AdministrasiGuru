/**
 * Logika penilaian murni (tanpa DOM, tanpa penyimpanan). Dapat diuji di Node.
 *
 * Aturan:
 *  - Nilai akhir = jumlah(komponen x bobot). Bobot dibaca dari Pengaturan dan harus total 100.
 *  - Komponen kosong TIDAK diganti angka bawaan. Kebijakan di Pengaturan (missingPolicy):
 *      'incomplete' : nilai akhir tidak dihitung, status "Belum Lengkap" (bawaan)
 *      'partial'    : bobot dinormalkan ke komponen yang ada, ditandai "Sementara"
 *  - Penalti kehadiran opsional: bila persentase hadir < ambang, nilai dikali (hadir / ambang).
 *  - Syarat tuntas: nilai akhir >= KKTP, dan (opsional) kehadiran >= ambang.
 *  - Nilai remedial (opsional, remedialMode 'kktp'): bila siswa lulus remedial, nilai akhir
 *    dinaikkan paling tinggi sampai KKTP.
 */
const Grading = (() => {
    const DEFAULTS = {
        kktp: 75,
        wForm: 30, wSum: 30, wUts: 20, wUas: 20,
        missingPolicy: 'incomplete',   // 'incomplete' | 'partial'
        attMin: 80,                    // ambang kehadiran (%)
        attPenalty: true,              // kurangi nilai jika hadir < ambang
        attRequiredToPass: true,       // hadir >= ambang menjadi syarat tuntas
        predA: 90, predB: 80, predC: 70,
        remedialMode: 'catat'          // 'catat' | 'kktp'
    };

    const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
    const round1 = v => Math.round(v * 10) / 10;
    const avg = arr => {
        const a = arr.map(num).filter(v => v !== null);
        return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    };

    /** Gabungkan pengaturan pengguna dengan nilai bawaan; nilai tidak valid diabaikan. */
    function config(settings) {
        const s = settings || {};
        const c = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS)) {
            if (s[k] === undefined || s[k] === null || s[k] === '') continue;
            if (typeof DEFAULTS[k] === 'boolean') c[k] = !!s[k];
            else if (typeof DEFAULTS[k] === 'number') { const n = num(s[k]); if (n !== null) c[k] = n; }
            else c[k] = s[k];
        }
        return c;
    }

    /** Validasi pengaturan. Mengembalikan daftar pesan galat (kosong = valid). */
    function validate(cfg) {
        const errs = [];
        const w = [cfg.wForm, cfg.wSum, cfg.wUts, cfg.wUas];
        if (w.some(v => num(v) === null || v < 0 || v > 100)) errs.push('Setiap bobot harus angka 0 sampai 100.');
        const total = w.reduce((a, b) => a + (num(b) || 0), 0);
        if (Math.abs(total - 100) > 1e-9) errs.push(`Total bobot harus 100% (sekarang ${total}%).`);
        if (!(cfg.kktp >= 0 && cfg.kktp <= 100)) errs.push('KKTP harus antara 0 dan 100.');
        if (!(cfg.attMin >= 0 && cfg.attMin <= 100)) errs.push('Ambang kehadiran harus antara 0 dan 100.');
        if (!(cfg.predA > cfg.predB && cfg.predB > cfg.predC && cfg.predC >= 0 && cfg.predA <= 100))
            errs.push('Batas predikat harus berurutan: A > B > C, dan tidak lebih dari 100.');
        if (!['incomplete', 'partial'].includes(cfg.missingPolicy)) errs.push('Kebijakan nilai kosong tidak dikenal.');
        if (!['catat', 'kktp'].includes(cfg.remedialMode)) errs.push('Mode nilai remedial tidak dikenal.');
        return errs;
    }

    function predicate(final, cfg) {
        if (final === null || final === undefined) return '-';
        return final >= cfg.predA ? 'A' : final >= cfg.predB ? 'B' : final >= cfg.predC ? 'C' : 'D';
    }

    /**
     * @param input {
     *   formatif: number[], sumatif: number[],   // nilai per asesmen; kosong/null diabaikan
     *   uts: number|null, uas: number|null,
     *   attPct: number,                         // 0..100
     *   remedialScore?: number|null             // nilai remedial terbaru (opsional)
     * }
     * @returns {
     *   f, sum, uts, uas, attPct,              // komponen (null bila kosong)
     *   missing: string[],                      // komponen yang kosong: 'Formatif','Sumatif','UTS','UAS'
     *   complete: boolean, partial: boolean,
     *   base: number|null, final: number|null,
     *   passed: boolean, pred: string,
     *   status: 'Tuntas'|'Belum Tuntas'|'Belum Lengkap'|'Sementara',
     *   penalized: boolean, remedialApplied: boolean
     * }
     */
    function compute(input, settings) {
        const cfg = config(settings);
        const f = avg(input.formatif || []);
        const sum = avg(input.sumatif || []);
        const uts = num(input.uts);
        const uas = num(input.uas);
        const attPct = num(input.attPct) === null ? 100 : num(input.attPct);

        const parts = [
            { label: 'Formatif', v: f, w: cfg.wForm },
            { label: 'Sumatif', v: sum, w: cfg.wSum },
            { label: 'UTS', v: uts, w: cfg.wUts },
            { label: 'UAS', v: uas, w: cfg.wUas }
        ];
        const missing = parts.filter(p => p.v === null && p.w > 0).map(p => p.label);
        const present = parts.filter(p => p.v !== null && p.w > 0);
        const complete = missing.length === 0;

        const out = {
            f: f === null ? null : round1(f), sum: sum === null ? null : round1(sum),
            uts, uas, attPct, missing, complete, partial: false,
            base: null, final: null, passed: false, pred: '-', status: 'Belum Lengkap',
            penalized: false, remedialApplied: false
        };

        let base = null;
        if (complete) {
            base = present.reduce((a, p) => a + p.v * p.w, 0) / 100;
        } else if (cfg.missingPolicy === 'partial' && present.length) {
            const wsum = present.reduce((a, p) => a + p.w, 0);
            base = present.reduce((a, p) => a + p.v * p.w, 0) / wsum;
            out.partial = true;
        } else {
            return out; // belum lengkap: tidak ada nilai akhir
        }

        let final = base;
        if (cfg.attPenalty && attPct < cfg.attMin && cfg.attMin > 0) {
            final = base * (attPct / cfg.attMin);
            out.penalized = true;
        }
        out.base = round1(base);
        final = round1(final);

        const rs = num(input.remedialScore);
        if (cfg.remedialMode === 'kktp' && rs !== null && final < cfg.kktp && rs >= cfg.kktp) {
            final = round1(cfg.kktp);
            out.remedialApplied = true;
        }

        out.final = final;
        out.pred = predicate(final, cfg);
        const attOk = !cfg.attRequiredToPass || attPct >= cfg.attMin;
        out.passed = !out.partial && final >= cfg.kktp && attOk;
        out.status = out.partial ? 'Sementara' : (out.passed ? 'Tuntas' : 'Belum Tuntas');
        return out;
    }

    return { DEFAULTS, config, validate, compute, predicate, avg, round1 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Grading;
