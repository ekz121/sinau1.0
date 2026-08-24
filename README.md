# Sinau — Platform Berbagi Video Edukasi v1.1.0

Platform berbagi video kuliah berbasis koin untuk mahasiswa. Kreator upload video, penonton bayar koin untuk akses penuh, kreator mendapat revenue share.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18, Vite, React Router v6, Zustand, Tailwind CSS |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions Deno/TS) |
| Realtime | Supabase Realtime |
| UI Feedback | react-hot-toast |

## Environment Variables

Buat file `.env` di root project:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Catatan keamanan:** `service_role` key **TIDAK BOLEH** ada di `.env` frontend maupun `VITE_*` variables.

### Edge Function Secrets (Supabase Dashboard → Settings → Edge Functions)

```
SUPABASE_URL              # Otomatis tersedia di runtime Supabase
SUPABASE_SERVICE_ROLE_KEY # Otomatis tersedia di runtime Supabase
GEMINI_API_KEY            # Google AI Studio — untuk fitur generate quiz AI
```

## Setup Supabase Project

### 1. Buat Project Baru
- Buka [supabase.com](https://supabase.com) → New Project
- Catat `Project URL` dan `anon key` untuk `.env`

### 2. Jalankan Migrations (berurutan)

```bash
# Via Supabase CLI
supabase db push

# Atau manual via SQL Editor di dashboard:
# Jalankan file-file ini berurutan:
# supabase/migrations/001_init.sql
# supabase/migrations/002_features.sql
# supabase/migrations/003_topup_payout.sql
# supabase/migrations/004_social.sql
# supabase/migrations/005_categories.sql
# supabase/migrations/006_settings_config.sql
# supabase/migrations/007_v1_1_foundation.sql   ← v1.1 baru
# supabase/migrations/008_v1_1_hardening.sql    ← v1.1 baru
```

### 3. Storage Buckets

Buat dua bucket di Supabase Dashboard → Storage:

| Bucket | Visibility | Keterangan |
|--------|------------|------------|
| `videos` | **Private** | File video — akses hanya via signed URL |
| `thumbnails` | Public | Thumbnail, avatar, bukti QRIS |

### 4. Deploy Edge Functions

```bash
supabase functions deploy purchase-continue
supabase functions deploy submit-topup-request
supabase functions deploy admin-approve-topup
supabase functions deploy request-payout
supabase functions deploy admin-resolve-payout
supabase functions deploy get-video-url
supabase functions deploy generate-quiz
supabase functions deploy admin-moderate-video
supabase functions deploy admin-manage-user     # baru di v1.1
```

### 5. Aktifkan Supabase Realtime

Di Dashboard → Database → Replication, aktifkan tabel `notifications` untuk Realtime.

### 6. Konfigurasi Email Auth

Di Dashboard → Authentication → Email, pastikan:
- `Confirm email` = **Enabled**
- Konfigurasikan SMTP server (atau gunakan Supabase built-in email untuk dev)

## Menjalankan Development

```bash
npm install
npm run dev
```

## Build Production

```bash
npm run build
# Output: dist/
```

## Fitur v1.1.0

### Portal Mahasiswa
- **Explore** — grid video approved, filter kategori dinamis, search
- **Detail Video** — player dengan paywall (batas waktu dari `app_settings`), komentar threaded, like/dislike, follow kreator, laporan, **quiz AI otomatis**
- **Wallet** — top-up QRIS, pencairan koin ke rekening/e-wallet
- **Studio Kreator** — statistik per video, tombol cairkan koin
- **Upload Video** — drag & drop, validasi ukuran/format, progress bar
- **Notifikasi** — realtime via Supabase Realtime

### Portal Admin
- **Dashboard** — statistik platform
- **Review Antrian** — approve/reject video pending
- **Semua Video** — filter, pagination, edit, soft delete
- **Manajemen User** — suspend, promote/demote admin, soft delete + audit log
- **Monitor Transaksi** — log otomatis, approve/reject top-up & payout
- **Laporan** — update status laporan user
- **Pengaturan** — revenue split, rate koin, QRIS, kategori (semua dari DB, tanpa redeploy)

### Keamanan
- RLS aktif di semua 14 tabel
- Operasi saldo koin hanya via Edge Functions (service_role)
- Idempotency untuk semua operasi koin
- Audit log aksi admin
- Signed URL pendek untuk akses video

## Konfigurasi via Admin Panel

Nilai-nilai berikut bisa diubah admin tanpa redeploy:

| Setting | Default | Keterangan |
|---------|---------|------------|
| `revenue_split_creator` | 80 | Persen pendapatan kreator |
| `koin_to_rupiah_rate` | 500 | 1 koin = Rp 500 |
| `min_payout_koin` | 50 | Minimum pencairan |
| `free_preview_seconds` | 180 | Durasi preview gratis (detik) |
| `qris_image_url` | — | URL gambar QRIS untuk top-up |
