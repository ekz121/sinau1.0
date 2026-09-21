# Setup, Admin, dan Hosting Sinau

Status terakhir: 21 September 2026. Frontend lokal terhubung ke project Supabase
`xrgkkzfzcokwixtvetfp`. Migration `001` sampai `015` dan seluruh Edge
Function Sinau sudah diterapkan ke project tersebut.

## 1. Menjalankan aplikasi

Prasyarat: Node.js `^20.19.0` atau `>=22.12.0`.

```powershell
npm install
npm run dev
```

Frontend hanya memerlukan dua variable berikut di file `.env`:

```env
VITE_SUPABASE_URL=https://xrgkkzfzcokwixtvetfp.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-key-dari-dashboard
```

Publishable key aman dipakai di frontend karena akses data tetap dibatasi RLS.
Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` atau `GEMINI_API_KEY` di
variable `VITE_*`, source React, Git, atau layanan hosting frontend.

Verifikasi lokal:

```powershell
npm run lint
npm run build
npm run preview
```

## 2. Kondisi backend saat ini

Koneksi yang sudah diverifikasi:

- Auth settings: HTTP 200
- REST API `categories`: HTTP 200
- preflight Edge Function: HTTP 200
- migration lokal/remote: sinkron sampai `015`
- production build: berhasil
- smoke test akun, kreator, admin, upload, moderasi, preview, pembelian,
  idempotensi, dan akses penuh: berhasil

Jika source database berubah:

```powershell
supabase link --project-ref xrgkkzfzcokwixtvetfp
supabase db push --linked
```

Jangan mengubah migration yang sudah diterapkan. Buat nomor migration baru.

## 3. Akun admin dan cara mengeceknya

Akun admin yang aktif saat ini:

- Nama: **Ekazein**
- Email: **ekazein495@gmail.com**
- Halaman login: `/admin/login`

Password tidak disimpan di repository atau dokumentasi. Jika lupa, gunakan
fitur lupa password pada aplikasi atau reset melalui Supabase Authentication.

Untuk demo hari ini, project masih mewajibkan konfirmasi email. Agar pembuatan
beberapa akun uji tidak terhambat, buka **Supabase > Authentication > Providers >
Email** lalu nonaktifkan **Confirm email** sementara. Aktifkan kembali setelah
SMTP produksi sudah disiapkan.

Untuk membuat admin lain, daftarkan akun dari `/register`, buka **Supabase
Dashboard > SQL Editor**, lalu jalankan SQL berikut dengan email akun tersebut:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'email-admin-anda'
);
```

Cek daftar admin:

```sql
select u.email, p.nama, p.role, p.is_suspended, p.is_deleted
from auth.users u
join public.profiles p on p.id = u.id
where p.role = 'admin';
```

Login melalui `/admin/login`. Gunakan password kuat dan jangan menaruh password
di source code, GitHub, atau dokumentasi.

## 4. Alur pembayaran QRIS dan pemeriksaan admin

QRIS aktif tersimpan di bucket publik `thumbnails` dengan path
`qris/sinau-qris.jpeg`. Gambar sengaja dapat dibaca publik agar tampil pada
halaman pembayaran, sedangkan bukti transfer pengguna disimpan di bucket privat
`payment-proofs` dan hanya dibuka admin melalui tautan sementara.

Alur top-up pengguna:

1. Login, buka **Dompet > Top Up**, lalu pilih jumlah koin.
2. Scan QRIS dan transfer dengan nominal persis yang ditampilkan.
3. Unggah screenshot bukti JPG/PNG/WebP maksimal 5 MB.
4. Klik **Sudah Transfer, Kirim Konfirmasi**. Status menjadi `pending` dan koin
   belum bertambah sampai admin menyetujui.

Alur pemeriksaan admin:

1. Login `/admin/login`, buka **Monitor Transaksi > Permintaan Top-up**.
2. Buka bukti transfer, cocokkan nominal, nama/waktu, lalu cek mutasi QRIS pada
   aplikasi merchant/bank penerima.
3. Klik **Setujui & Kirim Koin** hanya jika uang benar-benar masuk. Sistem akan
   menambah Koin Top Up secara atomik dan mencegah persetujuan ganda.
4. Jika tidak valid, klik **Tolak** dan isi alasan. Pengguna dapat melihat status
   serta menerima notifikasi.

Alur pencairan kreator:

1. Hanya Koin Biru hasil pendapatan kreator yang dapat dicairkan; Koin Top Up
   tidak bisa ditarik kembali menjadi uang.
2. Kreator mengisi bank/e-wallet tujuan dan mengajukan minimal 50 koin. Saldo
   langsung dicadangkan agar tidak dapat diajukan dua kali.
3. Admin membuka **Permintaan Payout**, mentransfer uang ke tujuan yang tertera,
   lalu klik **Sudah Transfer**. Jika ditolak, sistem otomatis mengembalikan Koin
   Biru ke kreator.

Ini adalah pembayaran QRIS dengan verifikasi manual, bukan payment gateway
otomatis. Aplikasi tidak dapat memastikan dana masuk hanya dari screenshot;
admin tetap wajib mengecek mutasi merchant sebelum menyetujui.

