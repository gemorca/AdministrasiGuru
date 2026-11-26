/**
 * Titik masuk aplikasi.
 * Menyiapkan penyimpanan (IndexedDB atau localStorage), menghubungkan galat penyimpanan ke modal,
 * menjalankan gerbang login cloud (bila APP_CONFIG.supabaseUrl diatur) ATAU langsung initApp untuk mode lokal.
 */
window.onload = async function () {
    Store.onError = function (msg) { showModal('Peringatan Penyimpanan', msg, '\u26A0\uFE0F'); };
    const info = await Store.init({ mode: (window.APP_CONFIG && window.APP_CONFIG.storage) || 'indexeddb' });

    if (typeof Auth !== 'undefined' && Auth.isCloudConfigured()) {
        await Auth.boot();
        return;
    }

    initApp();
    AIUI.init();
    AIUI.applyVisibility();
    if (info.note) showModal('Penyimpanan', info.note, info.mode === 'idb' ? '\u2705' : '\u26A0\uFE0F');
    const u = Store.usage();
    if (u.ratio >= 0.8) {
        const mb = (u.bytes / 1048576).toFixed(1);
        showModal('Penyimpanan Hampir Penuh',
            'Pemakaian penyimpanan browser sekitar ' + mb + ' MB dari batas ' + (u.quota / 1048576).toFixed(0) + ' MB. ' +
            'Lakukan Backup JSON dan hapus data periode lama agar data baru tetap bisa disimpan.', '\u26A0\uFE0F');
    }
};
