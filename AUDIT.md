# Audit Menyeluruh Sinau v1.1

Dokumen ini adalah peta kerja dan catatan verifikasi untuk audit fungsional, keamanan, UI, database, dan Edge Functions. Status akan diperbarui sampai pemeriksaan akhir.

## Lingkungan yang diaudit

- Frontend: React 19, Vite 8, React Router 7, Zustand 5, Tailwind CSS 4.
- Backend: Supabase Auth, PostgreSQL/RLS, Storage, Realtime, dan Edge Functions.
- Konfigurasi lokal berhasil memasang dependensi, lint berjalan tanpa error, build produksi berhasil, dan halaman autentikasi dapat dirender melalui browser headless pada desktop/mobile.
- Endpoint Supabase pada `.env` lokal tidak dapat di-resolve (NXDOMAIN). Verifikasi backend langsung harus dilakukan setelah URL dan anon key proyek Supabase aktif dipasang.

## Peta halaman dan menu

| Area | Route | Fungsi utama | Status audit awal |
|---|---|---|---|
| Auth | `/login` | Login mahasiswa | Form submit diperbaiki; verifikasi backend tertunda |
| Auth | `/register` | Registrasi + profil | Form submit diperbaiki; verifikasi email perlu backend |
| Auth | `/lupa-password` | Kirim reset password | Form submit diperbaiki |
| Auth | `/auth/reset-password` | Ganti password | Form submit diperbaiki |
| Auth | `/auth/verified` | Status verifikasi | Perlu uji callback backend |
| Admin Auth | `/admin/login` | Login khusus admin | Form submit diperbaiki; guard role tersedia |
| Mahasiswa | `/` | Eksplorasi video | Perlu hardening profil publik/RLS |
| Mahasiswa | `/video/:id` | Player, paywall, ringkasan, kuis, komentar | Perlu perbaikan saldo, URL pascabayar, dan laporan komentar |
| Mahasiswa | `/creator/:id` | Profil kreator | Perlu view profil publik yang aman |
| Mahasiswa | `/wallet` | Saldo, top-up, payout, riwayat | Perlu transaksi atomik, bukti privat, input nominal, Realtime |
| Mahasiswa | `/upload` | Upload video dan thumbnail | Harga harus selalu 1 koin; storage perlu diperketat |
| Mahasiswa | `/studio` | Dashboard kreator | Perlu audit CRUD dan statistik |
| Mahasiswa | `/profil` | Edit profil/avatar | Path avatar perlu dipisahkan per pengguna |
| Mahasiswa | `/riwayat` | Riwayat tontonan/transaksi | Perlu validasi query dan format status |
| Admin | `/admin` | Ringkasan platform | Pendapatan historis dan koin beredar perlu sumber data benar |
| Admin | `/admin/review` | Moderasi video | Mutasi harus hanya lewat Edge Function |
| Admin | `/admin/videos` | CRUD video | Mutasi dan penghapusan storage harus hanya lewat Edge Function |
| Admin | `/admin/users` | Kelola pengguna | Perlu audit detail riwayat dan seluruh aksi |
| Admin | `/admin/transaksi` | Top-up dan payout | Fallback mutasi langsung harus dihapus |
| Admin | `/admin/laporan` | Laporan konten | Perlu dukungan laporan komentar dan resolusi via Edge Function |
| Admin | `/admin/pengaturan` | Koin, revenue, QRIS, kategori | Mutasi perlu Edge Function + audit log; kategori perlu edit |

## Peta database

