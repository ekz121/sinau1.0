# Sinau — Platform Video Edukasi

Sinau adalah aplikasi React + Supabase untuk berbagi video pembelajaran, top-up QRIS dengan verifikasi admin, pendapatan kreator, pencairan, moderasi, notifikasi realtime, serta kuis/ringkasan berbantuan Gemini.

## URL dan akun pemeriksaan juri

Source: https://github.com/ekz121/sinau1.0

Domain produksi diisi setelah deploy Cloudflare Pages atau Netlify. Lihat [SETUP.md](./SETUP.md) untuk langkah lengkap.

| Peran | Halaman | Email | Password |
|---|---|---|---|
| Admin | `/admin/login` | `ekazein495@gmail.com` | `admin123` |
| Kreator demo | `/login` | `fokus20055@gmail.com` | `baimakifeka` |

Nama admin: **Ekazein**. Akun kreator demo memiliki **500 Koin Biru**, setara **Rp250.000** pada kurs saat ini.

> Kredensial di atas sengaja dicantumkan untuk pemeriksaan lomba. Segera ganti password admin dan hapus kredensial dari README setelah penjurian.

## Aturan koin

- Koin Top Up (kuning) dibeli pengguna lewat QRIS dan digunakan untuk membuka akses penuh video.
- Koin Kreator (biru) didapat dari penonton unik: **1 akun melihat 1 video = 1 Koin Biru**.
- View berulang dari akun yang sama pada video yang sama tidak memberi koin tambahan.
- Hanya Koin Biru yang dapat dicairkan.
- Kurs: **1 Koin Biru = Rp500**.
- Minimum pencairan: **50 koin = Rp25.000**.
- Setelah admin mentransfer uang, admin wajib mengunggah bukti transfer. Kreator dapat membuka bukti tersebut dari riwayat pencairan.

## Alur utama

### Top-up QRIS

1. Pengguna membuka **Dompet → Top Up**, memilih paket, memindai QRIS, lalu mengunggah bukti pembayaran.
2. Permintaan berstatus `pending`; saldo belum berubah.
3. Admin membuka **Monitor Transaksi**, memeriksa bukti dan mutasi QRIS, lalu menyetujui atau menolak.
4. Persetujuan hanya dapat diproses sekali dan menambah Koin Top Up secara atomik.

### Pencairan kreator

1. Kreator mengisi bank/e-wallet tujuan dan mengajukan minimal 50 Koin Biru.
2. Saldo langsung dicadangkan agar tidak dapat diajukan dua kali.
3. Admin mentransfer dana, mengunggah bukti transfer, lalu menyelesaikan permintaan.
4. Jika ditolak, Koin Biru otomatis dikembalikan.
5. Status, catatan admin, nomor referensi, dan bukti transfer terlihat oleh kreator.

### Video dan hadiah view

- Video harus disetujui admin sebelum tampil.
- URL video berasal dari signed URL bucket privat.
- View dan hadiah dicatat di backend saat video resmi diakses.
- Satu transaksi hadiah unik mengamankan sistem dari refresh/replay.
- Durasi video tidak dibatasi.
- Upload menggunakan TUS resumable dengan retry dan progress.

## Batas upload video

Project Supabase Free hanya mengizinkan maksimal **50 MB per file**, sehingga aplikasi memakai batas 50 MB agar upload tidak gagal. Angka 200 MB baru dapat dipakai setelah upgrade Supabase Pro atau memindahkan video ke storage lain. Setelah upgrade, ubah batas bucket `videos` dan konstanta `MAX_SIZE_MB` di `src/components/FileDropzone.jsx` menjadi 200.

Untuk prototipe 20 video berdurasi 30–60 menit, kompres MP4 H.264/AAC (360p, bitrate rendah). Kuota Storage Free adalah 1 GB, jadi target aman sekitar 40–45 MB per video.

## Stack

- React 19, Vite 8, React Router 7, Zustand, Tailwind CSS
- Supabase PostgreSQL, Auth, Storage, Realtime, Edge Functions
- Gemini API opsional untuk ringkasan dan kuis; jika key/kuota tidak tersedia, fallback lokal tetap menjaga fitur inti berjalan

## Menjalankan lokal

Buat `.env`:

```env
VITE_SUPABASE_URL=https://xrgkkzfzcokwixtvetfp.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-key-dari-supabase
```

Lalu:

```powershell
npm install
npm run dev
npm run lint
npm run build
```

Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` atau `GEMINI_API_KEY` di `.env` frontend, source code, atau GitHub.

## Backend

Migration `001` sampai `016` sudah diterapkan pada project Supabase yang terhubung. Migration terbaru menambahkan:

- notifikasi **Tandai semua dibaca** melalui RPC aman;
- 1 Koin Biru untuk setiap view unik;
- pencegahan kredit view ganda;
- bukti transfer wajib untuk payout selesai;
- akses privat bukti payout untuk admin dan pemiliknya.

Jika memakai project Supabase baru:

```powershell
supabase link --project-ref PROJECT_REF
supabase db push --linked
supabase functions deploy purchase-continue
supabase functions deploy submit-topup-request
supabase functions deploy admin-approve-topup
supabase functions deploy request-payout
supabase functions deploy admin-resolve-payout
supabase functions deploy get-video-url
supabase functions deploy generate-quiz
supabase functions deploy generate-summary
supabase functions deploy admin-moderate-video
supabase functions deploy admin-manage-user
supabase functions deploy admin-resolve-report
supabase functions deploy admin-update-settings
```

Panduan deployment, konfigurasi Supabase Auth, Gemini, pemeriksaan transaksi, dan checklist juri ada di [SETUP.md](./SETUP.md).
