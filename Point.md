# Point.md: Rencana dan Status Proyek "Sistem Administrasi Guru Terpadu"

Dokumen ini ringkasan lengkap untuk melanjutkan proyek di percakapan baru. Unggah bersama zip aplikasi terbaru (`sistem-administrasi-guru-tahap4b.zip`) lalu minta asisten membaca `Point.md` dan `README.md` lebih dulu.

## 1. Latar dan tujuan

Pengguna (guru) memiliki prototipe satu berkas HTML (`sistem_administrasi_guru (5).html`, ±5.800 baris, 23 menu) untuk administrasi guru SMP Kurikulum Merdeka: siswa, kelas, jadwal, CP/TP, modul ajar, bank soal, absensi, nilai, analisis ulangan, remedial, rapor, komunikasi wali, surat, laporan. Semua "AI" di prototipe hanyalah simulasi `setTimeout`. Tujuan proyek: merapikan fungsi inti dan mengganti semua fitur AI dengan **Google Gemini sungguhan**. Fokus awal adalah fungsi, bukan tampilan.

## 2. Lingkungan dan keputusan pengguna

- **Deploy:** hosting statis di **Vercel** (tanpa build). Backend ringan memakai **Google Apps Script** (Web App) sebagai proxy Gemini dan, nanti, penyimpanan/login.
- **AI:** API key dari **Google AI Studio**. Langganan Gemini Plus/Pro **tidak** mencakup kuota API; API memakai kuota gratis atau penagihan sendiri (terverifikasi di dokumentasi Google).
- **Hasil uji nyata pengguna:** `gemini-3.6-flash` berhasil lewat proxy (proxy ±1,6 dtk, Gemini ±3,5 dtk, keluaran terstruktur gaya `format` jalan). `gemini-3.8-flash` bermasalah: 503 berulang dan eksekusi Apps Script menggantung >2 menit. Pakai 3.6 sebagai bawaan.
- **Keputusan:**
  - Proxy Apps Script adalah jalur utama; API key langsung di browser hanya cadangan.
  - **Tidak** memakai rotasi banyak API key. Limit Gemini dihitung per proyek, bukan per key, dan aturan Google soal banyak proyek belum diverifikasi.
  - Login dikerjakan **terakhir** (Tahap 7).
  - Konfigurasi bersama (URL proxy + token di `app-config.js`) dipakai sementara agar guru tidak mengisi apa pun; penggantinya login Google.
  - Gaya ringkas (caveman lite) hanya untuk fitur internal guru, bukan dokumen.
- **Pertanyaan terbuka:** satu guru atau banyak guru? Akun Google Workspace sekolah atau gmail biasa (menentukan pembatasan login per domain)? Tier Gemini gratis atau berbayar (kebijakan data siswa)? Kebijakan sekolah untuk nilai kosong dan penalti kehadiran (bawaan: kosong = Belum Lengkap; penalti proporsional di bawah 80%, dapat dimatikan). Perlu ekspor `.docx`/PDF sungguhan (sekarang `.doc` via HTML dan cetak browser)? Format e-Rapor tertentu?

## 3. Arsitektur dan konvensi (wajib dijaga)

Aplikasi statis, skrip klasik (bukan ES module) agar `onclick="..."` tetap jalan dan bisa dibuka dari `file://`. Struktur:

```
index.html, app-config.js
js/core/    ids.js sanitize.js store.js integrity.js
js/domain/  grading.js itemAnalysis.js          (logika murni, diuji di Node)
js/ai/      schema.js anonymizer.js prompts.js aiService.js tasks.js fileReader.js aiUi.js
js/app/     state.js ui.js app.js boot.js
js/modules/ satu berkas per menu
apps-script/ Code.gs PANDUAN.md
tests/      run_tests.py (browser) dan unit/*.test.js
```

Aturan:
1. Semua penyimpanan lewat `Store` (bukan `localStorage` langsung). Rahasia lewat `Store.secretGet/Set/Clear` (kunci `g_ai_secret`, tidak masuk backup).
2. ID baru: `genId('PREFIX')` (UUID). Setiap record punya `createdAt`, `updatedAt`, `ownerId` (null, disiapkan untuk login).
3. Data pengguna atau keluaran AI yang masuk HTML wajib `esc(...)`. HTML dari penyimpanan/backup lewat `sanitizeHtml`.
4. Hapus data induk lewat `Integrity.cascade*`; `Integrity.audit()` harus kosong.
5. Nilai hanya dihitung di `Grading.compute` (bobot dan aturan dari Pengaturan; nilai kosong tidak pernah diganti 80).
6. Semua panggilan Gemini hanya lewat `AIService.generate`. Data siswa/wali wajib lewat `Anonymizer` (kode `[S01]`, `[W01]`) dan opsi `pii`; permintaan yang masih memuat nama/NIS/telepon ditolak otomatis.
7. Pola setiap fitur AI: `AITasks.<fitur>.build` (prompt+skema) -> `AIService.generate` (validasi skema + `validate` lokal + satu perbaikan otomatis) -> normalisasi -> **pratinjau draf** (`AIUI.review` atau modal khusus) -> guru menyimpan. Tidak ada hasil AI tersimpan tanpa persetujuan guru. Tombol dibungkus `AIUI.run` (klik lagi = batal) dan didahului `AIUI.ensureReady()`.
8. Keluaran AI selalu divalidasi lokal (kunci soal, total bobot rubrik 100, total menit 80, kode siswa lengkap, tanpa tautan karangan).
9. Skema yang dikirim ke Gemini dibersihkan dari kata kunci tak didukung (`minLength` dsb.) tetapi tetap dipakai pada validasi lokal.

