# Panduan Memasang Proxy Gemini (Google Apps Script)

Tujuan: API key Gemini tersimpan di Google, bukan di browser guru. Aplikasi hanya memegang token yang bisa diganti kapan saja.

## 1. Siapkan API key
1. Buka Google AI Studio (aistudio.google.com/apikey) dan buat API key khusus aplikasi ini.
2. Langganan Google AI Plus/Pro tidak otomatis mencakup API key. Pemakaian API memakai kuota gratis atau tagihan terpisah. Cek halaman harga dan batas di Google AI Studio.

## 2. Buat proyek Apps Script
1. Buka script.google.com, pilih Proyek baru.
2. Hapus isi `Code.gs` bawaan, tempel seluruh isi berkas `apps-script/Code.gs`.
3. Buka Project Settings (ikon roda gigi) lalu Script properties, tambahkan:
   - `GEMINI_API_KEY` = API key dari langkah 1
   - `APP_TOKEN` = teks acak panjang, minimal 32 karakter (huruf dan angka). Simpan, nanti diisi juga di aplikasi.
   - `DAILY_LIMIT` = (opsional) batas permintaan per hari, bawaan 300
4. Di editor, pilih fungsi `setupCheck` lalu Run. Setujui izin yang diminta. Di Execution log harus tertulis key terisi dan "HTTP 200 (key valid)".

## 3. Deploy
1. Deploy > New deployment > jenis Web app.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Salin URL Web App (berakhiran `/exec`).
4. Setiap kali kode diubah, buat deployment versi baru agar URL memakai kode terbaru.

"Anyone" berarti siapa pun yang tahu URL dapat memanggilnya. Yang melindungi adalah `APP_TOKEN` dan `DAILY_LIMIT`. Jangan bagikan token di tempat umum. Bila token bocor, ganti nilainya di Script properties lalu isi ulang di aplikasi.

## 4. Hubungkan aplikasi
1. Di aplikasi: Pengaturan > AI (Google Gemini).
2. Centang Aktifkan, pilih "Lewat proxy Google Apps Script", tempel URL Web App, isi token, isi nama model, centang persetujuan privasi.
3. Simpan Pengaturan AI, lalu tekan Uji Koneksi. Pesan hijau berarti siap.

## Pemecahan masalah
| Pesan | Penyebab dan solusi |
|---|---|
| Token aplikasi ditolak (PROXY_AUTH) | Token di aplikasi berbeda dengan `APP_TOKEN`. Samakan. |
| Proxy tidak menjawab dalam 20 detik (PROXY_TIMEOUT) | Tahap 1 gagal. URL salah, deploy belum "Anyone", atau Apps Script tertahan. Buka URL Web App di tab baru: harus tampil `{"ok":true,"service":"gemini-proxy"}`. Cek tab Executions apakah permintaan masuk. |
| Proxy masih memakai kode lama (PROXY_OLD) | Tempel ulang `Code.gs` terbaru lalu Deploy > Manage deployments > Edit > Version: New version. |
| Uji Koneksi tahap 2 TIMEOUT, dan di Executions `doPost` berjalan berpuluh-puluh detik | Gemini tidak membalas permintaan dari proxy. Bukan salah aplikasi. Jalankan `testGemini` di editor (hasilnya di Execution log), ganti Script property `TEST_MODEL` ke model lain untuk membandingkan. Bila model lain cepat, pakai model itu di Pengaturan > AI. Bila semua model menggantung, periksa key dan proyeknya di Google AI Studio (batas, penagihan, pembatasan API). Eksekusi lama yang menggantung berhenti sendiri, jangan menekan Uji Koneksi berulang kali. |
| Layanan Gemini sedang bermasalah (SERVER, kode 503) | Model sedang padat/kelebihan beban, biasanya sementara. Aplikasi sudah mengulang 2 kali otomatis. Tunggu sekitar satu menit lalu coba lagi, atau isi "Model cadangan" (mis. `gemini-3.6-flash`) di Pengaturan > AI supaya aplikasi pindah sendiri. Pesan asli dari Google ditampilkan di dalam pesan galat. |
| Gemini tidak menjawab dalam 60 detik (TIMEOUT, tahap 2) | Proxy sehat tetapi Gemini lambat/tertahan. Coba model lain (mis. `gemini-3.6-flash`), jalankan `setupCheck`, periksa kuota dan penagihan, lihat Executions. |
| Proxy tidak merespons dengan benar (PROXY_CONFIG) | Deploy belum "Anyone", atau URL bukan berakhiran `/exec`, atau belum deploy versi baru setelah mengubah kode. |
| Batas harian proxy tercapai (PROXY_LIMIT) | Naikkan `DAILY_LIMIT` atau tunggu besok. |
| API key atau token tidak valid (AUTH) | `GEMINI_API_KEY` salah, dicabut, atau proyek dibatasi. Jalankan `setupCheck`. |
| Batas penggunaan Gemini tercapai (QUOTA) | Kuota per menit/hari habis. Tunggu atau aktifkan penagihan. |
| Model tidak ditemukan | Nama model di Pengaturan AI salah atau sudah tidak tersedia. Ganti sesuai daftar di AI Studio. |

## Privasi
Kode proxy tidak menulis isi permintaan atau jawaban ke log maupun penyimpanan. Satu-satunya yang disimpan adalah penghitung permintaan harian (`USAGE`). Apps Script sendiri mencatat eksekusi di dasbor Google (waktu dan status, bukan isi).
