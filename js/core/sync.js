/**
 * Mesin sinkronisasi luring-daring (menghubungkan Store, SyncDomain, dan adaptor remote Supabase).
 *
 * Jaminan utama:
 *   - Antrean tersimpan di Store.metaSet('sync_queue') sehingga tahan muat ulang / browser ditutup.
 *   - Retry bertahap saat jaringan putus atau server gagal sementara.
 *   - Tarik berhalaman (paginated pull) memakai kursor seq dengan tumpang tindih ±50.
 *   - Data pending di antrean menang lokal (tidak ditimpa hasil tarik sebelum berhasil dikirim).
 *   - Tanpa gema: penulisan hasil tarik ke Store memakai { silent: true, keepStamps: true }.
 */
const Sync = (() => {
    const _Domain = (typeof SyncDomain !== 'undefined') ? SyncDomain : require('../domain/sync.js');

    const META_QUEUE = 'sync_queue';
    const META_CURSOR = 'sync_cursor';
    const META_LAST_AT = 'sync_last_at';
    const PUSH_BATCH = 200;
    const PULL_PAGE = 500;

    let storeRef = (typeof Store !== 'undefined') ? Store : null;
    let remote = null;
    let userId = null;
    let role = 'teacher';
    let started = false;
    let syncing = false;
    let syncAgain = false;
    let retryAttempt = 0;
    let retryTimer = null;
    let debounceTimer = null;
    let pollTimer = null;
    let unsubStore = null;
    let lastError = null;
    let lastRejected = [];
    let onRemoteApplied = null;
    let onlineCheck = () => (typeof navigator === 'undefined' || navigator.onLine !== false);
    const statusListeners = new Set();
    let winHandlers = null;

    function use(overrides) {
        if (!overrides) return;
        if (overrides.store) storeRef = overrides.store;
        if (overrides.online) onlineCheck = overrides.online;
    }

    function getQueue() {
        const q = storeRef ? storeRef.metaGet(META_QUEUE, []) : [];
        return Array.isArray(q) ? q : [];
    }
    function setQueue(q) {
        if (storeRef) storeRef.metaSet(META_QUEUE, q);
    }
    function getCursor() {
        const v = storeRef ? storeRef.metaGet(META_CURSOR, 0) : 0;
        return Number(v) || 0;
    }
    function setCursor(c) {
        if (storeRef) storeRef.metaSet(META_CURSOR, Number(c) || 0);
    }

    function status() {
        const q = getQueue();
        const online = onlineCheck();
        let state = 'idle';
        if (syncing) state = 'syncing';
        else if (!online) state = 'offline';
        else if (lastError) state = 'error';
        return {
            started,
            state,
            pending: q.length,
            cursor: getCursor(),
            lastSyncAt: storeRef ? storeRef.metaGet(META_LAST_AT, null) : null,
            lastError,
            rejected: lastRejected.slice()
        };
    }

    function emitStatus() {
        const st = status();
        statusListeners.forEach(fn => { try { fn(st); } catch (_) {} });
    }

    function onStatus(fn) {
        statusListeners.add(fn);
        return () => statusListeners.delete(fn);
    }

    function clearTimers() {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    }

    function handleLocalChanges(changes) {
        if (!changes || !changes.length) return;
        const allowed = [];
        for (const c of changes) {
            if (!_Domain.canWriteTable(c.tbl, role)) continue;
            allowed.push({
                tbl: c.tbl,
                id: c.id,
                owner_id: _Domain.ownerForTable(c.tbl, userId),
                data: c.deleted ? null : c.record,
                deleted: !!c.deleted,
                client_at: c.clientAt || new Date().toISOString()
            });
        }
        if (!allowed.length) return;
        const merged = _Domain.coalesceQueue(getQueue(), allowed);
        setQueue(merged);
        emitStatus();
        if (started) scheduleSync(250);
    }

    function scheduleSync(ms) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { debounceTimer = null; syncNow().catch(() => {}); }, ms);
    }

    function scheduleRetry() {
        if (!started || retryTimer) return;
        const wait = _Domain.backoffDelay(retryAttempt);
        retryAttempt++;
        retryTimer = setTimeout(() => { retryTimer = null; syncNow().catch(() => {}); }, wait);
    }

    /** Mengirim seluruh antrean dalam potongan batch. */
    async function pushAll() {
        if (!remote) return { pushed: 0, rejected: [] };
        let totalPushed = 0;
        const rejectedAll = [];
        while (true) {
            const q = getQueue();
            if (!q.length) break;
            const batch = q.slice(0, PUSH_BATCH);
            const res = await remote.push(batch);
            const rej = Array.isArray(res && res.rejected) ? res.rejected : [];
            if (rej.length) {
                rejectedAll.push(...rej);
                lastRejected = rej;
            }
            // Keluarkan item batch yang sudah diproses (baik accepted maupun rejected karena RLS)
            // sementara item baru yang mungkin masuk selama await tetap aman.
            const sentKeys = new Map(batch.map(it => [`${it.tbl}:${it.id}`, it.client_at]));
            const current = getQueue();
            const remaining = current.filter(it => {
                const k = `${it.tbl}:${it.id}`;
                return !(sentKeys.has(k) && sentKeys.get(k) === it.client_at);
            });
            setQueue(remaining);
            totalPushed += batch.length - rej.length;
        }
        return { pushed: totalPushed, rejected: rejectedAll };
    }

    /** Menarik seluruh halaman perubahan dari server memakai tumpang tindih kursor ±50. */
    async function pullAll() {
        if (!remote || !storeRef) return { changedTables: [], rows: 0 };
        const baseCursor = getCursor();
        let since = _Domain.pullFromCursor(baseCursor, _Domain.CURSOR_OVERLAP);
        let maxSeq = baseCursor;
        const allRows = [];

        for (let guard = 0; guard < 100; guard++) {
            const page = await remote.pull(since, PULL_PAGE);
            const rows = Array.isArray(page && page.rows) ? page.rows : [];
            allRows.push(...rows);
            const pageSeq = Number(page && page.last_seq) || 0;
            if (pageSeq > maxSeq) maxSeq = pageSeq;
            if (!page || !page.has_more || !rows.length || pageSeq <= since) break;
            since = pageSeq;
        }

        const changedTables = applyRemoteRows(allRows);
        if (maxSeq > baseCursor) setCursor(maxSeq);
        storeRef.metaSet(META_LAST_AT, new Date().toISOString());
        if (changedTables.length && typeof onRemoteApplied === 'function') {
            try { onRemoteApplied(changedTables); } catch (_) {}
        }
        return { changedTables, rows: allRows.length, cursor: maxSeq };
    }

    function applyRemoteRows(rows) {
        if (!rows || !rows.length || !storeRef) return [];
        const q = getQueue();
        const pendingByTbl = new Map();
        for (const it of q) {
            if (!pendingByTbl.has(it.tbl)) pendingByTbl.set(it.tbl, new Set());
            pendingByTbl.get(it.tbl).add(String(it.id));
        }

        const byTbl = new Map();
        for (const r of rows) {
            if (!r || !_Domain.isValidTable(r.tbl)) continue;
            if (!byTbl.has(r.tbl)) byTbl.set(r.tbl, []);
            byTbl.get(r.tbl).push(r);
        }

        const changedTables = [];
        for (const [tbl, tblRows] of byTbl.entries()) {
            const pend = pendingByTbl.get(tbl) || new Set();
            if (_Domain.isObjectTable(tbl)) {
                const cur = storeRef.read(tbl, {});
                const { value, changed } = _Domain.applyPullToObject(cur, tblRows, pend, tbl);
                if (changed) {
                    storeRef.write(tbl, value, { silent: true, keepStamps: true });
                    changedTables.push(tbl);
                }
            } else {
                const cur = storeRef.read(tbl, []);
                const { list, changed } = _Domain.applyPullToList(cur, tblRows, pend, tbl);
                if (changed) {
                    storeRef.write(tbl, list, { silent: true, keepStamps: true });
                    changedTables.push(tbl);
                }
            }
        }
        return changedTables;
    }

    async function syncNow() {
        if (!remote || !storeRef) return status();
        if (!onlineCheck()) { emitStatus(); return status(); }
        if (syncing) { syncAgain = true; return status(); }

        syncing = true;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        emitStatus();
        try {
            do {
                syncAgain = false;
                await pushAll();
                await pullAll();
            } while (syncAgain && onlineCheck());
            lastError = null;
            retryAttempt = 0;
        } catch (e) {
            lastError = (e && e.message) ? e.message : String(e);
            scheduleRetry();
        } finally {
            syncing = false;
            emitStatus();
        }
        return status();
    }

    /**
     * Memasukkan seluruh data lokal ke antrean unggah (koneksi pertama).
     * Admin: semua tabel. Guru: hanya tabel milik guru (data sekolah diambil dari server).
     */
    function enqueueAll(opts = {}) {
        if (!storeRef) return 0;
        const effRole = opts.role || role;
        const effUser = opts.userId !== undefined ? opts.userId : userId;
        const snap = {};
        for (const tbl of _Domain.ALL_TABLES) {
            snap[tbl] = storeRef.read(tbl, _Domain.isObjectTable(tbl) ? {} : []);
        }
        const initial = _Domain.buildInitialChanges(snap, { userId: effUser, role: effRole });
        const merged = _Domain.coalesceQueue(getQueue(), initial);
        setQueue(merged);
        emitStatus();
        return initial.length;
    }

    /** Menunggu antrean kosong sebelum keluar akun (mencoba kirim bila masih ada). */
    async function waitUntilDrained(timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        while (getQueue().length > 0 && Date.now() < deadline) {
            if (!onlineCheck()) break;
            await syncNow();
            if (lastError) break;
            if (getQueue().length > 0) await new Promise(r => setTimeout(r, 150));
        }
        return { drained: getQueue().length === 0, pending: getQueue().length };
    }

    function configure({ remote: r, userId: uid, role: rl, onRemoteApplied: cb } = {}) {
        if (r !== undefined) remote = r;
        if (uid !== undefined) userId = uid;
        if (rl !== undefined) role = rl || 'teacher';
        if (cb !== undefined) onRemoteApplied = cb;
        if (storeRef && storeRef.setOwnerResolver) {
            storeRef.setOwnerResolver(tbl => _Domain.ownerForTable(tbl, userId));
        }
    }

    function start(opts = {}) {
        stop();
        configure(opts);
        started = true;
        lastError = null;
        retryAttempt = 0;
        if (storeRef && storeRef.onChange) {
            unsubStore = storeRef.onChange(handleLocalChanges);
        }
        const pollMs = opts.pollMs !== undefined ? opts.pollMs : 60000;
        if (pollMs > 0) {
            pollTimer = setInterval(() => { if (onlineCheck()) syncNow().catch(() => {}); }, pollMs);
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
            const onWake = () => { retryAttempt = 0; syncNow().catch(() => {}); };
            window.addEventListener('online', onWake);
            window.addEventListener('focus', onWake);
            winHandlers = onWake;
        }
        emitStatus();
        if (opts.immediate !== false && onlineCheck()) syncNow().catch(() => {});
    }

    function stop() {
        started = false;
        clearTimers();
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (unsubStore) { unsubStore(); unsubStore = null; }
        if (winHandlers && typeof window !== 'undefined' && window.removeEventListener) {
            window.removeEventListener('online', winHandlers);
            window.removeEventListener('focus', winHandlers);
            winHandlers = null;
        }
        emitStatus();
    }

    function resetState() {
        stop();
        remote = null;
        userId = null;
        role = 'teacher';
        lastError = null;
        lastRejected = [];
        onRemoteApplied = null;
        if (storeRef && storeRef.setOwnerResolver) storeRef.setOwnerResolver(null);
    }

    return {
        use,
        configure,
        start,
        stop,
        resetState,
        syncNow,
        pushAll,
        pullAll,
        enqueueAll,
        waitUntilDrained,
        status,
        onStatus,
        getQueue
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sync;