## 4. Fakta API Gemini yang sudah diverifikasi

- Endpoint `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key` (bukan di URL).
- Keluaran terstruktur terkini: `generationConfig.responseFormat = { text: { mimeType: 'APPLICATION_JSON', schema } }`. Aplikasi otomatis jatuh ke `responseMimeType + responseJsonSchema`, lalu ke "hanya prompt" bila 400 soal skema; gaya yang berhasil diingat.
- Kode galat: 400 (API_KEY_INVALID=AUTH, FAILED_PRECONDITION=wilayah/tier), 402 kredit, 403, 404 model, 429 kuota (hormati retryDelay), 500/503/504 coba ulang 2x lalu pindah ke model cadangan bila diatur.
- Model terverifikasi (daftar resmi Google): `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash`, `gemini-2.5-flash`. Dropdown aplikasi juga bisa memuat daftar nyata (`op: models`).
- Limit dihitung **per proyek**, bukan per key. Indonesia termasuk wilayah yang didukung.
- Apps Script: kirim `Content-Type: text/plain` (hindari preflight CORS); `UrlFetchApp` tidak bisa streaming dan tidak punya batas waktu yang bisa diatur, sehingga streaming modul tidak dipakai dan eksekusi bisa menggantung bila Gemini lambat. Diagnosis: Uji Koneksi dua tahap (proxy lalu Gemini), tab Executions, dan fungsi `testGemini`/`setupCheck` di `Code.gs`.

## 5. Status tahap

| Tahap | Isi | Status |
|---|---|---|
| 0 | Pecah jadi modul, `Store`, UUID, sanitasi XSS, hapus berantai, migrasi data lama dengan snapshot, ownerId | Selesai |
| 1 | Nilai akhir sesuai bobot Pengaturan, nilai kosong jujur, form Input Nilai (file asli tidak punya), UTS/UAS benar-benar terhitung (di asli selalu 80), analisis butir nyata (kesukaran, daya pembeda, pengecoh, KR-20), remedial menyimpan tindak lanjut, modul ajar bisa disimpan, backup memuat paket asesmen | Selesai |
| 2 | `AIService`, proxy Apps Script, anonimisasi, pembaca DOCX/PDF/TXT, Pengaturan AI, uji koneksi dua tahap, model cadangan, privasi | Selesai |
| 3 | Analisis CP, Modul Ajar, Generate Soal, Kisi-kisi (soal kini punya kunci, pembahasan, TP, indikator) | Selesai |
| 4 | Proyek P5, Modul P5, Tugas/LKPD (rubrik total 100%), tafsiran analisis ulangan, rekomendasi remedial/pengayaan | Selesai |
| Tambahan | Konfigurasi bersama `app-config.js`, dropdown model + muat daftar dari Gemini, gaya ringkas terbatas, token per tugas | Selesai |
| 5 | Lihat bagian 6 | **Berikutnya** |
| 6 | Penguatan (bagian 7) | Belum |
| 7 | Login dan multi-guru (bagian 8) | Belum |

Pengujian terakhir: **108 uji unit** dan **174 uji browser** lulus. Jalankan:
```
node --test tests/unit/*.test.js
python3 tests/run_tests.py [path/ke/file_asli.html]
```
Uji browser butuh `pip install playwright` + Chromium, memakai server HTTP lokal (jangan `file://`: localStorage Chromium di `file://` tidak konsisten antar muat ulang) dan menggantikan Gemini serta Apps Script dengan tiruan. **Belum ada uji dengan Gemini asli di otomatisasi**; pembuktian nyata adalah tombol Uji Koneksi dan pemakaian oleh guru.

## 6. Tahap 5: narasi rapor, laporan wali, surat (berikutnya)

