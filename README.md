# Sinau — Platform Video Edukasi Berbasis Kreator

Sinau adalah platform pembelajaran video untuk mahasiswa. Pengguna dapat menonton materi, membeli akses dengan koin, menjadi kreator, memperoleh Koin Biru dari penonton unik, serta mengajukan pencairan yang diverifikasi admin.

## Akses aplikasi

| Tujuan | Tautan |
|---|---|
| Aplikasi produksi | [Buka Sinau](https://sinau1-0.ekazein495.workers.dev/) |
| Login mahasiswa/kreator | [Login pengguna](https://sinau1-0.ekazein495.workers.dev/login) |
| Login administrator | [Login admin](https://sinau1-0.ekazein495.workers.dev/admin/login) |
| Source code | [GitHub — ekz121/sinau1.0](https://github.com/ekz121/sinau1.0) |
| Panduan setup | [SETUP.md](./SETUP.md) |

Deployment menggunakan Cloudflare Workers Static Assets. Backend menggunakan Supabase project `xrgkkzfzcokwixtvetfp`.

## Akun penilaian juri

| Peran | Email | Password | Kondisi awal |
|---|---|---|---|
| Admin — Ekazein | `ekazein495@gmail.com` | `admin123` | Akses seluruh portal admin |
| Kreator demo — Fokus 20055 | `fokus20055@gmail.com` | `baimakifeka` | 500 Koin Biru = Rp250.000 |

> Kredensial ini sengaja disediakan untuk penjurian. Password admin harus diganti dan kredensial harus dihapus dari repository setelah lomba.

## Skenario demo juri — 5 menit

1. Buka [aplikasi produksi](https://sinau1-0.ekazein495.workers.dev/) dan lihat katalog video.
2. Login sebagai kreator demo, lalu periksa **Dompet**, **Studio Kreator**, video demo, dan saldo 500 Koin Biru.
3. Buka notifikasi dan gunakan **Tandai semua dibaca**.
4. Buka video approved untuk melihat player, preview/paywall, komentar, ringkasan, dan kuis.
5. Logout lalu login melalui [portal admin](https://sinau1-0.ekazein495.workers.dev/admin/login).
6. Periksa Dashboard, Review Video, Manajemen User, Monitor Transaksi, Laporan, dan Pengaturan.
7. Untuk menguji payout tanpa transfer uang: ajukan 50 Koin Biru dari akun kreator, kemudian tolak dari admin. Saldo otomatis dikembalikan.
8. Untuk menyelesaikan payout sungguhan, admin wajib mentransfer dana dan mengunggah bukti transfer.

## Fitur berdasarkan peran

### Mahasiswa

- Registrasi, login, verifikasi email, dan reset password.
- Eksplorasi dan pencarian video approved.
- Preview video, pembelian akses, riwayat tontonan, komentar, like/dislike, follow, dan laporan.
- Top-up melalui QRIS dengan unggah bukti pembayaran.
- Notifikasi realtime dan **Tandai semua dibaca**.

### Kreator

- Upload video MP4 melalui TUS resumable upload.
- Durasi video tidak dibatasi oleh aplikasi.
- Studio statistik dan status moderasi.
- Memperoleh 1 Koin Biru dari setiap akun penonton unik per video.
- Mengajukan pencairan ke bank/e-wallet.
- Melihat status, catatan admin, referensi, dan bukti transfer payout.

### Administrator

- Dashboard statistik platform.
- Approve/reject video.
- Manajemen pengguna, suspend, role, dan audit log.
- Verifikasi top-up QRIS.
- Proses payout dengan bukti transfer wajib.
- Penanganan laporan dan pengaturan aplikasi.

## Aturan koin dan pembayaran

| Jenis | Fungsi |
|---|---|
| Koin Top Up — kuning | Dibeli melalui QRIS dan dipakai membuka akses video; tidak dapat dicairkan |
| Koin Kreator — biru | Diperoleh dari view unik dan dapat dicairkan |
| Hadiah view | 1 akun unik × 1 video = 1 Koin Biru |
| Kurs | 1 Koin Biru = Rp500 |
| Minimum payout | 50 koin = Rp25.000 |
| Saldo akun demo | 500 Koin Biru = Rp250.000 |

View berulang akun yang sama pada video yang sama tidak memberikan koin tambahan. Pencatatan hadiah dilakukan backend dan dilindungi ledger unik.

### Alur top-up QRIS

1. Pengguna memilih jumlah koin dan memindai QRIS.
2. Pengguna mengunggah bukti transfer.
3. Request berstatus `pending`; saldo belum berubah.
4. Admin mencocokkan bukti dengan mutasi merchant/bank.
5. Approve menambah Koin Top Up secara atomik; reject menyimpan alasan.

### Alur payout kreator

1. Kreator mengajukan minimal 50 Koin Biru.
2. Saldo langsung dicadangkan untuk mencegah pengajuan ganda.
3. Admin memeriksa rekening/e-wallet dan melakukan transfer.
4. Admin wajib mengunggah bukti sebelum menandai payout selesai.
5. Kreator dapat membuka bukti melalui signed URL privat.
6. Jika ditolak, Koin Biru otomatis dikembalikan.

## Status kesiapan

| Pemeriksaan | Status |
|---|---|
| Cloudflare production deployment | Lulus |
| Root dan route `/admin/login` | HTTP 200 |
| Supabase production variables | Terpasang |
| Production build | Lulus |
| Lint | Tidak ada error; warning advisory tersedia |
| Migration database | Sinkron `001`–`016` |
| Edge Functions utama | Aktif |
| Login admin dan kreator | Terverifikasi |
| QRIS pengguna | Dapat dimuat |
| View unik dan hadiah 1 koin | Terverifikasi |
| Payout proof guard | Terverifikasi |
| SPA refresh routing | Terverifikasi melalui Wrangler SPA fallback |

## Batas video pada paket gratis

Supabase Free membatasi upload menjadi maksimal 50 MB per file dan menyediakan total storage gratis 1 GB. Karena itu aplikasi memvalidasi 50 MB agar upload tidak gagal di server.

Untuk prototipe 20 video berdurasi 30–60 menit, gunakan MP4 H.264/AAC 360p dengan target sekitar 40–45 MB per video. Batas 200 MB baru dapat digunakan setelah upgrade Supabase Pro atau memindahkan video ke storage lain.

## Teknologi

- React 19, Vite 8, React Router, Zustand, dan Tailwind CSS.
- Supabase PostgreSQL, Auth, Storage, Realtime, RLS, dan Edge Functions.
- Cloudflare Workers Static Assets untuk hosting.
- Gemini API untuk ringkasan dan kuis, dengan fallback ketika key atau kuota tidak tersedia.

## Menjalankan secara lokal

Buat `.env` dari `.env.example`:

```env
VITE_SUPABASE_URL=https://xrgkkzfzcokwixtvetfp.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-key-dari-supabase
```

Kemudian jalankan:

```powershell
npm install
npm run dev
npm run lint
npm run build
```

Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` atau `GEMINI_API_KEY` di frontend, source code, atau GitHub.

## Backend dan deployment

Migration `001`–`016` serta Edge Functions sudah diterapkan pada project Supabase aktif. Cloudflare menggunakan:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Static assets: `dist`
- SPA fallback: `wrangler.toml`
- Production domain: [sinau1-0.ekazein495.workers.dev](https://sinau1-0.ekazein495.workers.dev/)

Panduan lengkap konfigurasi Cloudflare, Supabase Auth, Gemini, QRIS, payout, dan troubleshooting tersedia di [SETUP.md](./SETUP.md).
