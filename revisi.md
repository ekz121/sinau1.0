# Sinau v1.1 — Changelog & Release Notes

## Ringkasan Perubahan

### 🔐 Keamanan & Data Integrity

| # | Perubahan | File |
|---|-----------|------|
| 1 | `process_purchase` sekarang baca `revenue_split_creator` dari `app_settings` — tidak lagi hardcode 80/20 | `migrations/007`, `process_purchase` RPC |
| 2 | `request_payout` sekarang baca `min_payout_koin` & `koin_to_rupiah_rate` dari `app_settings` | `migrations/007`, `request-payout` edge fn |
| 3 | `submit-topup-request` tidak lagi hardcode nominal [10,25,50,100]; mendukung nominal bebas + idempotency key | `submit-topup-request/index.ts` |
| 4 | `admin-approve-topup` kini idempoten: jika request sudah diproses, return sukses tanpa apply ulang | `admin-approve-topup/index.ts` |
| 5 | `get-video-url` kini cek `has_paid_to_continue` untuk user non-kreator/non-admin sebelum generate URL penuh | `get-video-url/index.ts` |
| 6 | User suspend/soft-delete via edge function `admin-manage-user` (service_role) — tidak lagi langsung via client | `admin-manage-user/index.ts` |
| 7 | `process_topup` mendukung `idempotency_key` (3-arg overload); 2-arg lama tetap berjalan | `migrations/007` |

### ✨ Fitur Baru

| # | Perubahan | File |
|---|-----------|------|
| 8 | Notifikasi real-time via Supabase Realtime (bukan polling 30s) | `NotificationBell.jsx` |
| 9 | Notifikasi ke followers saat kreator punya video baru diapprove | `migrations/007` (trigger DB) |
| 10 | Admin: promote/demote admin, soft-delete user via modal konfirmasi | `UserManagementPage.jsx`, `admin-manage-user` |
| 11 | Kategori dinamis di semua halaman (Explore, Upload, Review, AllVideos) — tidak lagi hardcode | `useCategories.js` hook |
| 12 | Settings dinamis (paywall time, koin rate, revenue split) tersebar di seluruh UI | `useAppSettings.js` hook |
| 13 | Paywall time di `VideoPlayer` baca `free_preview_seconds` dari `app_settings` | `VideoPlayer.jsx` |
| 14 | `PaywallModal` menampilkan nilai rate & split dari `app_settings` — tidak lagi hardcode teks | `PaywallModal.jsx` |
| 15 | Kategori yang masih dipakai video tidak bisa dihapus (perlindungan di UI admin) | `SettingsPage.jsx` (TabKategori) |

### 🐛 Bug Fixes

| # | Perubahan | File |
|---|-----------|------|
| 16 | `walletStore.topup` (invoke `topup-coin` legacy) diganti dengan `submitTopupRequest` | `walletStore.js` |
| 17 | Parent comment yang dihapus tapi punya reply kini tampil sebagai "[Komentar telah dihapus]" (tidak hilang, reply tetap utuh) | `CommentSection.jsx` |
| 18 | Badge "Akses Penuh" di VideoDetail tidak lagi hardcode `durasi > 180s` | `VideoDetailPage.jsx` |
| 19 | Revenue platform di AdminDashboard & TransactionMonitor baca dari `app_settings` | `AdminDashboardPage.jsx`, `TransactionMonitorPage.jsx` |
| 20 | Settings cache diinvalidate setelah admin save pengaturan | `SettingsPage.jsx` |

---

## Migration yang Harus Dijalankan di Production

### Wajib, Berurutan

```
1. supabase/migrations/007_v1_1_foundation.sql
```

**Isi migration 007:**
- Fungsi `get_my_role()` (idempoten, diperlukan sejak migration 002)
- Key baru di `app_settings`: `free_preview_seconds` = `'180'`
- Kolom `idempotency_key` di `topup_requests` + unique index
- Trigger `on_video_approved_notify_followers` — notif ke followers saat video diapprove
- RPC `process_purchase` diperbarui (baca revenue split dari app_settings)
- RPC `request_payout` diperbarui (baca min_payout & rate dari app_settings)
- RPC `process_topup` diperbarui (terima idempotency_key opsional)
- RLS policy baru: `views_select_admin`
- Index tambahan

