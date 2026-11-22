/**
 * Titik masuk aplikasi.
 * Menghubungkan galat penyimpanan ke modal, menjalankan initApp, lalu memeriksa kuota.
 */
window.onload = function () {
    Store.onError = function (msg) { showModal('Peringatan Penyimpanan', msg, '\u26A0\uFE0F'); };
    initApp();
    AIUI.init();
    AIUI.applyVisibility();
    const u = Store.usage();
    if (u.ratio >= 0.8) {
        const mb = (u.bytes / 1048576).toFixed(1);
        showModal('Penyimpanan Hampir Penuh',
            'Pemakaian penyimpanan browser sekitar ' + mb + ' MB dari perkiraan batas 5 MB. ' +
            'Lakukan Backup JSON dan hapus data periode lama agar data baru tetap bisa disimpan.', '\u26A0\uFE0F');
    }
};
