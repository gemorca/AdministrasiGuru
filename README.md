# Sistem Administrasi Guru, Tahap 0-4 (Fondasi, Perbaikan Inti, Mesin AI, Perangkat Ajar dan Pembelajaran AI)

Buka `index.html` langsung di browser (tidak perlu server). Perilaku semua menu sama dengan file asli.

## Struktur
- `js/core/`: `ids.js` (genId/UUID), `sanitize.js` (esc), `store.js` (penyimpanan, migrasi, metadata), `integrity.js` (hapus berantai, audit).
- `js/domain/`: logika murni tanpa DOM, diuji di Node. `grading.js` (nilai akhir, predikat, validasi), `itemAnalysis.js` (kesukaran, daya pembeda, pengecoh, KR-20).
- `js/ai/`: `aiService.js` (satu-satunya pintu ke Gemini), `schema.js`, `anonymizer.js`, `prompts.js`, `fileReader.js` (PDF/DOCX/TXT), `aiUi.js` (Pengaturan AI), `tasks.js` (prompt, skema, validasi, dan normalisasi untuk Analisis CP, Soal/Kisi-kisi, Modul Ajar).
- `apps-script/`: `Code.gs` (proxy Gemini) dan `PANDUAN.md` (langkah pasang).
- `js/app/`: `state.js`, `ui.js`, `app.js` (navigasi, init), `boot.js` (titik masuk).
- `js/modules/`: satu berkas per menu.
- `tests/unit/`: 101 uji unit. Jalankan `node --test tests/unit/*.test.js`.
- `tests/run_tests.py`: 155 uji browser (termasuk menjalankan uji unit). Jalankan `python3 tests/run_tests.py [file_asli.html]`. Butuh `pip install playwright` dan Chromium. Argumen opsional = file asli untuk uji paritas.
- `tools/build_from_original.py`: skrip yang menghasilkan proyek ini dari file asli (untuk jejak audit).

## Aturan pengembangan
1. Semua akses penyimpanan lewat `Store`. Dilarang memakai `localStorage` langsung.
2. ID baru wajib `genId('PREFIX')`.
3. Data pengguna atau hasil AI yang masuk ke HTML wajib `esc(...)`. Untuk `innerText`/`value` tidak perlu.
4. Hapus data induk lewat `Integrity.cascade*` agar tidak ada data yatim.
5. `ownerId` di setiap record disiapkan untuk fitur login (Tahap 7). Saat ini selalu `null`.

## Catatan
- Skrip klasik (bukan ES module) dipilih agar `onclick="..."` tetap berfungsi dan file bisa dibuka dari `file://`.
- Backup dari versi lama tetap bisa dipulihkan. Backup baru menambah `assessmentPkgs`.

## Aturan penilaian (Tahap 1)
- Semua aturan dibaca dari Pengaturan > Penilaian & Ketuntasan: KKTP, 4 bobot (total wajib 100), kebijakan nilai kosong, ambang kehadiran, penalti, syarat tuntas, batas predikat, mode nilai remedial.
- Nilai kosong tidak pernah diganti angka bawaan. Bawaan: nilai akhir "Belum Lengkap".
- Nilai hanya dibuat lewat form Input Nilai. Tidak ada lagi nilai contoh acak.
- Perhitungan hanya di `js/domain/grading.js`. Jangan menghitung nilai di tempat lain.

## Mesin AI (Tahap 2)
- Semua panggilan Gemini lewat `AIService.generate({ task, prompt, schema, inline, pii })`. Jangan memanggil `fetch` ke Gemini di tempat lain.
- Data siswa/wali WAJIB dianonimkan dengan `Anonymizer` dan dikirim lewat opsi `pii`. Permintaan yang masih memuat nama/NIS/telepon dikenal ditolak otomatis.
- Rahasia (API key atau token proxy) hanya di `Store.secretGet/Set/Clear` (kunci `g_ai_secret`). Tidak masuk backup, tidak ditampilkan, tidak masuk log.
- Hasil AI selalu draf: validasi skema, tampilkan, guru menyimpan.
- Tersambung ke Gemini: Analisis CP, Modul Ajar, Generate Soal, Kisi-kisi (Tahap 3); Proyek P5, Modul P5, Tugas/LKPD, tafsiran analisis ulangan, rekomendasi remedial/pengayaan (Tahap 4). MASIH simulasi sampai Tahap 5: narasi rapor, laporan wali, isi surat. Tombolnya sudah bertanda `data-ai`; ubah `AIUI.HIDE_WHEN_OFF` menjadi `true` setelah semua fitur tersambung (Tahap 5).
- Tidak ada panggilan nyata ke Gemini di uji otomatis (memakai tiruan sesuai dokumentasi). Pembuktian dengan key asli = tombol Uji Koneksi.

## Perangkat ajar AI (Tahap 3)
- Pola semua fitur: validasi lokal di `AITasks` -> pratinjau draf -> guru menyimpan. Soal dibuang bila cacat (kunci tidak valid, opsi kembar, kembar dengan Bank Soal) dan kekurangan diminta ulang sekali; permintaan > 8 butir dipecah per 8.
- Soal kini menyimpan `key`, `explanation`, `tpId`, `indicator`, `material`, `source`. Kartu soal dan kisi-kisi memakai data itu.
- Streaming tidak dipakai: proxy Apps Script (UrlFetchApp) mengembalikan jawaban utuh. Modul ajar besar memakai batas waktu 150 detik.
- Bagian "Kebutuhan Belajar" pada modul adalah perkiraan umum dari AI, diberi penanda agar guru menyesuaikan.

## Pembelajaran AI (Tahap 4)
- Pola draf -> tinjau -> simpan memakai `AIUI.review({ title, info, items, onSave })` (pilih butir lewat centang). Proyek P5 dan rekomendasi tindak lanjut memakainya.
- Rekomendasi remedial/pengayaan: siswa dikirim sebagai kode `[S01]`, nama dipulihkan hanya di layar. Siswa yang nilai akhirnya belum lengkap tidak diikutkan. Hasil divalidasi (kode lengkap, jenis sesuai status). Disimpan sebagai tindak lanjut berstatus Direncanakan; duplikat sejenis dilewati.
- Tafsiran analisis ulangan hanya menerima statistik butir (tanpa nama atau jawaban per siswa). Angka tetap dari `ItemAnalysis`.
- Rubrik tugas wajib berbobot tepat 100 (divalidasi, dengan satu perbaikan otomatis).
