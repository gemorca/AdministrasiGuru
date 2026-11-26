# Point.md: Rencana dan Status Proyek "Sistem Administrasi Guru Terpadu"

Dokumen ini ringkasan lengkap untuk melanjutkan proyek di percakapan baru. Unggah bersama zip aplikasi terbaru (`sistem-administrasi-guru-tahap5.zip`) lalu minta asisten membaca `Point.md` dan `README.md` lebih dulu.

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
1. Semua penyimpanan lewat `Store` (bukan `localStorage` langsung; fisik = IndexedDB, cadangan localStorage; `boot.js` memanggil `await Store.init()` lebih dulu). Rahasia lewat `Store.secretGet/Set/Clear` (kunci `g_ai_secret`, tidak masuk backup).
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
| 5 | Narasi rapor, laporan wali, isi surat memakai Gemini; tabel rapor per TP nyata; `HIDE_WHEN_OFF = true`; simulasi dihapus (bagian 6) | Selesai |
| 6 | Penguatan (bagian 7): backup v2, IndexedDB, paket asesmen + cetak kunci, penanda AI, skrip vendor selesai; sisa: salin vendor, uji lintas browser, ekspor docx/PDF, kop cetak seragam | **Sebagian** |
| 7 | Login dan multi-guru dengan Supabase (bagian 8) | **Sebagian**: skema SQL+RLS, mesin sinkronisasi, fungsi Vercel Gemini, mode cloud AIService selesai dan teruji di Node; belum: adaptor supabase-js, layar login, pembatasan UI admin/guru, alur koneksi pertama, uji browser, PANDUAN.md |

Pengujian terakhir: **159 uji unit** dan **250 uji browser** (tanpa file asli) lulus. Jalankan:
```
node --test tests/unit/*.test.js
python3 tests/run_tests.py [path/ke/file_asli.html]
```
Uji browser butuh `pip install playwright` + Chromium, memakai server HTTP lokal (jangan `file://`: localStorage Chromium di `file://` tidak konsisten antar muat ulang) dan menggantikan Gemini serta Apps Script dengan tiruan. **Belum ada uji dengan Gemini asli di otomatisasi**; pembuktian nyata adalah tombol Uji Koneksi dan pemakaian oleh guru.

## 6. Tahap 5: narasi rapor, laporan wali, surat (SELESAI)

Dulu simulasi (kini tersambung ke Gemini): `generateAllNarration` (rapor.js), `generateProgressAI` (communication.js), `generateDocAI` (documents.js).
- **AI-9 Narasi rapor:** per batch 10 siswa, hanya kode anonim + nilai akhir + predikat + TP tuntas/belum + kehadiran; nama dipulihkan lokal. Teks bisa diedit per siswa dan hanya tersimpan (`allRaporDescriptions`) setelah disetujui (FR-61). Siswa nilai belum lengkap tidak diberi narasi capaian. Jangan menyebut "tuntas" bila belum.
- **AI-10 Laporan perkembangan wali:** nilai, tren, kehadiran per siswa (kode anonim), nada hangat dan konstruktif, tanpa diagnosis psikologis/medis.
- **AI-11 Isi surat:** AI hanya mengisi isi; nomor surat, kop, tanda tangan dari aplikasi. Alasan diambil dari data absensi/nilai.
- Setelah semua tersambung: set `AIUI.HIDE_WHEN_OFF = true` (tombol bertanda `data-ai` disembunyikan saat AI mati) dan hapus sisa kode simulasi.
- Perbaiki di rapor: tabel per-TP saat ini menampilkan nilai akhir yang sama untuk tiap TP (palsu); ganti dengan data nyata per asesmen berkait TP atau hapus kolom.
- Tambah uji pola yang sama (build/validate unit; browser: draf -> setuju -> simpan, nol permintaan bila AI belum siap, tanpa nama/NIS di permintaan, XSS pada keluaran AI).

## 7. Tahap 6: penguatan (sebagian selesai)

