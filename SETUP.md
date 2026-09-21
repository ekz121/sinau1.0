# Setup, Hosting, dan Pemeriksaan Sinau

Status: 21 September 2026. Repository memakai Supabase project `xrgkkzfzcokwixtvetfp`; migration `001`–`016` dan Edge Functions utama sudah diterapkan.

## 1. Rekomendasi hosting

Gunakan **Cloudflare Pages** untuk lomba: gratis, HTTPS otomatis, domain `*.pages.dev`, dan deploy otomatis dari GitHub. Nama yang disarankan: `sinau-juri-2026`, sehingga alamatnya `https://sinau-juri-2026.pages.dev` jika masih tersedia. Netlify adalah alternatif yang sama-sama cocok. Project ini tidak dideploy ke GitHub Pages.

## 2. Deploy Cloudflare Pages

1. Buka **Cloudflare → Workers & Pages → Create application → Pages → Connect to Git**.
2. Pilih repository `ekz121/sinau1.0`.
3. Atur Production branch `main`, preset `Vite`, command `npm run build`, output `dist`, dan kosongkan Root directory.
4. Tambahkan untuk Production dan Preview:
   - `VITE_SUPABASE_URL` = URL project Supabase.
   - `VITE_SUPABASE_ANON_KEY` = publishable/anon key Supabase.
5. Klik **Save and Deploy**, lalu salin domain `pages.dev` yang diberikan.
6. Push berikutnya ke `main` akan dideploy otomatis.

## 3. Alternatif Netlify

1. Pilih **Add new site → Import an existing project**, lalu repository `ekz121/sinau1.0`.
2. Atur branch `main`, command `npm run build`, publish directory `dist`.
3. Tambahkan dua environment variable `VITE_*` yang sama, lalu deploy.
4. Ubah nama site bila perlu, misalnya `sinau-juri-2026`.

File `public/_redirects` menangani refresh route React seperti `/admin/login`, `/wallet`, dan `/video/:id` pada kedua platform.

## 4. Wajib: URL Supabase Auth

Sesudah memperoleh domain produksi:

1. Buka **Supabase → Authentication → URL Configuration**.
2. Isi **Site URL** dengan domain produksi.
3. Tambahkan Redirect URLs:
   - `https://domain-anda.pages.dev/**`;
   - domain Netlify bila digunakan;
   - `http://localhost:5173/**` untuk lokal.
4. Simpan dan tes registrasi, verifikasi email, serta lupa password.

Callback aplikasi sudah mengikuti domain dan base path yang aktif.

## 5. Akun juri

| Peran | Email | Password |
|---|---|---|
| Admin Ekazein | `ekazein495@gmail.com` | `admin123` |
| Kreator demo | `fokus20055@gmail.com` | `baimakifeka` |

Admin login di `/admin/login`, kreator di `/login`. Kreator demo memiliki 500 Koin Biru = Rp250.000. Seusai lomba, ganti password admin dan hapus kredensial dari dokumentasi.

Daftar admin dapat diperiksa dengan:

```sql
select u.email, p.nama, p.role, p.is_suspended, p.is_deleted
from auth.users u join public.profiles p on p.id = u.id
where p.role = 'admin';
```

## 6. Top-up QRIS

QRIS ada pada bucket publik `thumbnails` di `qris/sinau-qris.jpeg`; bukti pembayaran berada di bucket privat `payment-proofs`.

Pengguna memilih paket, memindai QRIS, mentransfer nominal persis, mengunggah JPG/PNG/WebP maksimal 5 MB, lalu mengirim konfirmasi. Status tetap `pending` dan saldo belum berubah.

Admin membuka **Monitor Transaksi → Permintaan Top-up**, memeriksa bukti serta mutasi QRIS, kemudian menyetujui atau menolak. Screenshot bukan bukti final dana masuk; admin wajib memeriksa mutasi merchant/bank. Backend mencegah persetujuan ganda.

## 7. Koin Biru dan payout

- 1 akun unik menonton 1 video = 1 Koin Biru; view berulang tidak menggandakan hadiah.
- 1 Koin Biru = Rp500; minimum payout 50 koin = Rp25.000.
- 500 Koin Biru = Rp250.000.
- Koin Top Up tidak dapat dicairkan.