## 5. Mengaktifkan Gemini tanpa paket Pro

Langganan Gemini aplikasi konsumen dan Gemini API adalah hal berbeda. Untuk
prototipe, buat API key di Google AI Studio dan gunakan free tier selama kuota
project masih tersedia. Project Supabase baru saat ini belum memiliki
`GEMINI_API_KEY`.

Tambahkan secret dari terminal:

```powershell
supabase secrets set GEMINI_API_KEY=API_KEY_ANDA GEMINI_MODEL=gemini-2.5-flash-lite --project-ref xrgkkzfzcokwixtvetfp
```

Atau gunakan **Supabase Dashboard > Edge Functions > Secrets**. Jangan kirim API
key lewat chat. Setelah secret disimpan, deploy ulang dua function AI:

```powershell
supabase functions deploy generate-quiz --project-ref xrgkkzfzcokwixtvetfp
supabase functions deploy generate-summary --project-ref xrgkkzfzcokwixtvetfp
```

Tanpa key atau saat kuota habis, aplikasi tetap membuat ringkasan/kuis fallback
dari metadata/deskripsi video sehingga fitur inti tidak berhenti.

## 6. Video 30-60 menit

Aplikasi tidak lagi memiliki batas durasi 15 menit. Upload sekarang memakai TUS
resumable, retry otomatis, dan progres nyata.

Batas paket Supabase Free yang tetap berlaku:

- maksimal 50 MB per file;
- total Storage 1 GB;
- untuk 20 video, targetkan maksimal sekitar 45 MB per video agar total video
  sekitar 900 MB dan masih ada ruang thumbnail.

Kompres ke MP4 H.264/AAC, resolusi 360p. Video satu jam di bawah 45-50 MB akan
berkualitas rendah. Jika kualitas tinggi wajib, penyimpanan video harus
dipindahkan ke storage/CDN dengan kuota lebih besar; menaikkan batas di kode
tidak dapat melewati batas akun Supabase Free.

## 7. Hosting gratis dengan Cloudflare Pages

Cloudflare Pages disarankan untuk prototipe lomba:

1. Push repository ke GitHub atau GitLab. Pastikan file `.env` tidak ikut
   ter-push.
2. Buka **Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to
   Git**.
3. Pilih repository Sinau dan preset framework **Vite**.
4. Isi build command `npm run build` dan output directory `dist`.
5. Tambahkan environment variables `VITE_SUPABASE_URL` dan
   `VITE_SUPABASE_ANON_KEY`.
6. Deploy. File `public/_redirects` sudah menangani React Router agar refresh
   pada `/admin/login` atau `/video/:id` tidak 404.
7. Salin domain `https://nama.pages.dev`.
8. Di **Supabase > Authentication > URL Configuration**, isi Site URL dengan
   domain tersebut dan tambahkan `https://nama.pages.dev/**` ke Redirect URLs.
9. Tes register, login user, upload, review admin, pemutaran, pembayaran koin,
   laporan, dan logout dari domain hosting.

Alternatifnya Vercel: import repository, preset Vite, build `npm run build`,
output `dist`, lalu isi dua variable `VITE_*`. File `vercel.json` sudah
menyediakan SPA rewrite. Paket Hobby Vercel ditujukan untuk penggunaan
personal/non-komersial.

## 8. Checklist sebelum presentasi

- Nonaktifkan **Confirm email** sementara atau pastikan semua akun uji sudah
  mengonfirmasi emailnya.
- Buat satu akun admin dan minimal dua akun mahasiswa untuk tes penonton/kreator.
- Login kreator, upload satu MP4 kecil, lalu login admin dan approve.
- Login penonton, cek preview 60 detik, top-up request, approval admin, pembelian,
  dan lanjut menonton.
- Pastikan gambar QRIS tampil di halaman Top Up dan lakukan satu transaksi kecil
  untuk menguji mutasi QRIS serta persetujuan admin.
- Jika Gemini diperlukan, pasang secret lalu uji ringkasan dan kuis satu video.
- Buka DevTools Console dan Network; jangan lanjut presentasi jika ada request
  merah yang terkait alur utama.
- Jaga project Supabase Free tetap aktif; project gratis dapat dipause setelah
  tidak aktif selama periode tertentu.

## 9. Troubleshooting

| Gejala | Tindakan |
|---|---|
| Login/data gagal | Pastikan URL dan publishable key berasal dari project `xrgkkzfzcokwixtvetfp`, lalu restart Vite. |
| Deep link hosting 404 | Pastikan `public/_redirects` ikut ter-build atau gunakan `vercel.json`. |
| Upload ditolak | Gunakan MP4 di bawah 50 MB dan pastikan user masih aktif. |
| Edge Function gagal | Periksa **Supabase > Edge Functions > Logs** dan pastikan function sudah dideploy ke project baru. |
| Gemini memakai fallback | Tambahkan `GEMINI_API_KEY`, cek kuota di AI Studio, lalu deploy ulang dua function AI. |
| Reset password kembali ke localhost | Perbaiki Site URL dan Redirect URLs di Supabase Auth. |
