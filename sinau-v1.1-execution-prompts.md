# Prompt Suite Amazon Q — Sinau Platform v1.1

Dokumen ini berisi **12 prompt bertahap (Fase 0–11)** untuk kamu jalankan berurutan di chat Amazon Q (VS Code), berdasarkan analisa penuh terhadap spek platform Sinau. Kondisi awal: codebase sudah berjalan tapi banyak bug, dan banyak fitur di spek belum diimplementasikan — jadi seluruh alur di bawah dirancang untuk **audit dulu, baru perbaiki & lengkapi**, bukan menulis ulang dari nol.

## Cara Pakai

1. Buka project di VS Code, pastikan extension Amazon Q aktif dan punya akses penuh ke workspace (`@workspace`).
2. Mulai **satu chat baru**, tempel blok **MASTER CONTEXT** di bawah sebagai pesan pertama. Tunggu Amazon Q konfirmasi paham sebelum lanjut.
3. Di chat **yang sama**, tempel prompt **FASE 0**, tunggu selesai, baca `AUDIT_REPORT.md` yang dihasilkan.
4. Lanjutkan FASE 1, 2, 3, dst **satu per satu, berurutan, di chat yang sama** — jangan lompat fase, karena fase-fase awal (DB, RLS, Auth) jadi fondasi fase berikutnya.
5. **Setelah setiap fase selesai:** review perubahan (`git diff`), test manual sesuai checklist yang diminta di akhir tiap prompt, lalu `git commit` dengan pesan jelas (misal `feat(fase-4): wallet & alur koin`) sebelum lanjut ke fase berikutnya. Ini penting supaya kalau ada fase yang bermasalah, kamu bisa rollback tanpa kehilangan fase sebelumnya.
6. Kalau context chat Amazon Q terasa "lupa" (percakapan terlalu panjang), buka chat baru, tempel ulang MASTER CONTEXT + kalimat singkat "Fase 0–N sudah selesai dan sudah di-commit, lanjutkan ke Fase N+1" sebelum tempel prompt fase berikutnya.
7. Kalau Amazon Q mulai keluar dari scope fase (misal mengerjakan fitur admin padahal masih di fase auth), tempel ulang bagian "Batasan" di prompt fase itu untuk mengingatkan.