Selesai:
- **Backup v2** (`js/domain/backup.js`, `js/modules/backup.js`): `schemaVersion` 2 + `counts` per tabel; `parse` menolak JSON rusak, aplikasi lain, skema lebih baru, tabel rusak/tidak lengkap; backup lama (tanpa schemaVersion) tetap bisa dipulihkan; restore mode **Gabung** (bawaan, per record, ganti hanya bila `updatedAt` lebih baru, tidak menghapus) atau **Timpa** (salinan data saat ini diunduh otomatis lebih dulu); pengingat 7 hari (`settings.lastBackupAt`, banner di Dashboard dan Backup).
- **IndexedDB** (`js/core/store.js`): memori + penulisan latar ke IndexedDB, antarmuka `read/write` tetap sinkron; impor sekali dari localStorage lalu diverifikasi baru dihapus; gagal buka -> otomatis localStorage; `Store.flush()`; rahasia AI tetap di localStorage. `APP_CONFIG.storage = 'local'` memaksa localStorage (dipakai uji lama; uji IndexedDB memakai `'indexeddb'`). Batas kuota kini kuota browser, bukan 5 MB.
- **Paket asesmen** (`js/domain/package.js`, `js/modules/paket.js`, bagian Bank Soal): buat/ubah/hapus, naskah tanpa kunci, kunci + skor (bobot sama, total 100) + peringatan butir tanpa kunci, cetak terpisah; paket lama (tanpa jenis/kelas/durasi) tetap tampil; hapus butir mencabutnya dari paket (`Integrity.cascadeQuestion`), hapus kelas ikut menghapus paket, audit mengecek paket.
- **Catatan "dibuat dengan AI"** pada cetakan paket bila ada butir AI; dapat dimatikan (`settings.printAiMark`).
- `tools/fetch_vendor.sh` (unduh Tailwind dan Chart.js ke `vendor/`), uji lintas browser lewat `BROWSER=firefox python3 tests/run_tests.py`.

Belum (perlu internet/keputusan pengguna):
- Jalankan `sh tools/fetch_vendor.sh` di komputer berinternet (sandbox tanpa jaringan; `vendor/` belum ada). Idealnya build Tailwind CLI.
- Uji Firefox/WebKit belum dijalankan (hanya Chromium terpasang di sandbox).
- Ekspor `.docx`/PDF sungguhan (tunggu keputusan; saat ini `.doc` via HTML dan cetak browser).
- Kop dan format cetak laporan/rapor/surat belum diseragamkan; catatan AI belum ada di cetak rapor/surat.
- Beberapa tab terbuka memakai salinan memori masing-masing (tulis terakhir menang), sama seperti sebelumnya.

## 8. Tahap 7: login dan multi-guru (keputusan dan status)

Keputusan pengguna: **beberapa guru dalam satu sekolah, deploy Vercel, database Supabase.** Guru mapel berbeda berbagi kelas yang sama, jadi siswa/kelas/periode = data sekolah (dibagi), selain itu milik guru. Spreadsheet tidak lagi menjadi penyimpanan; arah yang diminta: Supabase = database (dan file seperti foto), Spreadsheet = pencatatan/rekap (lihat bagian 8b).

Sudah ada (kode di repo, uji Node hijau):
- `supabase/schema.sql`: tabel `schools, members, invites, records (generik: tbl,id,owner_id,data jsonb,deleted,client_at,seq), ai_usage`; RLS (data sekolah owner_id NULL: semua anggota baca, hanya admin tulis; data guru: hanya pemiliknya); RPC `claim_invite, push_records (versi client_at terbaru menang, pelanggaran RLS dikembalikan sebagai rejected), pull_records (kursor seq), get_record, ai_bump`. Tombstone untuk hapus. Belum diuji di Postgres sungguhan.
- `js/domain/sync.js` (logika murni) dan `js/core/sync.js` (mesin: antrean tersimpan, retry bertahap, tarik berhalaman, data pending menang lokal, tanpa gema). `Store` punya `onChange`, `write(key,v,{silent,keepStamps})`, `metaGet/metaSet`.
- `api/gemini.js` + `vercel.json`: fungsi Vercel pengganti proxy Apps Script (verifikasi JWT Supabase, keanggotaan, batas harian per guru lewat `ai_bump`, key Gemini hanya di env). `AIService` punya mode `cloud` (`deps.cloud()`), pesan CLOUD_AUTH/LIMIT/CONFIG.
- Env Vercel: `GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, AI_DAILY_LIMIT`.

