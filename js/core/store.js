/**
 * Lapisan penyimpanan tunggal. Semua akses localStorage lewat sini.
 *
 * Tanggung jawab:
 *  - read/write JSON dengan penanganan galat (data rusak tidak ditimpa diam-diam, kuota penuh dilaporkan).
 *  - cap metadata record: createdAt, updatedAt, ownerId (ownerId dipakai fitur login di Tahap 7).
 *  - migrasi skema bertahap dengan snapshot cadangan sebelum mengubah data.
 *  - perkiraan pemakaian penyimpanan.
 *
 * Penyimpanan fisik sengaja masih localStorage. Pindah ke IndexedDB (Tahap 6)
 * cukup mengganti isi file ini.
 */
const Store = (() => {
    const SCHEMA_KEY = 'g_schema';
    const SCHEMA_VERSION = 1;
    const BACKUP_KEY = 'g_backup_pre_v1';
    const QUOTA_BYTES = 5 * 1024 * 1024; // perkiraan konservatif batas localStorage

    // Kunci yang berisi DAFTAR record. 'g_set' berisi objek pengaturan.
    const LIST_KEYS = [
        'g_per', 'g_cls', 'g_stu', 'g_mtg', 'g_att', 'g_ass', 'g_scr', 'g_fol',
        'g_cp', 'g_tp', 'g_mat', 'g_qst', 'g_pkg', 'g_rdesc', 'g_sch', 'g_jour',
        'g_p5_proj', 'g_assign', 'g_submit', 'g_guardians', 'g_communications',
        'g_docs', 'g_dt', 'g_dts'
    ];
    const OBJECT_KEYS = ['g_set'];
    const DATA_KEYS = [...LIST_KEYS, ...OBJECT_KEYS];

    const sigCache = {}; // key -> { recordId: signature } untuk mendeteksi perubahan (updatedAt)
    let errorHandler = null;
    let lastErrorAt = 0;

    const clone = v => JSON.parse(JSON.stringify(v));
    const nowIso = () => new Date().toISOString();

    // Kunci identitas record berbeda per tabel (TP punya cpId DAN tpId, nilai harian tidak punya id).
    const ID_FIELD = { g_cp: 'cpId', g_tp: 'tpId', g_cls: 'classId' };
    function recordId(r, key) {
        if (!r || typeof r !== 'object') return null;
        if (key === 'g_dts') return (r.testId && r.studentId) ? r.testId + '|' + r.studentId : null;
        const f = ID_FIELD[key] || 'id';
        return r[f] || null;
    }
    function signature(r) {
        const { updatedAt, ...rest } = r;
        return JSON.stringify(rest);
    }
    function reportError(message) {
        const t = Date.now();
        if (t - lastErrorAt < 1500) return; // cegah banjir pesan saat banyak kunci gagal sekaligus
        lastErrorAt = t;
        if (typeof errorHandler === 'function') errorHandler(message);
        else console.error('[Store]', message);
    }
    function isQuotaError(e) {
        return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    }

    /** Baca satu kunci. Data rusak disalin ke g_corrupt_* lalu fallback dikembalikan. */
    function read(key, fallback) {
        let raw = null;
        try { raw = localStorage.getItem(key); } catch (e) { reportError('Penyimpanan browser tidak dapat dibaca.'); return clone(fallback); }
        if (raw === null) {
            sigCache[key] = {};
            return clone(fallback);
        }
        try {
            const v = JSON.parse(raw);
            if (Array.isArray(v)) {
                const cache = {};
                v.forEach(r => { const id = recordId(r, key); if (id && r && typeof r === 'object') cache[id] = signature(r); });
                sigCache[key] = cache;
            }
            return v;
        } catch (e) {
            try { localStorage.setItem(`g_corrupt_${key}_${Date.now()}`, raw); } catch (_) { /* kuota penuh: abaikan */ }
            reportError(`Data "${key}" rusak dan tidak bisa dibaca. Salinan mentah disimpan dengan awalan g_corrupt_.`);
            sigCache[key] = {};
            return clone(fallback);
        }
    }

    /** Tulis satu kunci. Daftar record dicap createdAt/updatedAt/ownerId. Mengembalikan true jika berhasil. */
    function write(key, value) {
        if (Array.isArray(value)) {
            const cache = sigCache[key] || (sigCache[key] = {});
            const t = nowIso();
            for (const r of value) {
                if (!r || typeof r !== 'object') continue;
                if (!('ownerId' in r)) r.ownerId = null;
                if (!r.createdAt) r.createdAt = t;
                const id = recordId(r, key);
                if (id) {
                    const sig = signature(r);
                    if (cache[id] === undefined || cache[id] !== sig) r.updatedAt = t;
                    else if (!r.updatedAt) r.updatedAt = r.createdAt;
                    cache[id] = signature(r);
                } else if (!r.updatedAt) {
                    r.updatedAt = r.createdAt;
                }
            }
        }
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            reportError(isQuotaError(e)
                ? 'Penyimpanan browser penuh. Data terakhir BELUM tersimpan. Lakukan Backup lalu kurangi data lama.'
                : 'Data gagal disimpan: ' + (e && e.message ? e.message : e));
            return false;
        }
    }

    function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }

    // Rahasia (API key / token proxy AI). Kunci terpisah, TIDAK termasuk DATA_KEYS:
    // tidak ikut backup, tidak ikut snapshot migrasi, tidak terhapus oleh restore.
    const SECRET_KEY = 'g_ai_secret';
    function secretGet() { try { return localStorage.getItem(SECRET_KEY) || ''; } catch (_) { return ''; } }
    function secretSet(v) {
        try { localStorage.setItem(SECRET_KEY, String(v)); return true; }
        catch (e) { reportError('Kunci AI gagal disimpan: penyimpanan browser penuh.'); return false; }
    }
    function secretClear() { remove(SECRET_KEY); }

    /** Perkiraan pemakaian: UTF-16, 2 byte per karakter. */
    function usage() {
        let chars = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                chars += k.length + (localStorage.getItem(k) || '').length;
            }
        } catch (_) {}
        const bytes = chars * 2;
        return { bytes, quota: QUOTA_BYTES, ratio: bytes / QUOTA_BYTES };
    }

    function timeFromLegacyId(id) {
        const m = typeof id === 'string' && id.match(/-(\d{13})/);
        if (!m) return null;
        const t = parseInt(m[1], 10);
        return (t > 1.4e12 && t < 4.1e12) ? new Date(t).toISOString() : null;
    }

    /**
     * Migrasi skema. Aditif: hanya menambah metadata, tidak mengubah/menghapus isi atau ID lama.
     * Sebelum mengubah apa pun, seluruh data disalin ke BACKUP_KEY (jika muat).
     */
    function migrate() {
        let current = 0;
        try { current = parseInt(localStorage.getItem(SCHEMA_KEY) || '0', 10) || 0; } catch (_) {}
        const result = { from: current, to: SCHEMA_VERSION, migrated: false, records: 0, backup: 'none' };
        if (current >= SCHEMA_VERSION) return result;

        // 1. Snapshot
        const snap = {};
        let hasData = false;
        for (const k of DATA_KEYS) {
            const raw = localStorage.getItem(k);
            if (raw !== null) { snap[k] = raw; hasData = true; }
        }
        if (hasData) {
            try {
                localStorage.setItem(BACKUP_KEY, JSON.stringify({ takenAt: nowIso(), fromSchema: current, data: snap }));
                result.backup = 'localStorage';
            } catch (e) {
                result.backup = 'failed';
                reportError('Cadangan otomatis sebelum pembaruan data tidak muat di penyimpanan. Pembaruan tetap aman (hanya menambah metadata), tetapi disarankan menekan Backup JSON sekarang.');
            }
        }

        // 2. Tambah metadata pada record lama
        const migratedAt = nowIso();
        for (const k of LIST_KEYS) {
            const raw = snap[k];
            if (raw === undefined) continue;
            let arr;
            try { arr = JSON.parse(raw); } catch (_) { continue; } // data rusak ditangani read()
            if (!Array.isArray(arr)) continue;
            let changed = false;
            for (const r of arr) {
                if (!r || typeof r !== 'object') continue;
                if (!('ownerId' in r)) { r.ownerId = null; changed = true; }
                if (!r.createdAt) { r.createdAt = timeFromLegacyId(recordId(r, k)) || migratedAt; changed = true; }
                if (!r.updatedAt) { r.updatedAt = r.createdAt; changed = true; }
                result.records++;
            }
            if (changed) {
                try { localStorage.setItem(k, JSON.stringify(arr)); }
                catch (e) { reportError('Pembaruan data gagal pada "' + k + '". Penyimpanan penuh.'); return result; }
            }
        }

        try { localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (_) {}
        result.migrated = true;
        return result;
    }

    return {
        read, write, remove, usage, migrate, secretGet, secretSet, secretClear,
        DATA_KEYS, LIST_KEYS, SCHEMA_VERSION, BACKUP_KEY,
        set onError(fn) { errorHandler = fn; }
    };
})();
