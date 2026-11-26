# Panduan Pemasangan Mode Multi-Guru (Supabase + Vercel + Google Login)

Dokumen ini memandu pemasangan **Sistem Administrasi Guru Terpadu** untuk satu sekolah dengan banyak guru mata pelajaran menggunakan **Supabase** (database PostgreSQL, Row Level Security, & Login Google) dan **Vercel** (hosting statis + fungsi serverless Gemini).

Dengan mode ini:
- **Tidak ada lagi rahasia/token AI di browser guru.** API key Gemini hanya tersimpan di server Vercel.
- **Data sekolah dibagi otomatis:** daftar periode, kelas/rombel, dan peserta didik dikelola terpusat oleh **Admin Sekolah** dan otomatis tampil di semua guru mata pelajaran.
- **Data guru terisolasi penuh (RLS):** perangkat ajar (CP/TP, modul ajar, bank soal, paket), jadwal, absensi, nilai, analisis ulangan, tindak lanjut, rapor, komunikasi wali, dan surat hanya bisa dibaca serta diubah oleh masing-masing guru pemiliknya.
- **Tetap tahan sinyal lemah:** aplikasi memakai IndexedDB lokal + antrean sinkronisasi otomatis saat kembali daring.

---

## 1. Buat Proyek Supabase & Jalankan Skema Database