| Objek | Kegunaan | Temuan awal |
|---|---|---|
| `profiles` | Profil, role, tiga jenis saldo, suspend/delete | Saldo kreator perlu pecahan untuk pembagian 0,80 koin |
| `videos` | Metadata, moderasi, file, ringkasan | Owner masih berpotensi mengubah kolom sensitif |
| `views` | Riwayat/progres tonton | Perlu cek pengguna suspend dan deduplikasi |
| `transactions` | Top-up, pembelian, earning | Constraint belum memuat semua tipe; belum ada status dan bagian platform |
| `quiz_results` | Nilai kuis | Perlu validasi akses pemilik |
| `reports` | Laporan video | Belum mendukung target komentar |
| `app_settings` | Harga, kurs, QRIS, revenue | Update admin belum melalui jalur server tepercaya |
| `topup_requests` | Permintaan top-up | Approval belum satu transaksi database atomik |
| `payout_requests` | Penarikan kreator | Perlu idempotensi dan transaksi pending/hasil |
| `comments` | Komentar dan balasan | Parent terhapus perlu tetap tampil sebagai placeholder |
| `video_likes` | Like video | Perlu konsistensi pemeriksaan akun aktif |
| `follows` | Follow kreator | Perlu konsistensi pemeriksaan akun aktif |
| `notifications` | Notifikasi mahasiswa/admin | Event admin belum lengkap dan beberapa event berpotensi ganda |
| `categories` | Kategori video | CRUD admin tersedia sebagian; edit UI belum ada |
| `admin_audit_log` | Jejak aksi admin | Beberapa frontend mencoba insert langsung yang ditolak RLS |
| `quiz_generation_queue` | Antrean kuis AI | Perlu verifikasi worker/trigger setelah moderasi |

## Peta Edge Functions

| Function | Fungsi | Temuan awal |
|---|---|---|
| `purchase-continue` | Pembelian akses lanjutan | RPC masih dapat memakai koin kreator; wajib hanya koin top-up |
| `submit-topup-request` | Membuat request top-up | Fallback insert langsung di frontend harus dihapus |
| `admin-approve-topup` | Setujui/tolak top-up | Approval dan kredit belum atomik; idempotensi salah referensi |
| `request-payout` | Membuat payout | Perlu idempotency key dan transaksi pending |
| `admin-resolve-payout` | Setujui/tolak payout | Refund/type constraint perlu diperbaiki |
| `get-video-url` | Signed URL video | Frontend memiliki fallback yang dapat melewati paywall |
| `generate-quiz` | Generasi kuis | Model AI perlu konfigurasi env dan error handling konsisten |
| `generate-summary` | Generasi ringkasan | Model AI perlu konfigurasi env dan error handling konsisten |
| `admin-moderate-video` | Approve/reject video | Perlu diperluas untuk CRUD aman dan menghindari notifikasi ganda |
| `admin-manage-user` | Suspend/restore/delete user | Perlu verifikasi seluruh aksi dan audit log |
| `topup-coin` | Jalur top-up lama | Kandidat legacy; tidak boleh menjadi jalur mutasi klien |

## Risiko prioritas tinggi

1. Pembelian dapat memakai saldo koin kreator, padahal hanya koin top-up yang sah untuk belanja.
2. Pembagian harga 1 koin menjadi 80% kreator tidak dapat direpresentasikan kolom integer; hasil kreator dapat menjadi 0.
3. Approval top-up dan status request tidak atomik, sehingga retry/race berisiko kredit ganda.
4. Fallback frontend melakukan mutasi finansial/database langsung saat Edge Function gagal.
5. Signed URL video memiliki fallback langsung dari klien yang melemahkan paywall.
6. Bukti transfer disimpan di bucket thumbnail publik.
7. Policy storage terlalu luas untuk pengguna terautentikasi.
8. Owner video perlu dicegah mengubah status moderasi atau soft-delete lewat API langsung.
9. Kredensial sensitif pernah tertulis di dokumentasi dan masih mungkin ada di riwayat Git; seluruh secret terkait wajib dirotasi.

## Urutan perbaikan

- [x] Baseline: dependensi, lint, build, render auth, dan kebersihan secret saat ini.
- [x] Form autentikasi semantik dan submit keyboard.
- [x] Migrasi database hardening transaksi, RLS, storage, profil publik, report, dan notifikasi.
- [x] Edge Functions finansial dibuat atomik/idempoten dan menjadi satu-satunya jalur mutasi.
- [x] Player/paywall mengambil ulang akses penuh setelah pembayaran.
- [x] Upload selalu berharga 1 koin dan validasi file/thumbnail diperketat.
- [x] Wallet mendukung nominal, bukti privat, status, dan Realtime.
- [x] Admin dashboard, transaksi, video, user, laporan, pengaturan, dan kategori diaudit pada level kode.
- [x] Redesign responsif dan konsistensi komponen visual.
- [x] Audit klik/form/menu serta build/lint/browser smoke test akhir.
- [x] Uji backend end-to-end pada project Supabase aktif.