**Reversible?** Sebagian besar aman. Yang perlu perhatian:
- Kolom `idempotency_key` di `topup_requests` — bisa di-drop manual jika rollback
- Trigger `on_video_approved_notify_followers` — bisa di-drop manual
- RPC updates — replace back dengan versi di 001/003 jika rollback

### Edge Functions yang Harus Di-deploy Ulang

```
supabase functions deploy submit-topup-request
supabase functions deploy admin-approve-topup
supabase functions deploy request-payout
supabase functions deploy get-video-url
supabase functions deploy admin-manage-user   ← BARU
```

---

## Environment Variables yang Diperlukan

### Frontend (`.env`)
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Edge Functions (di Supabase Dashboard → Edge Functions → Secrets)
```
SUPABASE_URL           = <otomatis tersedia di runtime Supabase>
SUPABASE_SERVICE_ROLE_KEY = <otomatis tersedia di runtime Supabase>
GEMINI_API_KEY         = <dari Google AI Studio> (opsional; tanpa ini generate-quiz pakai fallback)
```

**Catatan:** `SUPABASE_SERVICE_ROLE_KEY` TIDAK BOLEH ada di `.env` frontend atau `VITE_*`.

---

## Checklist §11 — Status Final

| # | Pertanyaan | Status | Jawaban |
|---|-----------|--------|---------|
| 1 | Batas nonton gratis (paywall preview) | ✅ Selesai | Global di `app_settings.free_preview_seconds`, default 180 detik. Bisa diubah admin tanpa redeploy. |
| 2 | `process_purchase` baca split dari `app_settings`? | ✅ Diperbaiki | Migration 007 menggantikan hardcode 80/20 dengan baca dari `revenue_split_creator` |
| 3 | Mekanisme idempotency tiap RPC? | ✅ Selesai | `process_purchase`: unique index `uq_purchase_once`. `process_topup`: idempotency_key + cek status. `request_payout`: unique per request insert. `resolve_payout`: cek `status != 'pending'` |
| 4 | Reply saat parent dihapus? | ✅ Selesai | Parent tampil sebagai "[Komentar telah dihapus]"; reply tetap tampil. Parent deleted tanpa reply disembunyikan. |
| 5 | Video milik user suspended/deleted? | ✅ Diverifikasi | RLS `videos_select_approved` cek `is_active_user()` untuk viewer. Video tetap ada di DB tapi tidak muncul di Explore. |
| 6 | Kategori yang masih dipakai video, saat dihapus? | ✅ Selesai | Dicegah di UI dengan cek count video aktif; error toast jika masih dipakai. |
| 7 | Kolom `data_tujuan` di payout_requests | ✅ Diverifikasi | RLS `payout_req_select_own` dan `payout_req_select_admin` — hanya pemilik & admin bisa baca. |
| 8 | Provider AI untuk `generate-quiz`? | ✅ Diverifikasi | Google Gemini 2.0 Flash Exp via `GEMINI_API_KEY` di server-side saja. Fallback ke deskripsi video jika API tidak tersedia. |
| 9 | Status laporan "selesai" → otomatis ke video? | ✅ Keputusan | Murni administratif — tidak memicu perubahan status video. Admin perlu tindak video secara terpisah via `/admin/videos`. |

---

## Hal yang Perlu Diputuskan / Dikonfirmasi Sebelum Production

1. **Nominal top-up** — Saat ini UI masih hardcode [10, 25, 50, 100] koin sebagai pilihan nominal. Apakah ingin dibuat dinamis dari `app_settings`? Atau cukup opsi tetap ini?

2. **Bucket Storage** — Pastikan di Supabase Dashboard:
   - Bucket `videos` → **private** (bukan public)
   - Bucket `thumbnails` → public (sudah benar untuk thumbnail & bukti QRIS)

3. **Supabase Realtime** — Pastikan tabel `notifications` sudah diaktifkan untuk Realtime di Supabase Dashboard → Database → Replication.

4. **GEMINI_API_KEY** — Tambahkan di Supabase Edge Functions Secrets jika ingin fitur quiz AI aktif.

5. **Email verification** — Pastikan Supabase Auth → Email diaktifkan dengan `Confirm email` = enabled.
