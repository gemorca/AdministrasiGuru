# Panduan Pasang: Login, Register, dan Data di Google Spreadsheet

Semua data (akun guru, kelas, siswa, nilai, perangkat ajar) tersimpan di **satu Google Spreadsheet** milik Anda.
Tidak ada Supabase. Satu Web App Apps Script melayani login/register, sinkronisasi, dan proxy AI Gemini.

## 1. Buat Spreadsheet dan skrip
1. Buka <https://sheets.new>, beri nama mis. **Database Administrasi Guru**.
2. Menu **Extensions > Apps Script**.
3. Buat dua berkas dan isi dengan isi berkas di folder ini:
   - `Code.gs` ← isi [Code.gs](Code.gs)
   - `Sheets.gs` ← isi [Sheets.gs](Sheets.gs) (tombol **+** > Script)
4. Pilih fungsi **`setupSheets`** lalu **Run**. Setujui izin (Spreadsheet dan koneksi eksternal). Sheet `Pengguna`, `Sesi`, `Data`, `Undangan`, `Pengaturan` terbentuk otomatis.

## 2. Script Properties (Project Settings > Script properties)
| Nama | Wajib | Keterangan |
|---|---|---|
| `GEMINI_API_KEY` | untuk fitur AI | API key dari Google AI Studio |
| `REG_CODE` | disarankan | Kode pendaftaran sekolah. Bila diisi, guru baru wajib memasukkannya saat Daftar (dibagikan lewat grup guru) |
| `SESSION_DAYS` | tidak | Lama sesi login, bawaan 30 hari |
| `DAILY_LIMIT` | tidak | Batas permintaan AI per hari (seluruh sekolah), bawaan 300 |
| `SPREADSHEET_ID` | hanya bila skrip tidak dibuat dari dalam Spreadsheet | ID Spreadsheet |

`APP_TOKEN` **tidak diperlukan lagi**: AI memakai sesi login guru.

## 3. Deploy
**Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Salin URL berakhiran `/exec`.
Setiap mengubah kode, pilih **Deploy > Manage deployments > Edit > New version** agar URL yang sama memakai kode terbaru.

## 4. Hubungkan aplikasi
Buka [`app-config.js`](../app-config.js) dan isi `sheetsUrl` dengan URL `/exec` tadi.

## 5. Pendaftaran pertama
Buka `index.html` > **Daftar di sini**. Pendaftar **pertama** otomatis menjadi **Admin Sekolah** dan mengisi nama sekolah.
Guru lain: Daftar (dengan `REG_CODE` bila dipakai) dan otomatis menjadi **Guru Mapel**.

Admin dapat di **Pengaturan > Anggota Sekolah**: menetapkan peran lebih dulu untuk sebuah email (mis. wakil jadi Admin), menjadikan guru Admin/Guru, **Reset Sandi** (menghasilkan kata sandi sementara), dan mengeluarkan anggota. Setiap pengguna dapat mengubah kata sandinya sendiri di Pengaturan.

## Keamanan
- Kata sandi disimpan sebagai hash SHA-256 bergaram (1000 putaran); token sesi hanya disimpan sebagai hash.
- 6 kali salah sandi mengunci email itu 15 menit.
- Guru hanya dapat membaca data miliknya dan data sekolah; hanya Admin yang boleh mengubah periode/kelas/siswa. Aturan ini dipaksa di server, bukan hanya di tampilan.
- **Jangan bagikan akses edit Spreadsheet** kepada guru: siapa pun yang bisa membuka sheet `Data` dapat membaca semuanya. Bagikan hanya URL aplikasi.
- Kata sandi yang lupa: Admin mereset. Bila Admin lupa, edit sheet `Pengguna` (hapus baris akun itu) lalu daftar ulang, atau buat Admin lain lebih dulu.

## Batas yang perlu diketahui
- Apps Script punya kuota harian (akun gratis ± 20.000 panggilan/hari, 6 menit/eksekusi) sehingga cocok untuk satu sekolah, bukan ribuan pengguna serentak.
- Satu catatan maksimal ±360.000 karakter. Sheet maksimal 10 juta sel; pantau ukuran sheet `Data`.
- Sinkronisasi memakai polling tiap 60 detik dan saat tab difokuskan; perubahan guru lain muncul dalam hitungan detik–menit.

## Uji Gemini (opsional)
Jalankan `setupCheck` dan `testGemini` di editor untuk memastikan API key valid.
