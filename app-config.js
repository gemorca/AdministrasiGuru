/**
 * Konfigurasi bersama untuk seluruh guru (diisi admin sekolah, sekali saja).
 *
 * Jika proxyUrl DAN token diisi, guru tidak perlu mengisi URL atau token di Pengaturan AI.
 * Guru cukup mengaktifkan AI dan menyetujui pemberitahuan privasi.
 *
 * PERINGATAN KEAMANAN: berkas ini ikut terkirim ke browser. Token terlihat oleh siapa pun yang dapat
 * membuka situs. Batasi risikonya:
 *   - atur DAILY_LIMIT di Script Properties Apps Script,
 *   - ganti APP_TOKEN (lalu berkas ini) bila diduga bocor,
 *   - jangan menaruh API key Gemini di sini (hanya token proxy),
 *   - login Google (Tahap 7) akan menggantikan token ini sepenuhnya.
 */
window.APP_CONFIG = window.APP_CONFIG || {
    ai: {
        proxyUrl: 'https://script.google.com/macros/s/AKfycbzAgFnBR9o3l3bEQuz4iATRi9vPZxNNb1jH1idm3IeWkOTwBragJU_iYVD6L1hJMdae/exec',                  // URL Web App Apps Script, berakhiran /exec
        token: 'mohamadagilnurekaputrasabdul2026',                     // sama dengan APP_TOKEN di Script Properties
        model: 'gemini-3.6-flash',     // model bawaan untuk semua guru
        fallbackModel: 'gemini-3.5-flash-lite'              // model cadangan bawaan (opsional)
    }
};
