/**
 * Backup v2 (murni, tanpa DOM dan tanpa penyimpanan). Dapat diuji di Node.
 *
 *  - build: paket berversi skema (schemaVersion 2) dengan jumlah record per tabel (counts).
 *  - parse: membaca teks backup, memeriksa format, versi, dan kelengkapan. Backup lama (tanpa
 *    schemaVersion, "backupVersion" 19.0) dibaca sebagai skema 1 dan tetap dapat dipulihkan.
 *  - merge: mode gabung. Per record (kunci identitas): record baru ditambah, record yang sudah ada
 *    hanya diganti bila updatedAt di backup lebih baru. Data saat ini tidak pernah dihapus.
 *  - due: pengingat backup (bawaan 7 hari).
 * Nama bidang tabel sengaja sama dengan backup lama agar kompatibel.
 */
const Backup = (() => {
    const APP_NAME = 'Sistem Administrasi Guru';
    const SCHEMA_VERSION = 2;
    const BACKUP_VERSION = '20.0';
    const REMIND_DAYS = 7;

    // field = nama di berkas; id = bidang identitas; 'testId|studentId' untuk nilai ulangan (tanpa id).
    const TABLES = [
        { field: 'periods', id: 'id' }, { field: 'classes', id: 'classId' }, { field: 'students', id: 'id' },
        { field: 'meetings', id: 'id' }, { field: 'attendance', id: 'id' }, { field: 'assessments', id: 'id' },
        { field: 'scores', id: 'id' }, { field: 'followUps', id: 'id' }, { field: 'cp', id: 'cpId' },
        { field: 'tp', id: 'tpId' }, { field: 'materials', id: 'id' }, { field: 'questions', id: 'id' },
        { field: 'assessmentPkgs', id: 'id' }, { field: 'raporDescriptions', id: 'id' }, { field: 'schedules', id: 'id' },
        { field: 'journals', id: 'id' }, { field: 'p5Projects', id: 'id' }, { field: 'assignments', id: 'id' },
        { field: 'submissions', id: 'id' }, { field: 'guardians', id: 'id' }, { field: 'communications', id: 'id' },
        { field: 'documents', id: 'id' }, { field: 'dailyTests', id: 'id' }, { field: 'dailyScores', id: 'testId|studentId' }
    ];

    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

    function idOf(r, t) {
        if (!isObj(r)) return null;
        if (t.id === 'testId|studentId') return (r.testId && r.studentId) ? r.testId + '|' + r.studentId : null;
        return r[t.id] || null;
    }

    function build({ settings, tables, now }) {
        const out = { appName: APP_NAME, backupVersion: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, createdAt: (now || new Date()).toISOString() };
        const s = { ...(settings || {}) }; delete s.ai;           // pengaturan AI dan kuncinya tidak ikut backup
        out.settings = s;
        const counts = {};
        for (const t of TABLES) {
            const arr = Array.isArray(tables && tables[t.field]) ? tables[t.field] : [];
            out[t.field] = arr; counts[t.field] = arr.length;
        }
        out.counts = counts;
        return out;
    }

    function parse(text) {
        const res = { ok: false, problems: [], warnings: [], data: null, schemaVersion: null, legacy: false, counts: {} };
        let d;
        try { d = JSON.parse(text); } catch (e) { res.problems.push('Berkas bukan JSON yang valid.'); return res; }
        if (!isObj(d)) { res.problems.push('Isi berkas bukan objek backup.'); return res; }
        if (d.appName !== APP_NAME) res.problems.push('Berkas ini bukan backup Sistem Administrasi Guru.');
        if (!isObj(d.settings)) res.problems.push('Bagian pengaturan tidak ada.');
        const ver = d.schemaVersion === undefined ? 1 : d.schemaVersion;
        if (typeof ver !== 'number' || !isFinite(ver) || ver < 1) res.problems.push('Versi skema backup tidak dikenal.');
        else if (ver > SCHEMA_VERSION) res.problems.push(`Backup dibuat oleh versi aplikasi yang lebih baru (skema ${ver}, aplikasi ini mendukung sampai ${SCHEMA_VERSION}). Perbarui aplikasi lebih dulu.`);
        res.schemaVersion = typeof ver === 'number' ? ver : null;
        res.legacy = d.schemaVersion === undefined;
        for (const t of TABLES) {
            const v = d[t.field];
            if (v === undefined) { res.counts[t.field] = 0; if (!res.legacy) res.problems.push(`Tabel ${t.field} tidak ada di backup.`); continue; }
            if (!Array.isArray(v)) { res.problems.push(`Tabel ${t.field} rusak (bukan daftar).`); continue; }
            if (v.some(r => !isObj(r))) { res.problems.push(`Tabel ${t.field} memuat baris yang rusak.`); continue; }
            res.counts[t.field] = v.length;
            if (isObj(d.counts) && typeof d.counts[t.field] === 'number' && d.counts[t.field] !== v.length)
                res.problems.push(`Tabel ${t.field} tidak lengkap: seharusnya ${d.counts[t.field]} baris, terbaca ${v.length}.`);
            const seen = new Set(); let dup = 0;
            for (const r of v) { const id = idOf(r, t); if (!id) continue; if (seen.has(id)) dup++; seen.add(id); }
            if (dup) res.warnings.push(`Tabel ${t.field} memuat ${dup} ID ganda; baris terakhir dipakai saat digabung.`);
        }
        if (res.problems.length) return res;
        res.ok = true; res.data = d;
        return res;
    }

    /** Ambil tabel dari backup sebagai objek { field: [] } (bidang yang tidak ada menjadi daftar kosong). */
    function tablesOf(d) {
        const out = {};
        for (const t of TABLES) out[t.field] = Array.isArray(d[t.field]) ? d[t.field] : [];
        return out;
    }

    /** Gabungkan. Kembalian: { tables, stats: { added, updated, kept, byTable } }. Tidak mengubah masukan. */
    function merge(current, incoming) {
        const tables = {}; const stats = { added: 0, updated: 0, kept: 0, byTable: {} };
        for (const t of TABLES) {
            const cur = (current && current[t.field]) || [], inc = (incoming && incoming[t.field]) || [];
            const out = cur.map(r => r); const index = new Map(); const sigs = new Set();
            out.forEach((r, i) => { const id = idOf(r, t); if (id) index.set(id, i); else sigs.add(JSON.stringify(r)); });
            const st = { added: 0, updated: 0, kept: 0 };
            for (const r of inc) {
                const id = idOf(r, t);
                if (!id) { const sg = JSON.stringify(r); if (sigs.has(sg)) st.kept++; else { sigs.add(sg); out.push(r); st.added++; } continue; }
                if (!index.has(id)) { index.set(id, out.length); out.push(r); st.added++; continue; }
                const i = index.get(id), old = out[i];
                if (r.updatedAt && (!old.updatedAt || String(r.updatedAt) > String(old.updatedAt))) { out[i] = r; st.updated++; } else st.kept++;
            }
            tables[t.field] = out;
            stats.byTable[t.field] = st; stats.added += st.added; stats.updated += st.updated; stats.kept += st.kept;
        }
        return { tables, stats };
    }

    /** Pengingat: due bila belum pernah backup padahal ada data, atau sudah >= REMIND_DAYS hari. */
    function due(lastIso, now, hasData, days) {
        const lim = days || REMIND_DAYS;
        const last = lastIso ? Date.parse(lastIso) : NaN;
        if (isNaN(last)) return { due: !!hasData, days: null };
        const n = Math.floor(((now ? now.getTime() : Date.now()) - last) / 86400000);
        return { due: n >= lim, days: Math.max(0, n) };
    }

    return { APP_NAME, SCHEMA_VERSION, BACKUP_VERSION, REMIND_DAYS, TABLES, build, parse, tablesOf, merge, due };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Backup;
