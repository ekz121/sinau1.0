# Changelog — Sinau Platform

## v1.1.0 (2026-08-24)

### Security & Data Integrity
- **[BREAKING FIX]** `process_purchase` sekarang baca `revenue_split_creator` dari `app_settings` saat runtime — tidak lagi hardcode 80/20
- **[BREAKING FIX]** `request_payout` dan `process_topup` baca `min_payout_koin` & `koin_to_rupiah_rate` dari `app_settings` — tidak lagi hardcode
- **[FIX]** `get-video-url` kini validasi `has_paid_to_continue` di server sebelum generate signed URL — user yang belum bayar tidak bisa dapat URL penuh
- **[FIX]** User suspend/soft-delete via edge function `admin-manage-user` (service_role) — sebelumnya bisa diubah langsung dari client
- **[FIX]** Login langsung ditolak dengan pesan jelas jika akun suspended/deleted — sebelumnya redirect diam-diam
- **[NEW]** `admin_audit_log` table: semua aksi sensitif admin dicatat (approve/reject video, topup, payout, suspend, promote, update settings)
- **[NEW]** `process_topup` mendukung `idempotency_key` untuk proteksi double-approve
- **[NEW]** Guard satu payout pending per kreator (`uq_payout_one_pending_per_creator`)

### Features
- **[NEW]** Notifikasi realtime via Supabase Realtime (bukan polling 30 detik)
- **[NEW]** Notifikasi ke followers saat kreator punya video baru diapprove (trigger DB)
- **[NEW]** Admin: promote/demote admin, soft-delete user via modal konfirmasi
- **[NEW]** Kategori dinamis di seluruh UI — tidak lagi hardcode, baca dari tabel `categories`
- **[NEW]** Semua nilai konfigurasi (paywall time, koin rate, revenue split) tersebar di seluruh UI via `useAppSettings` hook
- **[NEW]** Tombol "Cairkan Koin" di Studio Kreator — aktif hanya jika saldo ≥ `min_payout_koin`, langsung navigasi ke tab payout
- **[NEW]** Quiz AI (Gemini): cache di level video (bukan per-user) — semua user pakai kuis yang sama, tidak regenerate per orang
- **[NEW]** Quiz AI menampilkan `explanation` untuk tiap soal setelah submit
- **[NEW]** Trigger antrian `quiz_generation_queue` otomatis saat video di-approve admin
- **[NEW]** Guard hapus kategori yang masih dipakai video (cek count video aktif)
- **[NEW]** Settings cache diinvalidate setelah admin simpan pengaturan

### Bug Fixes
- **[FIX]** `walletStore.topup` (memanggil `topup-coin` legacy) diganti dengan `submitTopupRequest`
- **[FIX]** Parent comment yang dihapus tapi punya reply kini tampil sebagai "[Komentar telah dihapus]"
- **[FIX]** Cek paid di VideoDetail pakai `views.has_paid_to_continue` (konsisten dengan RPC), bukan query `transactions`
- **[FIX]** `AdminDashboard` dan `TransactionMonitor` baca revenue split dari `app_settings`
- **[FIX]** `NotificationBell` guard untuk React Strict Mode double-mount — tidak crash lagi
- **[FIX]** `PaywallModal` tampilkan nilai rate & split dari `app_settings` (bukan teks hardcode)
- **[FIX]** Upload video: harga koin dihitung dari `koin_to_rupiah_rate` di `app_settings`

### Database Migrations
| File | Isi |
|------|-----|
| `007_v1_1_foundation.sql` | Trigger notif followers, process_purchase/request_payout/process_topup baca app_settings, idempotency key topup, RLS views admin, free_preview_seconds |
| `008_v1_1_hardening.sql` | admin_audit_log, quiz_results columns, resolve_payout idempotency, quiz_generation_queue, unique indexes |

---

## v1.0.0 (baseline)
- Platform Sinau versi pertama: auth mahasiswa/admin, explore video, detail video dengan paywall, wallet QRIS, studio kreator, upload video, portal admin (review, semua video, manajemen user, transaksi, laporan, pengaturan)
