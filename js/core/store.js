/**
 * Lapisan penyimpanan tunggal. Semua akses localStorage lewat sini.
 *
 * Tanggung jawab:
 *  - read/write JSON dengan penanganan galat (data rusak tidak ditimpa diam-diam, kuota penuh dilaporkan).
 *  - cap metadata record: createdAt, updatedAt, ownerId (ownerId dipakai fitur login di Tahap 7).
 *  - migrasi skema bertahap dengan snapshot cadangan sebelum mengubah data.
 *  - perkiraan pemakaian penyimpanan.
 *
 * Penyimpanan fisik (Tahap 6): IndexedDB bila tersedia, dengan salinan di memori sehingga antarmuka
 * read/write tetap sinkron. Penulisan ke IndexedDB berjalan di latar (lihat flush()). Data lama di
 * localStorage diimpor sekali, diverifikasi, baru dihapus dari localStorage. Bila IndexedDB tidak
 * tersedia atau gagal dibuka, otomatis kembali ke localStorage (perilaku lama, batas ±5 MB).
 * Rahasia AI tetap di localStorage (kecil, terpisah dari data dan backup).
 * Panggil `await Store.init()` sekali sebelum memakai read/write.
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
    const changeListeners = new Set();
    let ownerResolver = null;
    let errorHandler = null;
    let lastErrorAt = 0;

    const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const nowIso = () => new Date().toISOString();

    // Penyimpanan fallback di memori bila dijalankan di lingkungan tanpa localStorage (mis. Node.js)
    const memFallback = new Map();
    const ls = {
        getItem: k => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memFallback.has(k) ? memFallback.get(k) : null)),
        setItem: (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, String(v)); else memFallback.set(k, String(v)); },
        removeItem: k => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else memFallback.delete(k); },
        keys: () => {
            if (typeof localStorage === 'undefined') return Array.from(memFallback.keys());
            const out = []; try { for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (_) {}
            return out;
        }
    };

    // ---------- Lapisan fisik ----------
    // mode 'local'  : localStorage langsung.
    // mode 'idb'    : Map di memori (sumber baca) + penulisan ke IndexedDB di latar.
    const IDB_NAME = 'sistem_admin_guru', IDB_STORE = 'kv';
    const META_PREFIX = 'g_meta_';
    const NON_DATA = new Set(['g_ai_secret', 'g_ai_usage']); // tetap di localStorage
    let mode = 'local';
    let db = null;
    const mem = new Map();
    let pending = 0, idleWaiters = [], idbQuota = null, initInfo = { mode: 'local', imported: 0, note: '' };

    function trackStart() { pending++; }
    function trackEnd() { pending--; if (pending <= 0) { pending = 0; const w = idleWaiters; idleWaiters = []; w.forEach(f => f()); } }
    /** Menunggu semua penulisan latar ke IndexedDB selesai (mode local: langsung). */
    function flush() { return pending === 0 ? Promise.resolve() : new Promise(res => idleWaiters.push(res)); }

    function idbPut(key, value) {
        trackStart();
        try {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = trackEnd;
            tx.onabort = tx.onerror = () => { trackEnd(); reportError('Data gagal disimpan ke penyimpanan browser (IndexedDB). Lakukan Backup lalu muat ulang halaman.'); };
        } catch (e) { trackEnd(); reportError('Data gagal disimpan ke penyimpanan browser (IndexedDB): ' + (e && e.message ? e.message : e)); }
    }
    function idbDelete(key) {
        trackStart();
        try {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = trackEnd; tx.onabort = tx.onerror = trackEnd;
        } catch (e) { trackEnd(); }
    }

    function rawGet(k) { if (mode === 'idb' && !NON_DATA.has(k)) return mem.has(k) ? mem.get(k) : null; return ls.getItem(k); }
    function rawSet(k, v) { if (mode === 'idb' && !NON_DATA.has(k)) { mem.set(k, v); idbPut(k, v); return; } ls.setItem(k, v); }
    function rawRemove(k) { if (mode === 'idb' && !NON_DATA.has(k)) { mem.delete(k); idbDelete(k); return; } ls.removeItem(k); }
    function rawKeys() {
        if (mode === 'idb') return Array.from(mem.keys());
        return ls.keys();
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB gagal dibuka'));
            req.onblocked = () => reject(new Error('IndexedDB terblokir'));
        });
    }
    function loadAll(d) {
        return new Promise((resolve, reject) => {
            const out = new Map();
            const tx = d.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).openCursor();
            req.onsuccess = () => { const c = req.result; if (c) { out.set(c.key, c.value); c.continue(); } };
            tx.oncomplete = () => resolve(out);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('Gagal membaca IndexedDB'));
        });
    }
    function putMany(d, entries) {
        return new Promise((resolve, reject) => {
            const tx = d.transaction(IDB_STORE, 'readwrite'); const st = tx.objectStore(IDB_STORE);
            entries.forEach(([k, v]) => st.put(v, k));
            tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error('Gagal menulis IndexedDB'));
        });
    }

    /**
     * Pilih dan siapkan penyimpanan. opts.mode: 'local' memaksa localStorage; selain itu IndexedDB bila ada.
     * Mengembalikan { mode, imported, note }. Tidak pernah melempar: kegagalan -> kembali ke localStorage.
     */
    async function init(opts) {
        const want = (opts && opts.mode) || 'indexeddb';
        if (want === 'local' || typeof indexedDB === 'undefined') { mode = 'local'; initInfo = { mode, imported: 0, note: want === 'local' ? '' : 'IndexedDB tidak tersedia; memakai localStorage.' }; return initInfo; }
        try {
            const d = await openDb();
            const stored = await loadAll(d);
            let imported = 0, note = '';
            if (stored.size === 0) {
                // Impor satu kali dari localStorage (pengguna lama). Hanya kunci data aplikasi.
                const entries = [];
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('g_') && !NON_DATA.has(k)) entries.push([k, localStorage.getItem(k)]);
                    }
                } catch (_) {}
                if (entries.length) {
                    await putMany(d, entries);
                    const back = await loadAll(d);                           // verifikasi baca ulang
                    const okAll = entries.every(([k, v]) => back.get(k) === v);
                    if (!okAll) throw new Error('Verifikasi impor gagal');
                    entries.forEach(([k, v]) => stored.set(k, v));
                    entries.forEach(([k]) => { try { localStorage.removeItem(k); } catch (_) {} });  // hapus lama hanya setelah terverifikasi
                    imported = entries.length;
                    note = `Data dipindahkan ke penyimpanan IndexedDB (${imported} kunci).`;
                }
            }
            db = d; mem.clear(); stored.forEach((v, k) => mem.set(k, v));
            mode = 'idb';
            try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { if (e && e.quota) idbQuota = e.quota; }).catch(() => {}); } catch (_) {}
            initInfo = { mode, imported, note };
        } catch (e) {
            mode = 'local'; db = null; mem.clear();
            initInfo = { mode, imported: 0, note: 'IndexedDB tidak dapat dipakai (' + (e && e.message ? e.message : e) + '); memakai localStorage. Data Anda aman.' };
        }
        return initInfo;
    }

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
        try { raw = rawGet(key); } catch (e) { reportError('Penyimpanan browser tidak dapat dibaca.'); return clone(fallback); }
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
            try { rawSet(`g_corrupt_${key}_${Date.now()}`, raw); } catch (_) { /* kuota penuh: abaikan */ }
            reportError(`Data "${key}" rusak dan tidak bisa dibaca. Salinan mentah disimpan dengan awalan g_corrupt_.`);
            sigCache[key] = {};
            return clone(fallback);
        }
    }

    /**
     * Tulis satu kunci. Daftar record dicap createdAt/updatedAt/ownerId (kecuali opts.keepStamps).
     * Bila !opts.silent, perubahan per record dilaporkan ke listener onChange (termasuk tombstone hapus).
     * Mengembalikan true jika berhasil.
     */
    function write(key, value, opts) {
        const silent = !!(opts && opts.silent);
        const keepStamps = !!(opts && opts.keepStamps);
        const defaultOwner = typeof ownerResolver === 'function' ? ownerResolver(key) : null;
        let prevRaw = null;
        if (!silent && changeListeners.size > 0) {
            try { prevRaw = rawGet(key); } catch (_) {}
        }

        if (Array.isArray(value)) {
            const cache = sigCache[key] || (sigCache[key] = {});
            const t = nowIso();
            const nextCache = {};
            for (const r of value) {
                if (!r || typeof r !== 'object') continue;
                if (!keepStamps) {
                    if (!('ownerId' in r)) r.ownerId = defaultOwner;
                    else if (r.ownerId === null && defaultOwner !== null) r.ownerId = defaultOwner;
                    if (!r.createdAt) r.createdAt = t;
                } else {
                    if (!('ownerId' in r)) r.ownerId = defaultOwner;
                    if (!r.createdAt) r.createdAt = r.updatedAt || t;
                }
                const id = recordId(r, key);
                if (id) {
                    const sig = signature(r);
                    if (!keepStamps) {
                        if (cache[id] === undefined || cache[id] !== sig) r.updatedAt = t;
                        else if (!r.updatedAt) r.updatedAt = r.createdAt;
                    } else if (!r.updatedAt) {
                        r.updatedAt = r.createdAt;
                    }
                    nextCache[id] = signature(r);
                } else if (!r.updatedAt) {
                    r.updatedAt = r.createdAt;
                }
            }
            sigCache[key] = nextCache;
        }

        const serialized = JSON.stringify(value);
        try {
            rawSet(key, serialized);
        } catch (e) {
            reportError(isQuotaError(e)
                ? 'Penyimpanan browser penuh. Data terakhir BELUM tersimpan. Lakukan Backup lalu kurangi data lama.'
                : 'Data gagal disimpan: ' + (e && e.message ? e.message : e));
            return false;
        }

        if (!silent && changeListeners.size > 0 && DATA_KEYS.includes(key)) {
            const changes = diffChanges(key, prevRaw, value, serialized, defaultOwner);
            if (changes.length) {
                changeListeners.forEach(fn => { try { fn(changes, key); } catch (_) {} });
            }
        }
        return true;
    }

    function diffChanges(key, prevRaw, nextVal, nextJson, defaultOwner) {
        const t = nowIso();
        const out = [];
        if (Array.isArray(nextVal)) {
            let prevArr = [];
            if (prevRaw !== null) {
                try { const p = JSON.parse(prevRaw); if (Array.isArray(p)) prevArr = p; } catch (_) {}
            }
            const prevById = new Map();
            for (const r of prevArr) {
                const id = recordId(r, key);
                if (id) prevById.set(id, r);
            }
            for (const r of nextVal) {
                const id = recordId(r, key);
                if (!id) continue;
                const prev = prevById.get(id);
                prevById.delete(id);
                if (!prev || signature(prev) !== signature(r)) {
                    out.push({
                        tbl: key,
                        id: String(id),
                        record: clone(r),
                        deleted: false,
                        clientAt: r.updatedAt || t,
                        ownerId: r.ownerId !== undefined ? r.ownerId : defaultOwner
                    });
                }
            }
            for (const [delId, prevRec] of prevById.entries()) {
                out.push({
                    tbl: key,
                    id: String(delId),
                    record: null,
                    deleted: true,
                    clientAt: t,
                    ownerId: (prevRec && prevRec.ownerId !== undefined) ? prevRec.ownerId : defaultOwner
                });
            }
        } else if (OBJECT_KEYS.includes(key) && nextVal && typeof nextVal === 'object') {
            if (prevRaw !== nextJson) {
                out.push({
                    tbl: key,
                    id: 'settings',
                    record: clone(nextVal),
                    deleted: false,
                    clientAt: t,
                    ownerId: defaultOwner
                });
            }
        }
        return out;
    }

    function onChange(fn) {
        changeListeners.add(fn);
        return () => changeListeners.delete(fn);
    }

    function setOwnerResolver(fn) {
        ownerResolver = typeof fn === 'function' ? fn : null;
    }

    function metaGet(name, fallback = null) {
        let raw = null;
        try { raw = rawGet(META_PREFIX + name); } catch (_) { return clone(fallback); }
        if (raw === null) return clone(fallback);
        try { return JSON.parse(raw); } catch (_) { return clone(fallback); }
    }

    function metaSet(name, value) {
        const k = META_PREFIX + name;
        if (value === null || value === undefined) { remove(k); return true; }
        try { rawSet(k, JSON.stringify(value)); return true; } catch (_) { return false; }
    }

    /** Menghapus seluruh data aplikasi dan metadata sinkronisasi (dipakai saat ganti akun di perangkat yang sama). */
    async function wipe() {
        for (const k of DATA_KEYS) remove(k);
        remove(SCHEMA_KEY);
        remove(BACKUP_KEY);
        for (const k of rawKeys().slice()) {
            if (k && (k.startsWith(META_PREFIX) || k.startsWith('g_corrupt_'))) remove(k);
        }
        Object.keys(sigCache).forEach(k => delete sigCache[k]);
        await flush();
    }

    function remove(key) { try { rawRemove(key); } catch (_) {} }

    // Rahasia (API key / token proxy AI). Kunci terpisah, TIDAK termasuk DATA_KEYS:
    // tidak ikut backup, tidak ikut snapshot migrasi, tidak terhapus oleh restore.
    const SECRET_KEY = 'g_ai_secret';
    function secretGet() { try { return ls.getItem(SECRET_KEY) || ''; } catch (_) { return ''; } }
    function secretSet(v) {
        try { ls.setItem(SECRET_KEY, String(v)); return true; }
        catch (e) { reportError('Kunci AI gagal disimpan: penyimpanan browser penuh.'); return false; }
    }
    function secretClear() { try { ls.removeItem(SECRET_KEY); } catch (_) {} }

    /** Perkiraan pemakaian. local: UTF-16 2 byte/karakter vs batas ±5 MB. idb: ukuran data vs kuota browser (bila diketahui). */
    function usage() {
        let chars = 0;
        try { for (const k of rawKeys()) chars += k.length + (rawGet(k) || '').length; } catch (_) {}
        const bytes = chars * 2;
        const quota = mode === 'idb' ? (idbQuota || 0) : QUOTA_BYTES;
        return { bytes, quota, ratio: quota ? bytes / quota : 0, backend: mode };
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
        try { current = parseInt(rawGet(SCHEMA_KEY) || '0', 10) || 0; } catch (_) {}
        const result = { from: current, to: SCHEMA_VERSION, migrated: false, records: 0, backup: 'none' };
        if (current >= SCHEMA_VERSION) return result;

        // 1. Snapshot
        const snap = {};
        let hasData = false;
        for (const k of DATA_KEYS) {
            const raw = rawGet(k);
            if (raw !== null) { snap[k] = raw; hasData = true; }
        }
        if (hasData) {
            try {
                rawSet(BACKUP_KEY, JSON.stringify({ takenAt: nowIso(), fromSchema: current, data: snap }));
                result.backup = mode === 'idb' ? 'indexeddb' : 'localStorage';
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
                try { rawSet(k, JSON.stringify(arr)); }
                catch (e) { reportError('Pembaruan data gagal pada "' + k + '". Penyimpanan penuh.'); return result; }
            }
        }

        try { rawSet(SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (_) {}
        result.migrated = true;
        return result;
    }

    return {
        init, flush, read, write, remove, usage, migrate, secretGet, secretSet, secretClear,
        onChange, setOwnerResolver, metaGet, metaSet, wipe, recordId,
        get backend() { return mode; }, get initInfo() { return initInfo; },
        DATA_KEYS, LIST_KEYS, OBJECT_KEYS, SCHEMA_VERSION, BACKUP_KEY,
        set onError(fn) { errorHandler = fn; }
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Store;