Setiap prompt yang harus kamu **copy-paste literal ke Amazon Q** ada di dalam blok kode (```). Teks di luar blok kode adalah catatan untuk kamu sendiri.

---

## 📌 MASTER CONTEXT (tempel sekali di awal chat)

```
Kamu adalah senior full-stack engineer yang akan melanjutkan pengembangan platform bernama "Sinau" menuju versi 1.1. Ini BUKAN project baru — sudah ada codebase berjalan dengan sejumlah bug dan fitur yang belum lengkap. Tugasmu sepanjang sesi ini adalah AUDIT, MEMPERBAIKI, dan MELENGKAPI — bukan menulis ulang dari nol kecuali benar-benar diperlukan dan sudah saya konfirmasi secara eksplisit.

## Tentang Sinau
Sinau adalah platform berbagi video edukasi berbasis koin untuk mahasiswa. Kreator upload video kuliah, penonton membayar koin untuk akses penuh, kreator mendapat pendapatan (revenue share) dari tiap pembelian.

## Tech Stack (WAJIB dipertahankan, jangan ganti tanpa izin eksplisit dariku)
- Frontend: React 18 + Vite, React Router v6, Zustand (state management), Tailwind CSS
- Backend: Supabase — PostgreSQL, Auth, Storage, Edge Functions (Deno/TypeScript)
- Realtime: Supabase Realtime untuk notifikasi
- Toast: react-hot-toast

## Aturan Arsitektur Non-Negotiable
1. Semua tabel WAJIB dilindungi Row Level Security (RLS). Jangan pernah menonaktifkan RLS "untuk mempermudah debugging".
2. Operasi sensitif (transfer koin, approve top-up, proses payout, approve/reject video) HANYA boleh lewat Edge Function dengan service_role. Client tidak boleh update saldo/status secara langsung ke tabel manapun.
3. Semua operasi yang mengubah saldo koin WAJIB atomic (Postgres function/RPC dalam satu transaction) dan idempotent (request duplikat/ganda tidak boleh memproses dua kali).
4. Soft delete untuk video & user — jangan hard delete row yang berelasi dengan transaksi/quiz, supaya riwayat tidak rusak.
5. Konfigurasi bisnis (revenue split, rate koin→rupiah, minimum pencairan) disimpan di tabel `app_settings`, BUKAN hardcode di kode.
6. Jangan ubah/hapus fitur yang sudah berjalan baik hanya karena sedang mengerjakan fitur lain — audit dulu sebelum menyentuh file yang tidak relevan dengan fase saat ini.

## Cara Kerja Sepanjang Sesi Ini
- Pekerjaan ini dipecah dalam FASE. Kerjakan HANYA fase yang saya minta di pesan itu — kalau kamu menemukan bug di modul lain saat mengerjakan suatu fase, JANGAN diperbaiki dulu, cukup catat sebagai temuan di ringkasan akhir.
- Di setiap fase: (1) baca/scan dulu file-file relevan di codebase sebelum menulis kode apapun, (2) kalau kode yang ada sudah benar & sesuai spek, JANGAN diubah, (3) di akhir fase, berikan ringkasan: file yang dibuat/diubah, keputusan desain yang kamu ambil, dan risiko/TODO yang belum selesai.
- Bahasa UI aplikasi: Bahasa Indonesia. Nama variabel/fungsi/komentar kode: Bahasa Inggris (kecuali codebase yang ada sudah pakai konvensi lain — ikuti yang sudah ada).
- Untuk perubahan yang menyentuh logic keuangan (koin, saldo, payout, top-up), jelaskan dulu rencanamu secara singkat sebelum eksekusi perubahan besar.

Balas pesan ini dengan konfirmasi bahwa kamu paham konteks di atas dan siap menerima instruksi Fase 0. Jangan mulai menulis/mengubah kode apapun dulu.
```

---

## FASE 0 — Audit & Gap Analysis

**Tujuan:** Amazon Q membaca seluruh codebase dan membandingkannya dengan spek lengkap, menghasilkan laporan gap tanpa mengubah kode apapun. Ini fondasi supaya fase-fase selanjutnya presisi.

```
FASE 0 — AUDIT & GAP ANALYSIS (jangan tulis/ubah kode apapun di fase ini)

Lakukan audit menyeluruh terhadap codebase project ini, bandingkan dengan spesifikasi lengkap berikut. Untuk SETIAP item di spek, klasifikasikan menjadi salah satu:
- ✅ SUDAH ADA & BENAR — sesuai spek, tidak perlu disentuh
- 🐛 SUDAH ADA TAPI BUG/TIDAK SESUAI — jelaskan bug/gap spesifik (sebutkan file & fungsi/baris kalau bisa)
- ❌ BELUM ADA — fitur belum diimplementasikan sama sekali

=== SPESIFIKASI LENGKAP SINAU ===

GAMBARAN UMUM
Sinau adalah platform berbagi video edukasi berbasis koin untuk mahasiswa. Kreator upload video kuliah, penonton bayar koin untuk akses penuh, kreator dapat pendapatan dari tiap pembelian. Frontend React + Vite, backend Supabase (PostgreSQL + Auth + Storage + Edge Functions).

AUTENTIKASI & ROLE
- Login Mahasiswa (/login): register (nama, jurusan, email, password), verifikasi email wajib sebelum login, lupa password via email reset, redirect ke portal mahasiswa setelah login.
- Login Admin (/admin/login): halaman terpisah tidak ditautkan dari UI publik, tanpa opsi lupa password (reset manual via Supabase Dashboard), akun bukan admin ditolak dengan error, redirect ke portal admin setelah login.
- Role: mahasiswa (default saat register), admin (diset manual). User suspended/soft-deleted tidak bisa akses platform.

PORTAL MAHASISWA
- Explore (/): grid video approved, filter kategori, search judul, skeleton loading.
- Detail Video (/video/:id): player dengan paywall (gratis sampai batas tertentu lalu modal bayar koin); kreator video sendiri & admin akses penuh tanpa paywall; komentar threaded 1 level balasan, user hapus komentar sendiri, admin hapus komentar siapa pun; like/dislike + counter; tombol Ikuti/Berhenti Ikuti kreator; form laporan video (modal); quiz otomatis di-generate AI dari konten video.
- Profil Kreator (/creator/:id): foto, nama, jurusan, jumlah pengikut, tombol Ikuti/Berhenti Ikuti, grid video approved kreator.
- Wallet (/wallet): saldo koin; top-up QRIS (pilih nominal → tampil QRIS + total rupiah → upload bukti transfer → tunggu konfirmasi admin); riwayat top-up & status (pending/selesai/ditolak); pencairan koin (input jumlah + rekening/e-wallet → koin langsung dikunci → tunggu admin proses).
- Studio Kreator (/studio): dashboard pendapatan per video (views, penonton bayar, koin dihasilkan), urut dari paling menghasilkan, tombol cairkan koin (aktif jika saldo ≥ minimum).
- Upload Video (/upload): upload file video + thumbnail drag-and-drop, isi judul/deskripsi/kategori/harga koin, video masuk status pending menunggu review admin.
- Profil (/profil): edit nama/jurusan/avatar, ganti password.
- Riwayat (/riwayat): riwayat semua transaksi (top-up, pembelian, pendapatan).
- Notifikasi (bell icon navbar): badge unread count, dropdown notifikasi terbaru, trigger otomatis untuk: video approved/reject, komentar baru, balasan komentar, status top-up/payout diproses, video baru dari kreator yang diikuti.

PORTAL ADMIN (/admin)
- Dashboard: statistik total user, total video, transaksi, pendapatan platform.
- Antrian Review (/admin/review): tabel video pending (Thumbnail|Judul|Kreator|Kategori|Tgl Upload|Aksi), aksi Lihat Detail/Approve/Reject (dengan catatan alasan).
- Semua Video (/admin/videos): tabel semua video (termasuk approved/rejected/deleted), filter status/kategori/kreator + search + pagination, aksi Lihat Detail/Edit metadata/Approve/Reject/Soft Delete. Soft delete: row DB tetap ada, file storage bisa dihapus permanen terpisah.
- Manajemen User (/admin/users): tabel semua user (search + filter role + pagination), detail user (profil, jumlah video, saldo, riwayat transaksi), edit nama/jurusan, suspend/unsuspend, soft-delete, promote/demote admin (butuh konfirmasi dialog).
- Monitor Transaksi (/admin/transaksi) 3 tab: Log Otomatis (read-only semua transaksi), Permintaan Top-up (approve/reject bukti QRIS), Permintaan Pencairan (approve/reject payout).
- Laporan Video (/admin/laporan): daftar laporan user, update status (baru/diproses/selesai).
- Pengaturan (/admin/pengaturan) 4 tab: Umum (revenue split default 80/20, rate koin→rupiah default Rp500, minimum pencairan default 50, tersimpan di app_settings tanpa perlu deploy ulang), QRIS (upload/ganti gambar), Kategori (tambah/edit/hapus), Akun (ganti password admin).
- Admin Nonton Video: admin buka video mana pun full akses tanpa paywall; admin lihat tombol Hapus di semua komentar siapa pun.

ALUR KOIN & UANG
- Top-up QRIS: user pilih nominal → sistem tampil QRIS + total rupiah → user transfer manual di luar sistem → upload bukti → klik konfirmasi (saldo belum berubah, status pending) → admin verifikasi manual → approve → RPC process_topup tambah saldo. Kalau ditolak, admin isi alasan, saldo tidak berubah.
- Pembelian Video: RPC atomic process_purchase — kurangi saldo penonton, tambah saldo kreator (80% / sesuai app_settings), catat 2 transaksi (purchase + earning), update status view. Idempotent: double-request tidak charge dua kali.
- Pencairan (Payout): RPC atomic request_payout — kunci saldo koin langsung saat pengajuan; admin transfer manual di luar sistem → tandai selesai; kalau ditolak, RPC resolve_payout refund koin otomatis.

DATABASE (Supabase PostgreSQL) — 14 tabel:
profiles, videos, views, transactions, quiz_results, reports, topup_requests, payout_requests, comments, video_likes, follows, notifications, categories, app_settings.
Semua tabel dilindungi RLS. Operasi sensitif hanya via Edge Functions dengan service_role.

EDGE FUNCTIONS (Supabase) — 8 fungsi:
purchase-continue, submit-topup-request, admin-approve-topup, request-payout, admin-resolve-payout, get-video-url, generate-quiz, admin-moderate-video.

TECH STACK: React 18, Vite, React Router v6, Zustand, Tailwind CSS | Supabase (PostgreSQL, Auth, Storage, Edge Functions Deno/TypeScript) | Supabase Realtime | react-hot-toast.

=== AKHIR SPESIFIKASI ===

YANG HARUS KAMU HASILKAN:
1. Buat file `AUDIT_REPORT.md` di root project berisi hasil klasifikasi di atas, dikelompokkan per modul (Auth, Portal Mahasiswa, Wallet, Studio Kreator, Portal Admin, Alur Koin, Database, Edge Functions).
2. Untuk setiap temuan 🐛 atau ❌, beri tag prioritas: [KRITIKAL] (keamanan/keuangan/data integrity), [TINGGI] (fitur inti rusak/hilang), [SEDANG] (fitur pelengkap), [RENDAH] (polish/UX kecil).
3. Cek eksplisit hal-hal yang sering terlewat: rate limiting login/register, masa berlaku signed URL video, validasi ukuran/format file upload, audit log aksi admin, aturan pembulatan konversi koin↔rupiah, batas minimum/maksimum top-up, deteksi bukti transfer duplikat.
4. Jangan perbaiki apapun dulu di fase ini — cukup laporkan.

Setelah selesai, tampilkan isi `AUDIT_REPORT.md` di chat supaya saya review sebelum lanjut ke Fase 1.
```

**Setelah Amazon Q selesai:** baca `AUDIT_REPORT.md` baik-baik. Ini akan jadi acuanmu tiap kali prompt fase berikutnya bilang "berdasarkan AUDIT_REPORT.md".

---

## FASE 1 — Fondasi Database, RLS & Edge Functions

```
FASE 1 — FONDASI DATABASE, RLS, & EDGE FUNCTIONS

Prasyarat: Fase 0 selesai, AUDIT_REPORT.md sudah saya review.

Berdasarkan temuan di AUDIT_REPORT.md kategori Database & Edge Functions, kerjakan:

1. Pastikan 14 tabel berikut ada dengan skema benar & relasi foreign key tepat:
   profiles, videos, views, transactions, quiz_results, reports, topup_requests, payout_requests, comments, video_likes, follows, notifications, categories, app_settings
   - Kalau ada yang kurang, buat migration SQL BARU (jangan edit migration lama yang sudah pernah dijalankan).
   - profiles: nama, jurusan, saldo koin, role (mahasiswa/admin), status (active/suspended/soft-deleted)
   - videos: status moderasi (pending/approved/rejected), soft delete
   - views: riwayat tonton + status bayar per user per video
   - app_settings: minimal revenue_split_creator (default 80), revenue_split_platform (default 20), coin_to_rupiah_rate (default 500), min_payout_coin (default 50)

2. Audit & perbaiki RLS policy di semua tabel di atas:
   - User biasa hanya boleh baca/tulis data miliknya sendiri sesuai konteks fitur
   - Kolom saldo koin TIDAK BOLEH bisa diupdate langsung oleh client — hanya lewat service_role dari Edge Function
   - Admin punya akses baca lebih luas sesuai kebutuhan portal admin, tapi tetap lewat policy eksplisit (jangan bypass total)

3. Pastikan/lengkapi Postgres RPC berikut sebagai SECURITY DEFINER, atomic (satu transaction), dan idempotent:
   - process_topup — tambah saldo setelah admin approve top-up
   - process_purchase — kurangi saldo penonton, tambah saldo kreator (pakai revenue_split dari app_settings, BUKAN hardcode), catat transaksi purchase + earning, update status views
   - request_payout — kunci saldo koin saat kreator mengajukan pencairan
   - resolve_payout — approve: tandai selesai; reject: refund koin otomatis
   - Tambahkan guard supaya fungsi ini tidak bisa diproses dua kali untuk request yang sama (idempotency key / cek status sebelum proses / row locking)

4. Pastikan 8 Edge Function berikut ada, hanya bisa dipanggil dengan autentikasi sesuai (bukan endpoint publik terbuka):
   purchase-continue, submit-topup-request, admin-approve-topup, request-payout, admin-resolve-payout, get-video-url, generate-quiz, admin-moderate-video
   - get-video-url: signed URL masa berlaku singkat (5-15 menit), cek hak akses (sudah bayar/creator sendiri/admin) sebelum generate
   - admin-approve-topup, admin-resolve-payout, admin-moderate-video: cek role admin DI DALAM function (jangan hanya andalkan RLS)

5. Berikan ringkasan akhir: migration baru yang dibuat, RLS policy yang diubah/ditambah, RPC/Edge Function yang diperbaiki.

Jangan sentuh kode frontend (React) di fase ini.
```

---

## FASE 2 — Autentikasi & Role System

```
FASE 2 — AUTENTIKASI & ROLE SYSTEM

Prasyarat: Fase 1 selesai, migration sudah dijalankan.

Berdasarkan AUDIT_REPORT.md kategori Auth, kerjakan/perbaiki:

1. Login Mahasiswa (/login): register (nama, jurusan, email, password); wajib verifikasi email sebelum login (block + pesan jelas + tombol kirim ulang); lupa password via email reset (Supabase Auth); redirect ke "/" setelah login; role default "mahasiswa".

2. Login Admin (/admin/login): halaman terpisah, TIDAK ada link ke sini dari navbar/footer publik manapun; TIDAK ada opsi "Lupa Password"; akun non-admin ditolak dengan pesan error jelas (jangan redirect ke portal admin); redirect ke "/admin" setelah login sukses.

3. Route Guard: user suspended/soft-deleted tidak bisa login (atau auto-logout + pesan kalau sedang login); halaman mahasiswa protected (redirect /login kalau belum login); halaman admin protected dengan cek role==='admin' (redirect /admin/login kalau bukan).

4. Hardening dasar (tambahkan kalau belum ada): rate limit percobaan login gagal (misal maksimal 5x/15 menit per email atau IP) untuk /login dan /admin/login; validasi input register (format email, kekuatan password minimum).

5. Berikan ringkasan file yang diubah/dibuat + checklist manual testing (contoh: register → cek email verifikasi → coba login sebelum verifikasi → dst).
```

---

## FASE 3 — Portal Mahasiswa: Explore & Video Detail

```
FASE 3 — PORTAL MAHASISWA: EXPLORE & VIDEO DETAIL

Prasyarat: Fase 2 selesai.

Explore (/):
- Grid video status approved saja
- Filter per kategori (dari tabel categories)
- Search judul video
- Skeleton loading saat fetch (bukan blank/spinner polos)

Detail Video (/video/:id):
- Player dengan paywall: gratis sampai batas tertentu (tentukan nilai wajar, misal detik/persentase durasi, buat konfigurabel via app_settings kalau belum ada), lalu modal bayar koin
- PENGECUALIAN paywall: kreator video sendiri & admin akses penuh — validasi ini di server-side lewat get-video-url, jangan hanya di frontend
- Komentar threaded maksimal 1 level balasan
- User hapus komentar sendiri; admin lihat tombol Hapus di semua komentar
- Like/dislike + counter (1 user = 1 reaksi per video, update kalau ganti pilihan, bukan tambah row baru)
- Tombol Ikuti/Berhenti Ikuti kreator video
- Form laporan video dalam modal dialog (submit ke tabel reports)
- Section quiz: buat placeholder UI dulu ("Quiz belum tersedia" / skeleton) — logic generate-nya dikerjakan di Fase 9

Profil Kreator (/creator/:id):
- Foto, nama, jurusan, jumlah pengikut
- Tombol Ikuti/Berhenti Ikuti
- Grid semua video approved milik kreator

Berikan ringkasan file yang dibuat/diubah + checklist manual testing.
```

---

## FASE 4 — Wallet & Alur Koin

```
FASE 4 — WALLET & ALUR KOIN

Prasyarat: Fase 1 (RPC/Edge Function keuangan) & Fase 2 (auth) selesai.

Wallet (/wallet):
- Tampilkan saldo koin saat ini (refetch setelah tiap transaksi)
- Top-up QRIS: (1) user pilih nominal — sediakan preset + opsi custom dengan batas min/maks dari app_settings; (2) tampilkan gambar QRIS (dari admin settings) + total rupiah; (3) user upload bukti transfer ke Storage; (4) klik konfirmasi → panggil submit-topup-request → simpan ke topup_requests status pending (saldo BELUM berubah)
- Riwayat top-up: status pending/selesai/ditolak + alasan kalau ditolak
- Pencairan koin: input jumlah + data rekening/e-wallet; validasi jumlah ≤ saldo dan ≥ min_payout_coin; panggil request-payout → RPC request_payout mengunci saldo langsung

Riwayat (/riwayat):
- Gabungan riwayat top-up, pembelian video, pendapatan (dari transactions + status topup_requests/payout_requests)

Keputusan yang perlu kamu buat & dokumentasikan di ringkasan akhir:
- Aturan pembulatan konversi koin↔rupiah
- Preset nominal top-up yang wajar untuk mahasiswa Indonesia

Berikan ringkasan + checklist manual testing (termasuk test: klik konfirmasi top-up 2x berturut-turut tidak boleh dobel proses).
```

---

## FASE 5 — Studio Kreator & Upload Video

```
FASE 5 — STUDIO KREATOR & UPLOAD VIDEO

Studio Kreator (/studio):
- Dashboard pendapatan: tabel per video (views, penonton bayar, total koin dihasilkan)
- Bisa diurutkan dari video paling menghasilkan
- Tombol "Cairkan Koin" aktif hanya jika saldo ≥ min_payout_coin (app_settings); disabled + tooltip penjelasan kalau belum memenuhi syarat

Upload Video (/upload):
- Upload video + thumbnail via drag-and-drop
- Validasi client DAN server: ukuran maksimum file, format yang didukung (tentukan daftar wajar, dokumentasikan pilihanmu)
- Form: judul, deskripsi, kategori (dropdown dari categories), harga koin
- Setelah submit → status pending, tampilkan pesan "menunggu review admin"
- Tampilkan progress upload (persentase)

Berikan ringkasan file yang dibuat/diubah + batasan ukuran/format yang kamu tetapkan + checklist manual testing.
```

---

## FASE 6 — Profil & Notifikasi Realtime

```
FASE 6 — PROFIL & NOTIFIKASI REALTIME

Profil (/profil):
- Edit nama, jurusan, avatar (upload ke Storage)
- Ganti password (Supabase Auth update password)

Notifikasi (ikon lonceng navbar):
- Badge jumlah notifikasi belum dibaca
- Dropdown notifikasi terbaru (klik → tandai dibaca & redirect ke halaman terkait)
- Trigger otomatis (bagian dari Edge Function/RPC terkait, bukan cron terpisah) untuk: video approved/reject → notif kreator; komentar baru di video kreator → notif kreator; balasan komentar → notif pemilik komentar awal; status top-up/payout diproses → notif user terkait; video baru approved dari kreator yang diikuti → notif follower
- Integrasikan Supabase Realtime supaya notifikasi baru muncul tanpa refresh
- Gunakan react-hot-toast untuk toast singkat saat notifikasi baru masuk ketika user aktif

Berikan ringkasan + checklist manual testing per jenis trigger notifikasi.
```

---

## FASE 7 — Portal Admin: Dashboard, Review, Video & User Management

```
FASE 7 — PORTAL ADMIN: DASHBOARD, REVIEW, VIDEO & USER MANAGEMENT

Dashboard Admin (/admin):
- Statistik ringkas: total user, total video, total transaksi, total pendapatan platform

Antrian Review (/admin/review):
- Tabel video pending: Thumbnail | Judul | Kreator | Kategori | Tgl Upload | Aksi
- Aksi: Lihat Detail, Approve, Reject (wajib isi catatan alasan, terkirim ke kreator via notifikasi)

Semua Video (/admin/videos):
- Tabel semua video (approved/rejected/soft-deleted), filter status/kategori/kreator, search judul, pagination
- Aksi: Lihat Detail, Edit metadata, Approve/Reject, Soft Delete
- Soft delete: row DB tetap ada (riwayat transaksi/quiz tidak rusak); hapus file storage permanen adalah aksi TERPISAH, jangan digabung otomatis

Manajemen User (/admin/users):
- Tabel semua user: search + filter role + pagination
- Detail user: profil, jumlah video, saldo, riwayat transaksi
- Edit nama/jurusan, suspend/unsuspend, soft-delete
- Promote/demote admin: WAJIB dialog konfirmasi tambahan (misal ketik ulang email target), dan catat ke tabel admin_audit_log baru (kolom minimal: admin_id, aksi, target, waktu) kalau belum ada

Berikan ringkasan file yang dibuat/diubah + checklist manual testing.
```

---

## FASE 8 — Portal Admin: Monitor Transaksi, Laporan, Pengaturan

```
FASE 8 — PORTAL ADMIN: MONITOR TRANSAKSI, LAPORAN, PENGATURAN

Monitor Transaksi (/admin/transaksi) — 3 tab:
- Log Otomatis: semua transaksi (top-up, pembelian, pendapatan), read-only, filter tanggal/jenis
- Permintaan Top-up: daftar topup_requests pending, admin lihat bukti transfer, approve (admin-approve-topup) atau reject (isi alasan)
- Permintaan Pencairan: daftar payout_requests pending, approve/reject (admin-resolve-payout); reject WAJIB trigger refund koin otomatis via resolve_payout

Laporan Video (/admin/laporan):
- Daftar laporan dari tabel reports, admin update status: baru/diproses/selesai

Pengaturan (/admin/pengaturan) — 4 tab:
- Umum: revenue split (default 80/20), rate koin→rupiah (default Rp500), minimum pencairan (default 50) — baca/tulis app_settings, berlaku tanpa deploy ulang
- QRIS: upload/ganti gambar QRIS (ke Storage, update referensi di app_settings)
- Kategori: tambah/edit/hapus kategori (tabel categories)
- Akun: ganti password admin

Admin Nonton Video (pastikan konsisten dengan Fase 1 & 3):
- Admin buka video mana pun, akses penuh tanpa paywall
- Admin lihat tombol Hapus di semua komentar siapa pun

Berikan ringkasan + checklist manual testing (termasuk test reject payout → pastikan koin benar-benar kembali ke saldo kreator).
```

---

## FASE 9 — Quiz Otomatis AI (Google Gemini)

```
FASE 9 — QUIZ OTOMATIS AI (GOOGLE GEMINI)

Prasyarat: Fase 3 (UI placeholder quiz) & Fase 1 (scaffold generate-quiz) sudah ada.

1. Implementasikan Edge Function generate-quiz menggunakan Google Gemini API (pakai env var GEMINI_API_KEY, jangan hardcode key):
   - Input untuk generate soal: judul, deskripsi, kategori video, dan transkrip video KALAU memang ada fiturnya di sistem (cek dulu dari AUDIT_REPORT.md apakah ada transkripsi; kalau tidak ada, gunakan metadata yang tersedia dan dokumentasikan keterbatasan ini secara eksplisit di ringkasan akhir)
   - Generate 5 soal pilihan ganda (buat konfigurabel jumlahnya), 4 opsi jawaban + 1 kunci jawaban + penjelasan singkat kenapa jawaban itu benar
   - Simpan ke quiz_results terkait video tsb — generate SEKALI per video dan cache hasilnya, jangan panggil Gemini API berulang tiap user buka video yang sama
   - Tangani error Gemini API secara graceful (gagal generate → tampilkan "Quiz belum tersedia", bukan error mentah ke user)

2. Update UI Video Detail (/video/:id): quiz interaktif (pilih jawaban → submit → tampilkan skor & pembahasan), simpan hasil pengerjaan user ke quiz_results

3. Trigger generate-quiz otomatis setelah video di-approve admin (bukan saat upload, supaya tidak buang resource untuk video yang mungkin di-reject)

Berikan ringkasan + contoh output quiz dari 1 video test + checklist manual testing.
```

---

## FASE 10 — Hardening: Keamanan, Idempotency, Edge Cases

```
FASE 10 — HARDENING: KEAMANAN, IDEMPOTENCY, EDGE CASES

Fase cross-cutting untuk menutup semua temuan [KRITIKAL] dan [TINGGI] yang masih tersisa di AUDIT_REPORT.md, ditambah item wajib berikut:

1. Idempotency test: pastikan process_purchase, process_topup, request_payout, resolve_payout tidak bisa dieksekusi dobel walau ter-trigger 2x bersamaan (race condition) — tambahkan unique constraint / row locking (SELECT ... FOR UPDATE) kalau belum ada.
2. get-video-url: pastikan masa berlaku signed URL pendek & hak akses tervalidasi tiap kali di-generate ulang.
3. Rate limiting: login, register, submit laporan, request payout (cegah spam pengajuan).
4. Validasi upload file (video, thumbnail, bukti transfer, avatar): batas ukuran, tipe MIME diizinkan, cegah path traversal dari nama file.
5. RLS re-check menyeluruh: coba akses tiap tabel sensitif langsung dari client (bukan lewat Edge Function), pastikan ditolak.
6. XSS/CSRF dasar: sanitize input komentar & deskripsi video sebelum ditampilkan.
7. Pastikan admin_audit_log mencatat SEMUA aksi sensitif admin (approve/reject video, approve/reject top-up/payout, suspend/soft-delete user, promote/demote admin, ubah pengaturan).

Berikan laporan hasil hardening: apa yang diperbaiki, dan apa yang masih jadi known limitation (kalau ada yang di luar scope saat ini).
```

---

## FASE 11 — QA, Polish, Responsive & Kesiapan Rilis v1.1

```
FASE 11 — QA, POLISH, RESPONSIVE & KESIAPAN RILIS v1.1

1. Responsive check: semua halaman (mahasiswa & admin) harus enak dipakai di mobile, tablet, desktop — perbaiki layout yang patah.
2. Loading & empty states: semua halaman list/tabel punya skeleton loading, empty state jelas ("Belum ada video"), error state jelas ("Gagal memuat data, coba lagi") — bukan blank putih atau crash.
3. Konsistensi UI: cek warna, spacing, komponen tombol/modal konsisten di seluruh aplikasi (pakai Tailwind config yang sama).
4. Performance: pagination/infinite scroll di semua tabel/list besar (jangan fetch semua sekaligus), lazy load thumbnail/gambar.
5. Update README.md: dokumentasikan environment variables yang dibutuhkan (termasuk GEMINI_API_KEY), cara setup Supabase project, cara menjalankan migration, daftar fitur v1.1.
6. Bump versi project ke 1.1.0 (package.json / file versioning relevan) dan buat CHANGELOG.md ringkas berdasarkan seluruh fase yang sudah dikerjakan.

Berikan checklist akhir untuk User Acceptance Testing (UAT) manual sebelum deploy ke production.
```

---

## Catatan Tambahan

- **Kenapa dipecah 12 fase, bukan 1 prompt raksasa?** Amazon Q (seperti AI coding agent lain) menurun akurasinya kalau diminta mengerjakan terlalu banyak modul sekaligus dalam satu respons — hasilnya sering setengah jadi atau saling menimpa. Fase kecil + commit per fase = lebih mudah di-review dan di-rollback.
- **Fase 0 dan Fase 1 adalah fondasi paling kritis** — kalau audit atau RLS/RPC di sini salah, semua fase finansial di atasnya (Fase 4, 8) ikut berisiko. Jangan buru-buru di dua fase ini.
- Setelah Fase 11 selesai, project ini siap disebut **v1.1** — tapi tetap lakukan UAT manual sebelum deploy ke production, terutama untuk seluruh alur uang (top-up, pembelian, payout).