1. Buka [supabase.com](https://supabase.com), masuk, lalu klik **New project**.
2. Pilih organisasi, beri nama proyek (mis. `admin-guru-smpn1`), buat kata sandi database yang kuat, dan pilih region terdekat (mis. **Southeast Asia (Singapore)**).
3. Setelah proyek aktif, buka menu **SQL Editor** di bilah kiri -> klik **New query**.
4. Salin seluruh isi berkas `supabase/schema.sql`, tempel ke SQL Editor, lalu tekan **Run**.
5. Pastikan hasilnya **Success**. Skrip ini membuat tabel `schools`, `members`, `invites`, `records`, `ai_usage`, seluruh aturan keamanan **Row Level Security (RLS)**, serta fungsi RPC sinkronisasi dan kuota AI.
6. Buka **Project Settings > API** (atau **API Keys**), lalu catat dua nilai berikut:
   - **Project URL** (`https://xxxx.supabase.co`) -> ini adalah `SUPABASE_URL`.
   - **Publishable key** (`sb_publishable_...`) atau tab Legacy **`anon` `public`** (`eyJ...`) -> ini adalah `SUPABASE_ANON_KEY`.
   *(Catatan: `publishable` / `anon` key memang dirancang aman untuk publik karena seluruh tabel dilindungi RLS. **JANGAN** pernah menyalin **Secret key** `sb_secret_...` atau `service_role` ke `app-config.js`!).*

---

## 2. Konfigurasi Login Google (Google OAuth)

### A. Di Google Cloud Console
1. Buka [console.cloud.google.com](https://console.cloud.google.com) dan buat proyek baru (atau pilih proyek sekolah).
2. Buka **APIs & Services > OAuth consent screen**:
   - Pilih **External** (jika guru memakai akun `@gmail.com` / `@belajar.id` campuran) atau **Internal** (jika semua guru memakai satu domain Google Workspace sekolah).
   - Isi nama aplikasi (mis. *Sistem Administrasi Guru SMPN 1*), email dukungan, lalu simpan.
   - Jika memilih *External*, ubah status publikasi ke **In production** (agar tidak dibatasi 100 pengguna uji dan token tidak kedaluwarsa 7 hari). Jangan khawatir: siapa pun di luar undangan sekolah tetap akan ditolak oleh tabel `invites`.
3. Buka **APIs & Services > Credentials > Create Credentials > OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: tambahkan domain Vercel Anda (mis. `https://admin-guru-smpn1.vercel.app`).
   - **Authorized redirect URIs**: masukkan Callback URL dari Supabase, yaitu:
     `https://<ID-PROYEK-SUPABASE>.supabase.co/auth/v1/callback`
   - Klik **Create**, lalu salin **Client ID** dan **Client Secret**.

### B. Di Dashboard Supabase
1. Buka **Authentication > Providers > Google**:
   - Aktifkan **Enable Sign in with Google**.
   - Tempel **Client ID** dan **Client Secret** dari langkah di atas, lalu klik **Save**.
2. Buka **Authentication > URL Configuration**:
   - **Site URL**: isi alamat situs Vercel Anda, mis. `https://admin-guru-smpn1.vercel.app`.
   - **Redirect URLs**: tambahkan:
     - `https://admin-guru-smpn1.vercel.app/**`
     - `http://localhost:*/**` dan `http://127.0.0.1:*/**` (bila ingin menguji lokal).
   - Klik **Save**.

---

## 3. Daftarkan Sekolah & Admin Pertama

Sebelum siapa pun bisa masuk, buat data sekolah beserta undangan untuk **Admin Pertama** melalui **Supabase > SQL Editor > New query** (ganti nama sekolah dan alamat email Google admin):

```sql
with new_school as (
    insert into public.schools (name)
    values ('SMP Negeri 1 Talaga Jaya')
    returning id
)
insert into public.invites (school_id, email, role)
select id, lower('email.admin.sekolah@gmail.com'), 'admin'
from new_school;
```

Saat pemilik `email.admin.sekolah@gmail.com` pertama kali menekan **Masuk dengan Google** di aplikasi, fungsi `claim_invite()` otomatis menjadikannya **Admin Sekolah**. Selanjutnya, Admin tidak perlu membuka SQL lagi — undangan guru lain dilakukan langsung dari menu **Pengaturan > Tim & Undangan Guru Sekolah**.

---

## 4. Hubungkan `app-config.js` & Deploy ke Vercel

1. Buka berkas `app-config.js` di repositori proyek, lalu aktifkan `supabaseUrl` dan `supabaseAnonKey`:
   ```js
   window.APP_CONFIG = window.APP_CONFIG || {
       supabaseUrl: 'https://ulcnhluflppgavhrsrri.supabase.co',
       supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
       ai: {
           model: 'gemini-3.6-flash',
           fallbackModel: 'gemini-3.5-flash-lite'
       }
   };
   ```
   *(Saat `supabaseUrl` diisi, `proxyUrl` dan `token` Apps Script tidak lagi diperlukan dan dapat dihapus).*
2. Unggah/push repositori ke GitHub lalu impor proyek ke [vercel.com](https://vercel.com) (Framework Preset: **Other** / tanpa langkah build).
3. Di **Vercel > Project Settings > Environment Variables**, tambahkan 4 variabel berikut (untuk Production & Preview):
   - `GEMINI_API_KEY` = API key dari Google AI Studio (rahasia, jangan taruh di `app-config.js`)
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = `eyJ...` (sama dengan di atas)
   - `AI_DAILY_LIMIT` = batas permintaan AI harian per guru (opsional, bawaan `150`)
4. Lakukan **Redeploy** di Vercel agar Environment Variables aktif pada fungsi `/api/gemini`.

---

## 5. Alur Penggunaan Harian di Sekolah

1. **Admin Sekolah masuk pertama kali:**
   - Buka **Pengaturan > Identitas Sekolah & Guru**, periksa nama sekolah, tahun pelajaran, semester, dan kepala sekolah, lalu klik **Simpan Pengaturan**.
   - Buka **Kelas & Rombel** untuk menyiapkan daftar kelas, lalu **Data Peserta Didik** untuk menambah/impor CSV siswa per kelas.
   - Buka **Pengaturan > Tim & Undangan Guru Sekolah**, masukkan email Google masing-masing guru mapel, pilih peran **Guru Mapel** (atau **Admin Sekolah** untuk wakil kurikulum/operator), lalu klik **+ Undang Guru**.
2. **Guru Mata Pelajaran masuk:**
   - Buka alamat aplikasi dan klik **Masuk dengan Google**.
   - Daftar kelas dan peserta didik langsung tersedia. Tombol tambah/ubah/hapus kelas dan siswa otomatis terkunci bagi Guru Mapel agar tidak sengaja terubah.
   - Di **Pengaturan**, guru mengatur **Mata Pelajaran**, **Nama Guru**, **NIP**, **KKTP & Bobot Nilai**, serta menyetujui privasi AI lalu menekan **Uji Koneksi**.
3. **Bila satu laptop/komputer dipakai bergantian:**
   - Selalu tekan tombol **Keluar** di kanan atas setelah selesai (aplikasi akan menunggu antrean sinkronisasi terkirim lebih dulu).
   - Saat guru berikutnya masuk di browser yang sama, aplikasi akan meminta konfirmasi dan membersihkan salinan lokal guru sebelumnya (`Store.wipe`) sebelum menarik data guru yang baru masuk.

---

## 6. Daftar Periksa Uji Keamanan RLS (Dua Akun Nyata)

Gunakan dua browser berbeda (atau satu jendela normal + satu jendela Incognito) dengan **Akun A (Admin Sekolah)** dan **Akun B (Guru Mapel)**, serta satu **Akun C (Belum Diundang)** untuk memverifikasi keamanan sebelum dipakai seluruh guru:

- [ ] **Gerbang Undangan:** Masuk dengan **Akun C** (email tidak ada di `invites`). Pastikan muncul layar **Akun Belum Diundang** dan aplikasi utama tidak terbuka.
- [ ] **Undangan dari UI Admin:** Di **Akun A**, buka **Pengaturan > Tim & Undangan Guru**, undang email **Akun B** sebagai *Guru Mapel*. Di **Akun B**, masuk dengan Google -> pastikan berhasil masuk dengan lencana **Guru Mapel** di header.
- [ ] **Berbagi Data Sekolah:** Di **Akun A**, tambahkan kelas `VIII.1` dan siswa `Budi Santoso`. Di **Akun B**, klik lencana status sinkronisasi (`☁️ Tersinkron`) -> pastikan kelas `VIII.1` dan siswa `Budi Santoso` muncul.
- [ ] **Pembatasan Tulis Data Sekolah (UI & RLS):**
  - Di **Akun B**, pastikan tombol `+ Tambah Siswa`, `Import CSV`, edit/hapus siswa, dan `+ Tambah Kelas` tidak tampil, serta kolom Nama Sekolah/Periode terkunci.
  - Uji paksa dari DevTools Console di **Akun B**: jalankan `await (await RemoteSupabase.init()).push([{ tbl: 'g_stu', id: 'STU-UJI', owner_id: null, data: { id: 'STU-UJI', name: 'Palsu' }, deleted: false, client_at: new Date().toISOString() }])`. Pastikan respons mengembalikan item tersebut di dalam `rejected` (`reason: "RLS_FORBIDDEN"`) dan tidak masuk ke database.
- [ ] **Isolasi Data Pribadi Antar Guru:**
  - Di **Akun B**, buat 1 asesmen & input nilai siswa, serta buat 1 butir soal di Bank Soal. Pastikan lencana menjadi `☁️ Tersinkron`.
  - Di **Akun A**, klik sinkronisasi -> pastikan asesmen, nilai, dan soal milik **Akun B** **TIDAK** muncul di **Akun A** (begitu pula sebaliknya).
- [ ] **Penghapusan Tombstone:** Di **Akun A**, hapus satu siswa uji. Setelah sinkronisasi di **Akun B**, pastikan siswa tersebut ikut hilang dari daftar **Akun B**.
- [ ] **AI Cloud & Kuota Harian:** Di **Akun B**, buka **Pengaturan > AI**, pastikan kolom URL/token tersembunyi, centang privasi, simpan, dan klik **Uji Koneksi**. Pastikan berhasil melewati 2 tahap (server sekolah + Gemini) dan baris `public.ai_usage` bertambah di Supabase Table Editor.
