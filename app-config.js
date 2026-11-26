/**
 * Konfigurasi bersama untuk seluruh guru (diisi admin sekolah, sekali saja).
 *
 * Mode 1 - Multi-Guru dengan Login (disarankan): isi `sheetsUrl` dengan URL Web App Apps Script
 *   (berakhiran /exec). Semua data (akun, kelas, siswa, nilai, dll.) tersimpan di Google Spreadsheet
 *   sekolah. Aplikasi menampilkan halaman Masuk / Daftar. Lihat apps-script/PANDUAN.md.
 *   AI Gemini memakai Web App yang sama dan otomatis memakai sesi login guru (tanpa token di browser).
 *
 * Mode 2 - Lokal Satu Pengguna: kosongkan `sheetsUrl`. Data tersimpan di browser masing-masing.
 *   AI (opsional) memakai proxy Apps Script lewat `ai.proxyUrl` + `ai.token`.
 *
 * JANGAN menaruh API key Gemini atau APP_TOKEN rahasia di berkas ini bila situs dipublikasikan:
 * berkas ini dapat dibaca siapa pun. Pada Mode 1 token tidak diperlukan.
 */
window.APP_CONFIG = window.APP_CONFIG || {
    sheetsUrl: 'https://script.google.com/macros/s/AKfycbycIdUcXSQNJ0g_2X2hm1oBK-Df7Z9DjILseHRROdDv19SBCrFAh2SYMRsWaD0jCNXIpg/exec',
    ai: {
        proxyUrl: '',                       // kosong = pakai sheetsUrl (Mode 1)
        token: '',                          // hanya untuk Mode 2
        model: 'gemini-3.6-flash',          // model bawaan untuk semua guru
        fallbackModel: 'gemini-3.5-flash-lite'  // model cadangan bawaan (opsional)
    }
};