## Hasil perbaikan akhir

| Area | Kondisi akhir |
|---|---|
| Koin dan transaksi | Pembelian hanya memakai koin top-up; earning kreator mendukung pecahan; split dicatat eksplisit; top-up/payout atomik dan idempoten. |
| Jalur finansial | Fallback mutasi langsung di frontend dihapus. Endpoint topup-coin legacy mengembalikan HTTP 410 dan tidak lagi dapat mengkredit saldo. |
| Video dan paywall | Preview 60 detik, pembayaran 1 koin, signed URL penuh diminta ulang setelah berhasil, posisi playback dipertahankan. |
| AI | Ringkasan/kuis memakai model dari secret server, mempunyai fallback, cache diperbaiki, dan aksesnya mengikuti hak akses penuh video. |
| Storage | Video dan bukti pembayaran privat; thumbnail publik; ukuran, MIME, dan folder pemilik dibatasi. Bukti yang sudah direferensikan request tidak dapat dihapus pengguna. |
| Privasi | Data kreator publik memakai view terbatas; saldo, role, status suspend/delete, dan data rekening tidak ikut terekspos. |
| Admin | Statistik memakai data riil; moderasi/CRUD video, transaksi, user, laporan komentar, setting, kategori, audit log, dan notifikasi dilengkapi. |
| UI/UX | Design token, warna aksen, focus state, reduced-motion, kartu video, hero Explore/Wallet, skeleton, lazy route, serta navigasi admin mobile ditingkatkan. |
| Verifikasi | npm run lint exit 0, npm run build exit 0, git diff --check exit 0, smoke test browser lulus, dan supabase db push --dry-run --linked lulus. |

Lint masih melaporkan advisory React terkait pola effect/dependency pada kode lama, tetapi tidak ada error lint atau build. Initial JavaScript juga telah dipecah per route; warning ukuran bundle tersisa pada vendor utama dan tidak menghambat build.

## Riwayat batas verifikasi sebelum koneksi project baru

Migration dan Edge Functions belum diterapkan ke backend oleh audit ini. Dry-run mengonfirmasi migration 001 sampai 011 terdeteksi untuk project tertaut, tetapi pengujian login, transaksi uang nyata, Realtime, Storage, dan Gemini end-to-end baru sah setelah migration, function, secret, serta kredensial frontend diterapkan ke project Supabase aktif.

Inspeksi read-only remote menemukan 16 tabel publik dan kolom yang setara sampai migration 008, sedangkan riwayat migration remote kosong. Karena itu project tertaut harus membaseline 001–008 dengan `supabase migration repair`; setelah itu dry-run harus menyisakan 009–011 sebelum push aktual. Instruksi lengkap ada di `SETUP.md`.

## Batasan arsitektur yang harus dipahami

Signed URL MP4 tidak dapat menegakkan batas preview tepat per detik setelah URL sudah diterima browser. Implementasi saat ini dapat membatasi melalui player dan TTL URL; proteksi anti-bypass yang kuat membutuhkan HLS tersegmentasi/tokenized delivery. Audit akhir akan tetap memastikan klien tidak mempunyai fallback akses langsung dan hanya meminta URL melalui Edge Function.

## Verifikasi backend terbaru

Pada 21 September 2026, project aktif dipindahkan ke
`xrgkkzfzcokwixtvetfp`. Migration `001` sampai `015` dan seluruh Edge
Function telah diterapkan. Smoke test sementara memverifikasi pembuatan akun,
trigger profil, RLS mahasiswa, upload kreator, video pending, approval admin,
preview penonton, pembelian satu koin, pembagian 0,8 koin kreator, idempotensi
pembelian, signed URL penuh, dan cleanup data uji.

Smoke test menemukan dan memperbaiki policy profil rekursif yang menyebabkan
HTTP 500, guard lama yang tidak mengenali claim service role modern, serta
constraint audit admin yang tidak konsisten dengan `ON DELETE SET NULL`.