Yang masih simulasi: `generateAllNarration` (rapor.js), `generateProgressAI` (communication.js), `generateDocAI` (documents.js).
- **AI-9 Narasi rapor:** per batch 10 siswa, hanya kode anonim + nilai akhir + predikat + TP tuntas/belum + kehadiran; nama dipulihkan lokal. Teks bisa diedit per siswa dan hanya tersimpan (`allRaporDescriptions`) setelah disetujui (FR-61). Siswa nilai belum lengkap tidak diberi narasi capaian. Jangan menyebut "tuntas" bila belum.
- **AI-10 Laporan perkembangan wali:** nilai, tren, kehadiran per siswa (kode anonim), nada hangat dan konstruktif, tanpa diagnosis psikologis/medis.
- **AI-11 Isi surat:** AI hanya mengisi isi; nomor surat, kop, tanda tangan dari aplikasi. Alasan diambil dari data absensi/nilai.
- Setelah semua tersambung: set `AIUI.HIDE_WHEN_OFF = true` (tombol bertanda `data-ai` disembunyikan saat AI mati) dan hapus sisa kode simulasi.
- Perbaiki di rapor: tabel per-TP saat ini menampilkan nilai akhir yang sama untuk tiap TP (palsu); ganti dengan data nyata per asesmen berkait TP atau hapus kolom.
- Tambah uji pola yang sama (build/validate unit; browser: draf -> setuju -> simpan, nol permintaan bila AI belum siap, tanpa nama/NIS di permintaan, XSS pada keluaran AI).

## 7. Tahap 6: penguatan

- Migrasi `Store` ke IndexedDB (batas localStorage ±5 MB; sekarang hanya ada peringatan 80%). Antarmuka `Store` sudah memisahkan penyimpanan fisik.
- Backup v2: berversi skema, mode gabung/timpa saat restore, pengingat 7 hari. Backup lama tetap harus bisa dipulihkan.
- Salin Tailwind dan Chart.js ke `vendor/` (loader sudah ada; berkas belum disalin), idealnya build Tailwind CLI.
- Antarmuka penyusunan paket asesmen (`allAssessmentPkgs`, FR-31) dan cetak paket beserta kunci.
- Format cetak laporan/kop konsisten; uji lintas browser; ekspor `.docx`/PDF sungguhan bila dibutuhkan.
- Penanda "Dibuat dengan AI" yang dapat dimatikan pada hasil cetak.

## 8. Tahap 7: login dan multi-guru (terakhir)

- Login Google: aplikasi mengirim ID token ke proxy Apps Script; proxy memverifikasinya dan memeriksa daftar email/domain yang diizinkan (Script Properties). Menggantikan token bersama di `app-config.js`, sehingga tidak ada rahasia di browser guru.
- Isi `ownerId` pada setiap record dan pisahkan data per guru. Pertimbangkan penyimpanan di Google Sheets lewat Apps Script dengan `Store` sebagai satu-satunya titik ganti (sinkronisasi multi-perangkat).
- Batas pemakaian AI per guru di proxy.
- Jika hanya satu guru: PIN/kata sandi lokal sudah cukup.

## 9. Keterbatasan dan catatan yang diketahui

- Konfigurasi bersama menaruh token proxy di berkas yang terkirim ke browser: terlihat bagi siapa pun yang bisa membuka situs. Dibatasi `DAILY_LIMIT` dan dapat diganti; solusi tuntas adalah login Google.
- Setelah koneksi macet, eksekusi Apps Script lama menggantung sampai berhenti sendiri dan memakan kuota harian proxy.
- Bagian "kebutuhan belajar" pada modul ajar adalah perkiraan umum dari AI (diberi penanda); guru wajib menyesuaikan.
- PDF referensi dikirim apa adanya (tidak bisa disaring); privasi memperingatkan guru agar tidak mengunggah dokumen berisi data siswa. Dokumen teks/DOCX disaring (nama/NIS diganti kode).
- Hapus kelas kini menghapus seluruh isinya (dulu meninggalkan data yatim). Konfirmasi menampilkan jumlahnya.
- Dasbor: grafik "Pengayaan" masih tetap 0 (belum dihitung dari tindak lanjut).
- File `.doc` lama ditolak (hanya PDF, DOCX, TXT).

## 10. Cara melanjutkan di percakapan baru

1. Unggah `sistem-administrasi-guru-tahap4b.zip` dan `Point.md`. Jika file asli prototipe tersedia, unggah juga untuk uji paritas.
2. Pesan pembuka yang disarankan:

> Lanjutkan proyek "Sistem Administrasi Guru Terpadu". Baca Point.md dan README.md di zip yang saya unggah. Ekstrak, jalankan `node --test tests/unit/*.test.js` dan `python3 tests/run_tests.py`, pastikan hijau, lalu kerjakan **Tahap 5** sesuai bagian 6. Ikuti konvensi bagian 3, tulis uji untuk setiap fitur baru, dan jangan mengubah perilaku yang sudah diuji tanpa alasan. Setelah selesai, kemas zip baru dan perbarui Point.md.

3. Hasil uji Gemini asli (pesan Uji Koneksi, galat yang muncul) sebaiknya disertakan bila ada masalah koneksi.
