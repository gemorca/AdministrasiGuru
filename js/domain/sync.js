/**
 * Logika murni sinkronisasi multi-guru (tanpa DOM, tanpa Store, tanpa jaringan).
 * Dapat diuji penuh di Node.js.
 *
 * Pembagian kepemilikan tabel:
 *   - Data sekolah (SHARED_TABLES): g_per, g_cls, g_stu -> ownerId = null, hanya admin boleh tulis.
 *   - Data guru (TEACHER_TABLES): seluruh tabel lain termasuk g_set -> ownerId = userId.
 */
const SyncDomain = (() => {
    const SHARED_TABLES = ['g_per', 'g_cls', 'g_stu'];
    const TEACHER_LIST_TABLES = [
        'g_mtg', 'g_att', 'g_ass', 'g_scr', 'g_fol',
        'g_cp', 'g_tp', 'g_mat', 'g_qst', 'g_pkg', 'g_rdesc', 'g_sch', 'g_jour',
        'g_p5_proj', 'g_assign', 'g_submit', 'g_guardians', 'g_communications',
        'g_docs', 'g_dt', 'g_dts'
    ];
    const OBJECT_TABLES = ['g_set'];
    const TEACHER_TABLES = [...TEACHER_LIST_TABLES, ...OBJECT_TABLES];
    const ALL_TABLES = [...SHARED_TABLES, ...TEACHER_TABLES];
    const ID_FIELD = { g_cp: 'cpId', g_tp: 'tpId', g_cls: 'classId' };
    const SETTINGS_RECORD_ID = 'settings';
    const CURSOR_OVERLAP = 50;
    const BACKOFF_MS = [1000, 3000, 10000, 30000, 60000];

    const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const isSharedTable = tbl => SHARED_TABLES.includes(tbl);
    const isObjectTable = tbl => OBJECT_TABLES.includes(tbl);
    const isValidTable = tbl => ALL_TABLES.includes(tbl);

    function canWriteTable(tbl, role) {
        if (!isValidTable(tbl)) return false;
        if (isSharedTable(tbl)) return role === 'admin';
        return role === 'admin' || role === 'teacher';
    }

    function ownerForTable(tbl, userId) {
        return isSharedTable(tbl) ? null : (userId || null);
    }

    function recordId(r, tbl) {
        if (isObjectTable(tbl)) return SETTINGS_RECORD_ID;
        if (!r || typeof r !== 'object') return null;
        if (tbl === 'g_dts') return (r.testId && r.studentId) ? r.testId + '|' + r.studentId : null;
        const f = ID_FIELD[tbl] || 'id';
        return r[f] ? String(r[f]) : null;
    }

    function queueKey(item) {
        return `${item.tbl}:${item.id}`;
    }

    /**
     * Menggabungkan perubahan baru ke antrean yang sudah ada.
     * Perubahan pada (tbl, id) yang sama disatukan menjadi versi terbaru agar hemat permintaan.
     */
    function coalesceQueue(existingQueue, incomingChanges) {
        const out = (existingQueue || []).map(clone);
        const idxByKey = new Map();
        out.forEach((it, idx) => idxByKey.set(queueKey(it), idx));
        for (const raw of (incomingChanges || [])) {
            if (!raw || !raw.tbl || !raw.id) continue;
            const item = {
                tbl: String(raw.tbl),
                id: String(raw.id),
                owner_id: raw.owner_id !== undefined ? raw.owner_id : (raw.ownerId !== undefined ? raw.ownerId : null),
                data: raw.deleted ? null : clone(raw.data !== undefined ? raw.data : raw.record),
                deleted: !!raw.deleted,
                client_at: raw.client_at || raw.clientAt || new Date().toISOString()
            };
            const k = queueKey(item);
            if (idxByKey.has(k)) {
                out[idxByKey.get(k)] = item;
            } else {
                idxByKey.set(k, out.length);
                out.push(item);
            }
        }
        return out;
    }

    /**
     * Menerapkan baris hasil pull_records pada satu tabel daftar lokal.
     * Aturan:
     *   - Data yang masih berada di antrean lokal (pendingIds) menang secara lokal (tidak ditimpa).
     *   - Tombstone (deleted = true) menghapus record dari daftar lokal.
     *   - Baris aktif menyisipkan atau memperbarui record dengan mempertahankan cap waktu server.
     */
    function applyPullToList(localList, remoteRows, pendingIds, tbl) {
        const pending = pendingIds instanceof Set ? pendingIds : new Set(pendingIds || []);
        const out = Array.isArray(localList) ? localList.map(clone) : [];
        const idxMap = new Map();
        const rebuildIndex = () => {
            idxMap.clear();
            out.forEach((r, i) => {
                const id = recordId(r, tbl);
                if (id) idxMap.set(id, i);
            });
        };
        rebuildIndex();
        let changed = false;

        for (const row of (remoteRows || [])) {
            if (!row || row.tbl !== tbl || !row.id) continue;
            const id = String(row.id);
            if (pending.has(id)) continue; // Data pending menang lokal

            if (row.deleted) {
                if (idxMap.has(id)) {
                    out.splice(idxMap.get(id), 1);
                    rebuildIndex();
                    changed = true;
                }
                continue;
            }

            if (!row.data || typeof row.data !== 'object') continue;
            const rec = clone(row.data);
            rec.ownerId = isSharedTable(tbl) ? null : (row.owner_id || rec.ownerId || null);
            if (row.client_at) rec.updatedAt = row.client_at;
            if (!rec.createdAt) rec.createdAt = rec.updatedAt || new Date().toISOString();

            if (idxMap.has(id)) {
                const pos = idxMap.get(id);
                if (JSON.stringify(out[pos]) !== JSON.stringify(rec)) {
                    out[pos] = rec;
                    changed = true;
                }
            } else {
                idxMap.set(id, out.length);
                out.push(rec);
                changed = true;
            }
        }
        return { list: out, changed };
    }

    /**
     * Menerapkan baris hasil pull_records pada objek pengaturan (g_set).
     * Mengembalikan { value, changed }.
     */
    function applyPullToObject(localObj, remoteRows, pendingIds, tbl) {
        const pending = pendingIds instanceof Set ? pendingIds : new Set(pendingIds || []);
        if (pending.has(SETTINGS_RECORD_ID)) return { value: clone(localObj || {}), changed: false };
        const matching = (remoteRows || []).filter(r => r && r.tbl === tbl && r.id === SETTINGS_RECORD_ID);
        if (!matching.length) return { value: clone(localObj || {}), changed: false };
        const latest = matching[matching.length - 1];
        if (latest.deleted || !latest.data || typeof latest.data !== 'object') {
            return { value: clone(localObj || {}), changed: false };
        }
        const cur = clone(localObj || {});
        const next = { ...cur, ...clone(latest.data) };
        if (cur.ai || (latest.data && latest.data.ai)) {
            next.ai = { ...(cur.ai || {}), ...((latest.data && latest.data.ai) || {}) };
        }
        const changed = JSON.stringify(cur) !== JSON.stringify(next);
        return { value: next, changed };
    }

    /**
     * Membangun daftar antrean awal (enqueueAll) untuk mengunggah data lokal lama saat koneksi pertama.
     * Admin mengunggah semua tabel (sekolah + milik admin); guru hanya mengunggah tabel milik guru.
     */
    function buildInitialChanges(snapshotByTable, { userId, role, now } = {}) {
        const ts = now || new Date().toISOString();
        const items = [];
        for (const tbl of ALL_TABLES) {
            if (!canWriteTable(tbl, role)) continue;
            const val = snapshotByTable && snapshotByTable[tbl];
            const owner_id = ownerForTable(tbl, userId);
            if (isObjectTable(tbl)) {
                if (val && typeof val === 'object' && Object.keys(val).length > 0) {
                    const clean = clone(val);
                    items.push({ tbl, id: SETTINGS_RECORD_ID, owner_id, data: clean, deleted: false, client_at: ts });
                }
                continue;
            }
            if (!Array.isArray(val)) continue;
            for (const r of val) {
                const id = recordId(r, tbl);
                if (!id) continue;
                const rec = clone(r);
                rec.ownerId = owner_id;
                if (!rec.createdAt) rec.createdAt = ts;
                if (!rec.updatedAt) rec.updatedAt = ts;
                items.push({
                    tbl,
                    id,
                    owner_id,
                    data: rec,
                    deleted: false,
                    client_at: rec.updatedAt || ts
                });
            }
        }
        return items;
    }

    /** Kursor tarik memakai tumpang tindih agar transaksi konkuren di Postgres tidak terlewat. */
    function pullFromCursor(cursor, overlap = CURSOR_OVERLAP) {
        const c = Number(cursor) || 0;
        const ov = Math.max(0, Number(overlap) || 0);
        return Math.max(0, c - ov);
    }

    function backoffDelay(attempt) {
        const idx = Math.max(0, Math.min(Number(attempt) || 0, BACKOFF_MS.length - 1));
        return BACKOFF_MS[idx];
    }

    return {
        SHARED_TABLES,
        TEACHER_LIST_TABLES,
        TEACHER_TABLES,
        OBJECT_TABLES,
        ALL_TABLES,
        SETTINGS_RECORD_ID,
        CURSOR_OVERLAP,
        BACKOFF_MS,
        isSharedTable,
        isObjectTable,
        isValidTable,
        canWriteTable,
        ownerForTable,
        recordId,
        coalesceQueue,
        applyPullToList,
        applyPullToObject,
        buildInitialChanges,
        pullFromCursor,
        backoffDelay
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SyncDomain;
