/**
 * Anonimisasi data siswa/wali sebelum dikirim ke layanan AI, dan pemulihan nama pada hasilnya.
 *
 * Kode memakai tanda kurung siku agar tidak tertukar dengan teks biasa: [S01] untuk siswa, [W01] untuk wali.
 * Batasan yang disengaja:
 *  - scrub() mengganti NAMA LENGKAP, NIS, dan nomor telepon yang dikenal. Nama depan saja tidak diganti
 *    (terlalu banyak salah ganti). Karena itu fitur AI harus membangun permintaan dari kode, bukan dari teks bebas.
 *  - findLeaks() adalah jaring pengaman: AIService menolak permintaan yang masih memuat data dikenal.
 */
const Anonymizer = (() => {
    const pad = n => String(n).padStart(2, '0');
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    function create({ students = [], guardians = [] } = {}) {
        const stuCode = new Map();       // studentId -> '[S01]'
        const codeToName = new Map();    // '[S01]' -> 'Nama Asli'
        const known = [];                // { text, code, kind }

        students.forEach((s, i) => {
            const code = `[S${pad(i + 1)}]`;
            stuCode.set(s.id, code);
            codeToName.set(code, s.name);
            if (norm(s.name).length >= 4) known.push({ text: norm(s.name), code, kind: 'nama siswa' });
            const nis = String(s.nis || '').trim();
            if (nis.length >= 4) known.push({ text: nis, code, kind: 'NIS', digits: true });
        });
        guardians.forEach((g, i) => {
            const code = `[W${pad(i + 1)}]`;
            codeToName.set(code, g.name);
            if (norm(g.name).length >= 4) known.push({ text: norm(g.name), code, kind: 'nama wali' });
            const ph = String(g.phone || '').replace(/\D/g, '');
            if (ph.length >= 8) known.push({ text: ph, code, kind: 'telepon', digits: true, phone: true });
        });
        known.sort((a, b) => b.text.length - a.text.length);

        function code(studentId) { return stuCode.get(studentId) || null; }

        function regexFor(k) {
            if (k.phone) return new RegExp('(?<![\\d])\\+?' + k.text.split('').join('[\\s\\-.]*') + '(?![\\d])', 'g');
            if (k.digits) return new RegExp('(?<![\\d])' + esc(k.text) + '(?![\\d])', 'g');
            return new RegExp(esc(k.text).replace(/ /g, '\\s+'), 'gi');
        }

        function scrub(text) {
            let t = String(text == null ? '' : text);
            for (const k of known) t = t.replace(regexFor(k), k.code);
            return t;
        }

        /** Daftar jenis data yang masih terdeteksi di teks (tanpa menyebut isinya). */
        function findLeaks(text) {
            const t = String(text == null ? '' : text);
            const found = [];
            for (const k of known) {
                const hay = k.digits ? t : t.toLowerCase().replace(/\s+/g, ' ');
                const re = k.digits ? regexFor(k) : new RegExp(esc(k.text), 'i');
                if (re.test(hay)) found.push(k.kind);
            }
            return found;
        }

        function restore(value) {
            if (typeof value === 'string') {
                return value.replace(/\[([SW]\d{2,3})\]/g, (m, c) => codeToName.get(`[${c}]`) || m);
            }
            if (Array.isArray(value)) return value.map(restore);
            if (value && typeof value === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(value)) out[k] = restore(v);
                return out;
            }
            return value;
        }

        return { code, scrub, findLeaks, restore, count: known.length };
    }
    return { create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Anonymizer;