Kreator mengisi jumlah dan rekening/e-wallet. Saldo langsung dicadangkan. Admin memeriksa data, mentransfer nilai Rupiah, mengunggah bukti transfer, mengisi catatan/referensi, lalu memilih **Sudah Transfer**. Tanpa bukti, backend menolak penyelesaian. Jika ditolak, saldo otomatis kembali. Kreator dapat melihat status dan membuka bukti melalui signed URL privat.

## 8. Video panjang dan batas 200 MB

Durasi video tidak dibatasi. Upload menggunakan TUS resumable, retry otomatis, dan progress nyata. Supabase Free membatasi satu file maksimal 50 MB dan total storage gratis 1 GB; project sengaja memvalidasi 50 MB agar server tidak menolak. Untuk 20 video, targetkan 40–45 MB per video, MP4 H.264/AAC 360p.

Untuk memakai 200 MB:

1. Upgrade Supabase Pro atau pindahkan video ke storage lain.
2. Naikkan global Storage limit minimal 200 MB.
3. Atur bucket `videos` menjadi 200 MB.
4. Ubah `MAX_SIZE_MB` pada `src/components/FileDropzone.jsx` menjadi 200.
5. Tambahkan migration baru dengan `file_size_limit = 209715200`.
6. Build dan tes upload dari koneksi lambat.

Jangan hanya menaikkan angka frontend pada paket Free.

## 9. Gemini tanpa Pro

Gemini aplikasi konsumen dan Gemini API berbeda. Langganan Pro tidak wajib selama API key Google AI Studio memiliki kuota. Simpan key sebagai secret Edge Functions, bukan variable `VITE_*`:

```powershell
supabase secrets set GEMINI_API_KEY=API_KEY_ANDA GEMINI_MODEL=gemini-2.5-flash-lite --project-ref xrgkkzfzcokwixtvetfp
supabase functions deploy generate-quiz --project-ref xrgkkzfzcokwixtvetfp
supabase functions deploy generate-summary --project-ref xrgkkzfzcokwixtvetfp
```

Jangan kirim key lewat chat atau GitHub. Saat key/kuota habis, fallback metadata/deskripsi menjaga fitur inti tetap berjalan.

## 10. Lokal dan backend

Prasyarat Node.js `^20.19.0` atau `>=22.12.0`.

```powershell
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

File `.env` frontend:

```env
VITE_SUPABASE_URL=https://xrgkkzfzcokwixtvetfp.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-key-dari-dashboard
```

Publishable key boleh di frontend karena RLS membatasi akses. Jangan pernah mengekspos service-role key. Untuk project Supabase baru, jalankan `supabase link`, `supabase db push --linked`, lalu deploy semua function di folder `supabase/functions`.

## 11. Checklist sebelum juri

1. Buka domain dalam mode incognito.
2. Login kreator demo dan pastikan 500 Koin Biru tampil.
3. Coba **Tandai semua dibaca**.
4. Putar video demo dan periksa Studio Kreator.
5. Login admin; buka Dashboard, Review, User, Transaksi, dan Laporan.
6. Buat top-up kecil, unggah bukti, dan approve.
7. Buat payout minimal; pastikan admin wajib mengunggah bukti.
8. Buka bukti payout dari akun kreator.
9. Refresh `/admin/login` dan `/wallet`; pastikan tidak 404.
10. Periksa DevTools Console/Network untuk error.
11. Siapkan MP4 kecil cadangan.
12. Pastikan project Supabase tidak paused.

## 12. Troubleshooting

| Masalah | Solusi |
|---|---|
| Halaman kosong | Periksa dua environment variable `VITE_*`, lalu redeploy. |
| Refresh route 404 | Pastikan `dist/_redirects` ada pada hasil build. |
| Login gagal | Cek kredensial serta status suspended/deleted. |
| Reset kembali ke URL salah | Perbaiki Site URL dan Redirect URLs Supabase. |
| Upload >50 MB gagal | Kompres, upgrade Supabase, atau pindah storage. |
| QRIS tidak tampil | Periksa `qris_image_url` dan object QRIS. |
| Top-up belum masuk | Admin belum memverifikasi dan approve. |
| Payout gagal selesai | Admin harus unggah bukti transfer dahulu. |
| Gemini fallback | Periksa secret dan kuota, lalu deploy ulang function AI. |
| Notifikasi tidak berubah | Login ulang dan pastikan migration 016 terpasang. |