Belum:
- `js/core/remote-supabase.js` (adaptor supabase-js: session, signInWithOAuth Google, claim_invite, push/pull/get lewat RPC; pull memakai tumpang tindih kursor ±50) dan `js/app/auth.js` (gerbang login, ditolak bila belum diundang, `Cloud` state, status sinkron di header, keluar).
- `boot.js`: bila `APP_CONFIG.supabaseUrl` ada -> login -> `claim_invite` -> tarik awal SEBELUM `initApp` -> `Sync.start`. Tanpa `supabaseUrl` aplikasi tetap mode lokal satu pengguna (semua uji lama bergantung ini).
- Mode cloud: tanpa data contoh siswa; tombol/fungsi siswa, kelas, periode hanya admin (`data-admin-only`, guard di `saveStudent/deleteStudent/importStudentsCSV/saveClass/deleteClass`); layar admin untuk undangan guru dan peran; sembunyikan kolom koneksi AI (panggil `AIService.use({cloud})`).
- Koneksi pertama: bila ada data lokal lama, konfirmasi unggah (`enqueueAll`: admin semua, guru hanya data milik guru). Ganti akun di perangkat yang sama: hapus data lokal (`Store.wipe`) setelah peringatan; keluar menunggu antrean kosong.
- Uji browser dengan adaptor Supabase tiruan (`window.RemoteAdapter`), `supabase/PANDUAN.md` (setup, Google OAuth, sekolah dan admin pertama, daftar uji RLS dua akun).
- Keterbatasan: tanpa realtime (polling 60 dtk + saat fokus/online); ID siswa data lokal lama guru tidak otomatis cocok dengan siswa sekolah (migrasi awal dilakukan admin).

## 8b. Rencana hibrida: Supabase + Spreadsheet (belum dikerjakan)

- Supabase: sumber kebenaran semua data, login, RLS, dan **Storage** untuk file (foto guru/siswa, lampiran). Bucket privat + policy per sekolah/pemilik, tampil lewat signed URL.
- Spreadsheet: **pencatatan satu arah** (Supabase -> Sheet): rekap nilai, daftar hadir, jurnal, dan data yang ingin dilihat guru/kepala sekolah dalam bentuk lembar. Tidak dibaca balik, supaya tidak ada dua sumber kebenaran. Ditulis dari server (fungsi Vercel dengan service account Google atau Apps Script), bukan dari browser; ekspor per tombol/terjadwal dalam batch (batas kuota Sheets API).

## 9. Keterbatasan dan catatan yang diketahui

- Konfigurasi bersama menaruh token proxy di berkas yang terkirim ke browser: terlihat bagi siapa pun yang bisa membuka situs. Dibatasi `DAILY_LIMIT` dan dapat diganti; solusi tuntas adalah login Google.
- Setelah koneksi macet, eksekusi Apps Script lama menggantung sampai berhenti sendiri dan memakan kuota harian proxy.
- Bagian "kebutuhan belajar" pada modul ajar adalah perkiraan umum dari AI (diberi penanda); guru wajib menyesuaikan.
- PDF referensi dikirim apa adanya (tidak bisa disaring); privasi memperingatkan guru agar tidak mengunggah dokumen berisi data siswa. Dokumen teks/DOCX disaring (nama/NIS diganti kode).
- Hapus kelas kini menghapus seluruh isinya (dulu meninggalkan data yatim). Konfirmasi menampilkan jumlahnya.
- Tahap 5: narasi rapor hanya untuk siswa nilai akhir lengkap (status Sementara dilewati). Catatan laporan wali dan narasi rapor berbagi satu record (`allRaporDescriptions`); menyimpan catatan wali menimpa narasi rapor setelah konfirmasi. Tabel rapor per TP memakai rata-rata asesmen berkait TP; TP tanpa asesmen tampil "-".
- `app-config.js` di repo berisi URL proxy dan token nyata (terkirim ke browser). Uji otomatis mengabaikannya. Ganti token bila repo dibagikan.
- Dasbor: grafik "Pengayaan" masih tetap 0 (belum dihitung dari tindak lanjut).
- File `.doc` lama ditolak (hanya PDF, DOCX, TXT).

## 10. Cara melanjutkan di percakapan baru

1. Unggah `sistem-administrasi-guru-tahap5.zip` dan `Point.md`. Jika file asli prototipe tersedia, unggah juga untuk uji paritas.
2. Pesan pembuka yang disarankan:

> Lanjutkan proyek "Sistem Administrasi Guru Terpadu". Baca Point.md dan README.md di zip yang saya unggah. Ekstrak, jalankan `node --test tests/unit/*.test.js` dan `python3 tests/run_tests.py`, pastikan hijau, lalu kerjakan **Tahap 6** sesuai bagian 7. Ikuti konvensi bagian 3, tulis uji untuk setiap fitur baru, dan jangan mengubah perilaku yang sudah diuji tanpa alasan. Setelah selesai, kemas zip baru dan perbarui Point.md.

3. Hasil uji Gemini asli (pesan Uji Koneksi, galat yang muncul) sebaiknya disertakan bila ada masalah koneksi.
