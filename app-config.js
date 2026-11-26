/**
 * Konfigurasi bersama untuk seluruh guru (diisi admin sekolah, sekali saja).
 *
 * Mode 1 - Multi-Guru Cloud (Tahap 7, disarankan untuk satu sekolah di Vercel + Supabase):
 *   Isi `supabaseUrl` dan `supabaseAnonKey` di bawah (serta env Vercel: GEMINI_API_KEY, SUPABASE_URL,
 *   SUPABASE_ANON_KEY, AI_DAILY_LIMIT). Bila `supabaseUrl` diisi:
 *     - Aplikasi mewajibkan Login Google dan memeriksa undangan guru di sekolah.
 *     - AI otomatis lewat `/api/gemini` di Vercel (tidak ada lagi token/rahasia di browser).
 *
 * Mode 2 - Lokal Satu Pengguna (tanpa `supabaseUrl`):
 *   Data tersimpan di browser perangkat masing-masing, dan AI memakai proxy Apps Script di bawah.
 */
window.APP_CONFIG = window.APP_CONFIG || {
    // Aktifkan mode Cloud Multi-Guru dengan mengisi dua baris berikut (lihat supabase/PANDUAN.md):
    // PENTING: Gunakan Publishable key (sb_publishable_...) atau anon public key (eyJ...), JANGAN gunakan Secret key (sb_secret_...)!
    supabaseUrl: 'https://ulcnhluflppgavhrsrri.supabase.co',
    supabaseAnonKey: 'sb_publishable_gHyRk4NNpzLKaCKoNMvesQ_U5NKIhwg',
    ai: {
        proxyUrl: 'https://script.google.com/macros/s/AKfycbzAgFnBR9o3l3bEQuz4iATRi9vPZxNNb1jH1idm3IeWkOTwBragJU_iYVD6L1hJMdae/exec',                  // URL Web App Apps Script, berakhiran /exec
        token: 'mohamadagilnurekaputrasabdul2026',                     // sama dengan APP_TOKEN di Script Properties
        model: 'gemini-3.6-flash',     // model bawaan untuk semua guru
        fallbackModel: 'gemini-3.5-flash-lite'              // model cadangan bawaan (opsional)
    }
};
