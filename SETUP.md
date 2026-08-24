# SETUP.md — Panduan Setup Sinau

Dokumen ini menjelaskan langkah-langkah untuk menghubungkan aplikasi Sinau ke Supabase, mengatur Gemini AI, dan men-deploy ke Vercel/Netlify.

---

## 1. Buat Project Supabase

1. Buka [https://supabase.com](https://supabase.com) dan login/daftar (gratis).
2. Klik **"New Project"**.
3. Isi nama project (misal: `sinau`), set password database yang kuat, pilih region terdekat (Singapore/Southeast Asia).
4. Tunggu ±2 menit sampai project selesai dibuat.

---

## 2. Ambil API Keys

1. Di dashboard Supabase project kamu, klik **Settings** (ikon gear) → **API**.
2. Salin dua nilai berikut:
   - **Project URL** → ini adalah `VITE_SUPABASE_URL`
   - **anon public** key → ini adalah `VITE_SUPABASE_ANON_KEY`
3. Juga salin **service_role** key → ini dipakai sebagai secret Edge Function (JANGAN taruh di file `.env` frontend).

---

## 3. Jalankan SQL Migration

1. Di sidebar Supabase, klik **SQL Editor**.
2. Klik **"New query"**.
3. Copy seluruh isi file `supabase/migrations/001_init.sql` dan paste ke editor.
4. Klik **Run** (atau Ctrl+Enter).
5. Pastikan tidak ada error. Jika ada, baca pesan error — biasanya terkait ekstensi atau urutan eksekusi.

---

## 4. Buat Storage Buckets

Di sidebar Supabase, klik **Storage** → **New bucket**:

### Bucket 1: `videos` (PRIVATE)
- Name: `videos`
- Public: **OFF** ← wajib private untuk keamanan paywall
- Klik Create

Setelah dibuat, tambahkan policy storage:
- **INSERT**: Authenticated users can upload to their own folder
  - Policy: `(bucket_id = 'videos') AND (auth.uid()::text = (storage.foldername(name))[1])`

### Bucket 2: `thumbnails` (PUBLIC)
- Name: `thumbnails`  
- Public: **ON** (thumbnail boleh publik)
- Klik Create

---

## 5. Buat Akun Admin

1. Di Supabase → **Authentication** → **Users** → **Invite User** (atau Add User).
2. Gunakan email: `admin@sinau.ac.id`, password: `admin123` (ganti sebelum deploy publik!).
3. Setelah akun dibuat, di **SQL Editor** jalankan:
   ```sql
   UPDATE public.profiles 
   SET role = 'admin' 
   WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@sinau.ac.id');
   ```

---

## 6. Deploy Edge Functions (Supabase CLI)

### Install Supabase CLI (jika belum):
```bash
npm install -g supabase
```

### Login dan link ke project:
```bash
supabase login
supabase link --project-ref <project-ref-kamu>
```
> Project ref ada di Settings → General → Reference ID

### Set Secrets (JANGAN hardcode di kode):
```bash
supabase secrets set GEMINI_API_KEY=AQ.Ab8RN6JHiS27EHlewhyunbjKfL0U-jmmEza1pIrIB452C5uKEQ

supabase secrets set SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2RiYmd0aGR6YmVpbXprdnF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQ3MjIwMCwiZXhwIjoyMTAzMDQ4MjAwfQ.hUBE9MdwN-VRgjkapSJ0iTzhs4uuYKZ3389Pb_Tz_lg"
```

### Deploy semua Edge Functions:
```bash
supabase functions deploy get-video-url
supabase functions deploy purchase-continue
supabase functions deploy topup-coin
supabase functions deploy generate-quiz
supabase functions deploy admin-moderate-video
```

---

## 7. Dapatkan Gemini API Key (GRATIS)

1. Buka [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Klik **"Create API Key"** → pilih project Google Cloud kamu (atau buat baru).
3. Salin API key → gunakan di langkah 6 di atas (`GEMINI_API_KEY`).
4. **PENTING**: JANGAN enable billing di Google Cloud jika ingin tetap free. Model yang dipakai (`gemini-2.0-flash-exp`) tersedia di free tier.

---

## 8. Setup Lokal

1. Salin file env:
   ```bash
   cp .env.example .env
   ```
2. Isi `.env` dengan nilai dari langkah 2:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
3. Jalankan dev server:
   ```bash
   npm install
   npm run dev
   ```
4. Buka `http://localhost:5173`

---

## 9. Upload Video Demo

Karena Supabase Storage tidak bisa diakses langsung dari agen AI, kamu perlu upload video demo secara manual:

1. Di Supabase → **Storage** → bucket `videos`.
2. Buat folder dengan nama user ID kamu (UUID).
3. Upload file `.mp4` ke dalam folder tersebut.
4. Salin path file (misal: `<user-id>/myvideo.mp4`).
5. Di **SQL Editor**, update video row:
   ```sql
   UPDATE public.videos 
   SET video_file_url = '<user-id>/myvideo.mp4', status = 'approved'
   WHERE judul = 'Judul Video Kamu';
   ```

> **Tips demo**: Gunakan video resolusi 480p, ukuran < 10MB. Untuk demo paywall, pastikan ada video berdurasi > 3 menit.

---

## 10. Deploy ke Vercel/Netlify

> **PENTING**: File `.env` lokal TIDAK ikut ter-push ke Git dan TIDAK otomatis tersedia di Vercel/Netlify. Kamu harus mengisi ulang environment variables di dashboard platform.

### Vercel:
1. Push kode ke GitHub.
2. Import project di [vercel.com](https://vercel.com).
3. Di bagian **Environment Variables**, tambahkan:
   - `VITE_SUPABASE_URL` = nilai dari langkah 2
   - `VITE_SUPABASE_ANON_KEY` = nilai dari langkah 2
4. Deploy.

### Netlify:
1. Push ke GitHub.
2. Import di [netlify.com](https://netlify.com).
3. **Site settings → Environment variables** → tambahkan dua variabel sama seperti Vercel.
4. **Build settings**: Build command = `npm run build`, Publish directory = `dist`.

---

## 11. Batas Free Tier (Wajib Dipahami Sebelum Demo)

| Layanan | Batas Free | Saran |
|---|---|---|
| Supabase Storage | ~1GB file, ~5GB bandwidth/bulan | Kompres video demo ke <10MB/file (480p) |
| Supabase DB | 500MB database | Lebih dari cukup untuk demo |
| Supabase Project | Auto-pause setelah 7 hari idle | Buka dashboard Supabase H-1 demo untuk reaktivasi |
| Gemini Flash | Rate limit per menit/hari | Jangan trigger quiz berulang video yang sama; idempotency sudah diterapkan |
| Vercel/Netlify | 100GB bandwidth/bulan | Lebih dari cukup |

---

## 12. Keamanan — Hal Penting Sebelum Deploy Publik

- **Ganti password admin** `admin@sinau.ac.id` dari `admin123` ke password kuat.
- `GEMINI_API_KEY` TIDAK PERNAH masuk ke file `.env` frontend atau kode React. Hanya di Supabase Edge Function secrets.
- `SUPABASE_SERVICE_ROLE_KEY` sama — hanya di Edge Function secrets.
- Catatan jujur untuk juri: signed URL video berlaku selama durasi video + 5 menit. Seseorang yang tahu cara membuka DevTools bisa menyalin URL dan menonton tanpa bayar dalam window waktu itu. Ini adalah trade-off yang diterima untuk implementasi zero-cost — proteksi penuh membutuhkan video streaming tersegmentasi (HLS/DASH) dengan CDN berbayar. Untuk konteks lomba mahasiswa, ini adalah keamanan yang memadai dan dapat dipertanggungjawabkan.

---

## 13. Troubleshooting Umum

| Masalah | Solusi |
|---|---|
| "Supabase credentials not set" | Isi `.env` dengan URL dan anon key yang benar |
| Video tidak muncul di Explore | Pastikan status video = 'approved' dan bucket 'videos' sudah ada |
| Edge Function error | Pastikan secrets sudah di-set dan functions sudah di-deploy |
| Quiz tidak muncul | Cek apakah GEMINI_API_KEY sudah di-set di secrets; fallback ke deskripsi video |
| Project Supabase paused | Buka dashboard.supabase.com dan klik Resume project |
| Login gagal setelah deploy | Pastikan env vars sudah diisi di Vercel/Netlify dashboard |
