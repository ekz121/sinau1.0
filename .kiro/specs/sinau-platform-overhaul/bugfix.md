# Bugfix Requirements Document — Sinau Platform Overhaul

## Introduction

Dokumen ini mendefinisikan seluruh perbaikan bug dan persyaratan fitur baru untuk platform edukasi video **Sinau** (React 19 + Supabase). Cakupan mencakup 16 bug yang telah diidentifikasi — mulai dari kegagalan sistemik Edge Function, ketidakkonsistenan data, hingga masalah UI/UX — serta 12 fitur baru yang memperluas kapabilitas platform bagi user, kreator, dan admin.

Stack yang relevan: React 19, Vite, Tailwind CSS 4, Zustand, React Router DOM 7, Supabase (Auth, PostgreSQL, Storage, Edge Functions Deno), dengan Edge Functions: `admin-approve-topup`, `admin-manage-user`, `admin-moderate-video`, `admin-resolve-payout`, `generate-quiz`, `get-video-url`, `purchase-continue`, `request-payout`, `submit-topup-request`, `topup-coin`.

---

## Bug Analysis

---

### GRUP A — Bug Kritikal: Edge Function Tidak Bisa Diakses

Hampir semua aksi submit di aplikasi gagal dengan pesan `"Failed to send a request to the Edge Function"`. Ini adalah root cause sistemik yang menyebabkan bug B1, B2, B3, B5 di bawah. Penyebab meliputi: fungsi belum di-deploy, URL salah dikonfigurasi di env, atau CORS header tidak dikembalikan dengan benar pada semua response path.

---

### Current Behavior (Defect)

**B1 — Top Up Koin Gagal di Sisi User**

1.1 WHEN user mengajukan permintaan top up koin dan admin menyetujuinya THEN sistem gagal menambahkan saldo koin ke akun user (saldo tetap 0)

1.2 WHEN edge function `admin-approve-topup` atau `topup-coin` dipanggil THEN sistem mengembalikan error `"Failed to send a request to the Edge Function"` sehingga RPC `process_topup` tidak pernah dieksekusi

1.3 WHEN user membuka halaman Wallet → tab Riwayat setelah top up diproses admin THEN sistem menampilkan "Belum ada transaksi" meskipun admin telah menyetujui 3 atau lebih permintaan dari user yang sama

**B2 — Video Tidak Bisa Diputar**

1.4 WHEN user membuka halaman detail video dan VideoPlayer mencoba memanggil edge function `get-video-url` THEN sistem mengembalikan error `"Gagal memuat video – Failed to send a request to the Edge Function"` sehingga video tidak dapat diputar sama sekali

1.5 WHEN edge function `get-video-url` dipanggil untuk video berapapun statusnya THEN sistem gagal menghasilkan signed URL dari Supabase Storage bucket `videos`

**B3 — Review Video Admin: Error tapi Status Tetap Berubah**

1.6 WHEN admin mengklik tombol Setujui atau Tolak di halaman Video Review THEN sistem menampilkan error edge function di UI admin namun status video di database tetap berubah (inkonsistensi: DB ter-update tapi response gagal)

1.7 WHEN admin mengklik tombol Review untuk melihat preview video di modal antrian review THEN sistem menampilkan "Preview tidak tersedia" karena edge function `get-video-url` gagal dipanggil

**B4 — Upload QRIS Image Gagal**

1.8 WHEN admin mencoba mengupload gambar QRIS di halaman Pengaturan THEN sistem mengembalikan error `"Gagal upload: Bucket not found"` karena storage bucket untuk QRIS belum dibuat atau tidak terkonfigurasi di Supabase

**B5 — Upload Foto Profil Gagal**

1.9 WHEN user mengklik tombol kamera di halaman Profil dan memilih file gambar THEN sistem gagal mengupload foto tanpa pesan error yang jelas (tombol tidak merespons atau upload diam-diam gagal)

1.10 WHEN `supabase.storage.from('thumbnails').upload(path, file)` dipanggil untuk path `avatars/{userId}.{ext}` THEN sistem mengembalikan error sehingga `avatar_url` tidak pernah diperbarui di tabel `profiles`

---

### GRUP B — Bug UI/UX

**B6 — Panel Notifikasi Terpotong**

1.11 WHEN user mengklik ikon bell notifikasi di navbar THEN dropdown panel notifikasi muncul terpotong atau tidak sepenuhnya terlihat, terutama di viewport kecil atau saat posisi navbar di kanan layar

**B7 — Video di Studio Kreator Tidak Bisa Diklik**

1.12 WHEN kreator membuka halaman Studio (`/studio`) dan melihat tabel "Video Saya" THEN baris video di tabel tidak bisa diklik untuk membuka halaman detail video (`/video/:id`), sehingga kreator tidak bisa melihat performa video secara langsung

**B8 — Thumbnail Hanya Auto-Generate, Tidak Ada Opsi Custom**

1.13 WHEN user mengupload video di halaman Upload THEN sistem hanya menghasilkan thumbnail dari frame pertama (detik ke-1) video secara otomatis tanpa memberikan opsi kepada user untuk mengupload gambar thumbnail sendiri

**B9 — Hapus Video Hanya Mengubah Tampilan, Tidak Menghapus dari List**

1.14 WHEN admin menghapus video di halaman All Videos THEN sistem hanya mengubah `is_deleted = true` di database dan menampilkan baris dengan opacity redup, tetapi video masih muncul di tabel admin

1.15 WHEN admin menghapus video THEN video yang telah dihapus masih bisa dilihat oleh admin di halaman All Videos dengan label "Dihapus", sehingga daftar menjadi penuh dengan entri yang sudah tidak aktif

---

### GRUP C — Bug Data & Konsistensi

**B10 — Harga Video Tampil Tidak Konsisten**

1.16 WHEN user melihat kartu video di halaman Jelajahi THEN komponen `VideoCard` menampilkan badge "GRATIS" untuk video yang sebenarnya berbayar (misalnya video "matematika" dengan `harga_koin = 5`) karena kondisi `isFree` menggunakan logika `!video.harga_koin || video.durasi_detik <= 180` yang salah — ketika `durasi_detik` adalah ≤180 detik, badge GRATIS muncul terlepas dari nilai `harga_koin`

1.17 WHEN user membuka halaman detail video yang sama THEN harga yang benar (5 koin) ditampilkan, bertentangan dengan tampilan GRATIS di kartu

**B11 — Kategori Video Tersimpan Salah saat Upload**

1.18 WHEN user mengisi form upload video dan memilih kategori dari dropdown THEN kategori yang tersimpan ke database berbeda dari yang dipilih user (misalnya user memilih "Matematika" tetapi tersimpan sebagai "Fisika")

**B12 — Kategori Sampah Muncul di Filter**

1.19 WHEN user membuka halaman Jelajahi dan melihat filter kategori THEN entri tidak valid seperti `"hau"` muncul di antara pilihan kategori karena data testing/sampah masuk ke tabel kategori atau kolom `kategori` video

**B13 — Riwayat Transaksi Wallet Selalu Kosong**

1.20 WHEN user membuka halaman Wallet → tab Riwayat THEN sistem menampilkan "Belum ada transaksi" meskipun ada aktivitas top up (pending maupun selesai) yang seharusnya muncul di riwayat

1.21 WHEN `walletStore.fetchTransactions()` dipanggil THEN query ke tabel `transactions` mengembalikan hasil kosong padahal ada record yang terkait dengan `user_id` tersebut, kemungkinan karena RLS policy memblokir akses atau query filter salah

**B14 — Saldo Koin Tidak Dipisah Berdasarkan Jenis**

1.22 WHEN kreator melihat saldo di halaman Wallet atau Studio THEN koin hasil pendapatan kreator (tipe `earning`) tercampur dengan koin top up (tipe `topup`) dalam satu angka saldo, sehingga tidak jelas berapa koin yang bisa dicairkan

1.23 WHEN kreator mengajukan pencairan (payout) THEN sistem tidak membedakan antara koin yang berasal dari top up (tidak bisa dicairkan) dan koin dari pendapatan kreator (bisa dicairkan), berpotensi menyebabkan kreator mencairkan koin yang bukan pendapatannya

**B15 — Dashboard Admin Statis dan Tanpa Grafik**

1.24 WHEN admin membuka halaman Dashboard Admin THEN keempat stat card (Total Mahasiswa, Total Video, Total Top Up, Revenue Platform) tidak bisa diklik padahal ada handler `onClick` yang sudah didefinisikan — ini sudah berfungsi di `AdminDashboardPage.jsx` untuk 2 card, namun 2 card lainnya tidak memiliki `onClick`

1.25 WHEN admin ingin memantau tren data THEN tidak ada grafik atau visualisasi data sama sekali di dashboard, hanya angka statis

**B16 — Antrian Review Tidak Ada Badge Count di Sidebar**

1.26 WHEN admin melihat sidebar navigasi THEN tidak ada indikator jumlah (badge) yang menunjukkan berapa video sedang menunggu review, sehingga admin harus masuk ke halaman review untuk mengetahui ada antrian

---

### Expected Behavior (Correct)

**B1 — Top Up Koin**

2.1 WHEN admin menyetujui permintaan top up dan edge function `admin-approve-topup` dipanggil THEN sistem SHALL berhasil memanggil RPC `process_topup` di Supabase, menambahkan `jumlah_koin` ke `saldo_koin` user, mencatat transaksi bertipe `topup` di tabel `transactions`, dan mengirim notifikasi `topup_approved` ke user

2.2 WHEN user membuka halaman Wallet → tab Riwayat setelah top up disetujui THEN sistem SHALL menampilkan transaksi top up dengan status "Selesai" beserta jumlah koin dan tanggal

2.3 WHEN edge function gagal diakses THEN sistem SHALL menampilkan pesan error yang jelas kepada user dan admin, serta TIDAK mengubah status data apapun secara parsial

**B2 — Video Bisa Diputar**

2.4 WHEN user membuka halaman detail video yang berstatus `approved` THEN sistem SHALL berhasil memanggil edge function `get-video-url`, mendapatkan signed URL dari bucket `videos`, dan memutar video di VideoPlayer tanpa error

2.5 WHEN edge function `get-video-url` dipanggil THEN sistem SHALL mengembalikan signed URL dengan TTL yang sesuai (durasi video + 5 menit buffer untuk user yang sudah bayar, atau `free_preview_seconds` + 2 menit untuk preview gratis)

**B3 — Review Video Admin**

2.6 WHEN admin mengklik Setujui atau Tolak THEN sistem SHALL memperbarui status video di database DAN mengirim respons sukses ke frontend secara atomik — jika edge function gagal, database rollback atau status tidak berubah

2.7 WHEN admin mengklik Review untuk melihat preview video THEN sistem SHALL menampilkan video di modal menggunakan signed URL yang berhasil digenerate oleh edge function `get-video-url`

**B4 — Upload QRIS**

2.8 WHEN admin mengupload gambar QRIS THEN sistem SHALL menyimpan file ke storage bucket yang benar (bucket `thumbnails` yang sudah ada, atau bucket baru `settings` yang harus dibuat dengan policy public read) dan menyimpan URL publik ke tabel `app_settings` dengan key `qris_image_url`

**B5 — Upload Foto Profil**

2.9 WHEN user memilih foto profil baru di halaman Profil THEN sistem SHALL mengupload file ke bucket `thumbnails` di path `avatars/{userId}.{ext}`, mendapatkan public URL, memperbarui kolom `avatar_url` di tabel `profiles`, dan menampilkan foto baru tanpa perlu refresh halaman

**B6 — Panel Notifikasi**

2.10 WHEN user mengklik ikon bell notifikasi THEN sistem SHALL menampilkan dropdown panel notifikasi sepenuhnya dalam viewport, dengan scroll internal jika daftar panjang, dan tidak terpotong di tepi layar manapun

**B7 — Video Studio Bisa Diklik**

2.11 WHEN kreator mengklik baris video di tabel Studio Kreator THEN sistem SHALL navigate ke halaman `/video/{id}` untuk membuka detail video tersebut

**B8 — Thumbnail Custom**

2.12 WHEN user mengupload video THEN sistem SHALL menyediakan opsi untuk mengupload gambar thumbnail sendiri sebagai alternatif dari thumbnail auto-generate, sebelum tombol Upload Video ditekan

**B9 — Hapus Video**

2.13 WHEN admin menghapus video THEN sistem SHALL menghapus (atau menyembunyikan) baris video dari tabel di halaman All Videos segera setelah konfirmasi, tanpa meninggalkan baris dengan label "Dihapus" yang terus bertambah

**B10 — Harga Video Konsisten**

2.14 WHEN komponen `VideoCard` merender video THEN sistem SHALL menentukan `isFree` secara benar: video dianggap gratis HANYA JIKA `harga_koin === 0` ATAU `durasi_detik <= 180` DAN `harga_koin === 0`, sehingga video berdurasi pendek yang tetap berbayar tidak ditampilkan sebagai GRATIS

**B11 — Kategori Tersimpan Benar**

2.15 WHEN user memilih kategori dari dropdown saat upload video THEN sistem SHALL menyimpan nilai kategori yang persis sama dengan pilihan user ke kolom `kategori` di tabel `videos`

**B12 — Tidak Ada Kategori Sampah**

2.16 WHEN user melihat filter kategori di halaman Jelajahi THEN sistem SHALL hanya menampilkan kategori yang valid dan terdaftar di tabel `categories` atau daftar resmi, tanpa entri testing/sampah seperti `"hau"`

**B13 — Riwayat Transaksi Tidak Kosong**

2.17 WHEN user membuka Wallet → tab Riwayat THEN sistem SHALL menampilkan semua transaksi bertipe `topup`, `purchase`, dan `earning` milik user tersebut, termasuk yang sedang pending, diurutkan dari terbaru

**B14 — Saldo Koin Dipisah**

2.18 WHEN kreator melihat halaman Wallet THEN sistem SHALL menampilkan saldo secara terpisah: "Koin Top Up" (dari transaksi tipe `topup`) dan "Koin Pendapatan" (dari transaksi tipe `earning`), beserta total gabungan

2.19 WHEN kreator mengajukan pencairan THEN sistem SHALL hanya memperbolehkan pencairan dari koin pendapatan (`earning`), bukan dari koin top up, dan menvalidasi bahwa jumlah yang diajukan tidak melebihi saldo koin pendapatan

**B15 — Dashboard Admin Interaktif**

2.20 WHEN admin mengklik stat card di Dashboard Admin THEN sistem SHALL mengarahkan admin ke halaman yang relevan (klik card "Total Mahasiswa" → `/admin/users`, card "Total Video" → `/admin/videos`, card "Total Top Up" → `/admin/transaksi`, card "Revenue Platform" → `/admin/transaksi`)

**B16 — Badge Count di Sidebar**

2.21 WHEN ada video yang berstatus `pending` di tabel `videos` THEN sistem SHALL menampilkan badge dengan angka jumlah video pending di item menu "Review Video" di sidebar admin

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user dengan akun valid login dan mengakses halaman Wallet THEN sistem SHALL CONTINUE TO menampilkan saldo koin dari `profile.saldo_koin` dengan benar tanpa perubahan layout utama

3.2 WHEN kreator mengupload video baru dengan file, judul, dan kategori yang lengkap THEN sistem SHALL CONTINUE TO menyimpan video ke bucket `videos` di Supabase Storage dan membuat record di tabel `videos` dengan status `pending`

3.3 WHEN admin membuka halaman Review Video dan mengklik Setujui THEN sistem SHALL CONTINUE TO mengubah status video menjadi `approved` di tabel `videos`

3.4 WHEN user menonton video gratis (durasi ≤ 3 menit atau harga = 0) THEN sistem SHALL CONTINUE TO memutar video penuh tanpa paywall

3.5 WHEN user menonton video berbayar dan mencapai batas waktu preview THEN sistem SHALL CONTINUE TO menampilkan PaywallModal yang meminta pembayaran sebelum melanjutkan

3.6 WHEN user melakukan like atau dislike pada video THEN sistem SHALL CONTINUE TO mencatat reaksi di tabel `video_likes` dan memperbarui counter di UI secara real-time

3.7 WHEN user mengikuti atau berhenti mengikuti kreator THEN sistem SHALL CONTINUE TO memperbarui tabel `follows` dan jumlah pengikut di UI

3.8 WHEN user mengirim komentar pada video THEN sistem SHALL CONTINUE TO menyimpan komentar ke tabel comments dan menampilkannya di CommentSection

3.9 WHEN admin menggunakan filter pencarian atau kategori di halaman Review Video THEN sistem SHALL CONTINUE TO memfilter dan menampilkan hasil yang sesuai dengan paginasi yang berfungsi

3.10 WHEN user membuka halaman Jelajahi THEN sistem SHALL CONTINUE TO menampilkan daftar video yang berstatus `approved` dengan filter kategori dan pencarian yang berfungsi

3.11 WHEN user menekan tombol Laporkan video dan mengisi alasan THEN sistem SHALL CONTINUE TO menyimpan laporan ke tabel `reports` dan menampilkan konfirmasi

3.12 WHEN admin mengelola user (suspend/unsuspend) THEN sistem SHALL CONTINUE TO memperbarui `is_suspended` di tabel `profiles` dan mencatat ke `admin_audit_log`

3.13 WHEN user yang ter-suspend mencoba mengakses fitur terbatas THEN sistem SHALL CONTINUE TO menampilkan `SuspendedScreen` dan memblokir aksi

3.14 WHEN notifikasi baru diterima user THEN sistem SHALL CONTINUE TO menampilkan unread badge di ikon bell dan memperbarui daftar notifikasi via Supabase Realtime

3.15 WHEN kreator menyelesaikan menonton videonya sendiri THEN sistem SHALL CONTINUE TO tidak menampilkan paywall (isOwnVideo = true bypass paywall)

---

## Bagian Tambahan: Persyaratan Fitur Baru

---

### F1 — Custom Thumbnail saat Upload

#### Current Behavior (Defect)

4.1 WHEN user mengupload video THEN sistem hanya menghasilkan thumbnail otomatis dari frame detik ke-1 video tanpa memberikan pilihan untuk menggunakan gambar lain sebagai thumbnail

#### Expected Behavior (Correct)

4.2 WHEN user mengupload video dan thumbnail auto-generate sudah tersedia THEN sistem SHALL menampilkan opsi tambahan berupa tombol "Upload Thumbnail Sendiri" yang membuka file picker untuk memilih file gambar (JPG/PNG, maks 2MB)

4.3 WHEN user mengupload thumbnail custom THEN sistem SHALL menggantikan thumbnail auto-generate dengan gambar yang dipilih user dan menampilkan preview sebelum submit

4.4 WHEN user tidak mengupload thumbnail custom THEN sistem SHALL tetap menggunakan thumbnail auto-generate tanpa perubahan perilaku

#### Unchanged Behavior (Regression Prevention)

4.5 WHEN video dikirim tanpa thumbnail custom THEN sistem SHALL CONTINUE TO menggunakan thumbnail auto-generate dari frame detik ke-1

---

### F2 — Indikator Status Upload Video

#### Current Behavior (Defect)

5.1 WHEN video selesai diupload dan statusnya `pending` di review THEN sistem tidak memberikan informasi visual yang jelas tentang status pemrosesan di Studio Kreator

#### Expected Behavior (Correct)

5.2 WHEN video berstatus `pending` ditampilkan di Studio Kreator THEN sistem SHALL menampilkan label "Menunggu Review" dengan ikon jam dan tooltip yang menjelaskan prosesnya

5.3 WHEN video berstatus `approved` ditampilkan di Studio Kreator THEN sistem SHALL menampilkan label "Disetujui — Siap Ditonton" dengan ikon centang hijau

5.4 WHEN video berstatus `rejected` ditampilkan di Studio Kreator THEN sistem SHALL menampilkan label "Ditolak" dengan alasan penolakan (`rejection_note`) jika tersedia

#### Unchanged Behavior (Regression Prevention)

5.5 WHEN status video berubah dari `pending` ke `approved` atau `rejected` THEN sistem SHALL CONTINUE TO memperbarui tampilan status saat halaman di-refresh

---

### F3 — Riwayat Top Up & Pencairan yang Detail

#### Current Behavior (Defect)

6.1 WHEN user membuka Wallet → tab Riwayat THEN sistem tidak menampilkan permintaan top up yang masih pending atau yang gagal/ditolak — hanya menampilkan transaksi yang sudah selesai (tipe `topup` di tabel `transactions`)

#### Expected Behavior (Correct)

6.2 WHEN user membuka Wallet → tab Riwayat THEN sistem SHALL menampilkan gabungan dari: (a) semua transaksi di tabel `transactions` milik user, dan (b) semua permintaan top up dari tabel `topup_requests` yang berstatus `pending` atau `ditolak`, diurutkan dari terbaru

6.3 WHEN item riwayat adalah permintaan top up yang `pending` THEN sistem SHALL menampilkan badge "Menunggu Verifikasi" berwarna kuning

6.4 WHEN item riwayat adalah permintaan top up yang `ditolak` THEN sistem SHALL menampilkan badge "Ditolak" berwarna merah beserta catatan admin jika ada

#### Unchanged Behavior (Regression Prevention)

6.5 WHEN item riwayat adalah transaksi `topup` yang sudah selesai THEN sistem SHALL CONTINUE TO menampilkan dengan badge "Selesai" berwarna hijau

---

### F4 — Saldo Koin Dipisah

#### Current Behavior (Defect)

7.1 WHEN kreator melihat saldo di Wallet THEN satu angka saldo menggabungkan semua koin tanpa pemisahan berdasarkan sumber

#### Expected Behavior (Correct)

7.2 WHEN kreator membuka halaman Wallet THEN sistem SHALL menampilkan dua komponen saldo: "Koin Top Up" (tidak bisa dicairkan, hanya untuk membeli konten) dan "Koin Pendapatan" (bisa dicairkan ke uang)

7.3 WHEN user non-kreator melihat Wallet THEN sistem SHALL hanya menampilkan total saldo dan riwayat top up, tanpa komponen pemisahan koin (karena user biasa tidak punya `earning`)

7.4 WHEN kreator mengajukan pencairan THEN sistem SHALL menghitung `koin_pendapatan` berdasarkan total transaksi tipe `earning` dikurangi total payout yang sudah berhasil (status `selesai`), bukan dari `saldo_koin` mentah

#### Unchanged Behavior (Regression Prevention)

7.5 WHEN user melakukan pembelian video THEN sistem SHALL CONTINUE TO mengurangi saldo dari `saldo_koin` total tanpa memandang jenis koin

---

### F5 — Fitur Lanjutkan Menonton

#### Expected Behavior (Correct)

8.1 WHEN user membuka halaman Jelajahi atau halaman utama THEN sistem SHALL menampilkan seksi "Lanjutkan Menonton" yang berisi video yang pernah ditonton (ada record di tabel `views`) namun belum selesai, diurutkan berdasarkan `updated_at` terbaru, maksimal 5 video

8.2 WHEN semua video yang pernah ditonton user sudah diselesaikan atau dihapus THEN sistem SHALL menyembunyikan seksi "Lanjutkan Menonton" sepenuhnya

8.3 WHEN user mengklik video di seksi "Lanjutkan Menonton" THEN sistem SHALL navigate ke halaman detail video tersebut

---

### F6 — Panel Notifikasi yang Proper (sekaligus memperbaiki B6)

#### Expected Behavior (Correct)

9.1 WHEN user mengklik ikon bell notifikasi THEN sistem SHALL menampilkan panel dropdown yang selalu muncul dalam batas viewport, dengan properti CSS `overflow-y: auto` dan `max-height` yang responsif

9.2 WHEN ada notifikasi yang belum dibaca THEN sistem SHALL menampilkan jumlah notifikasi belum dibaca sebagai badge merah di atas ikon bell (sudah ada, dipertahankan dan diperbaiki)

9.3 WHEN user mengklik item notifikasi THEN sistem SHALL menandai item tersebut sebagai sudah dibaca dan navigate ke halaman yang relevan

9.4 WHEN panel terbuka di layar mobile (lebar < 640px) THEN sistem SHALL menyesuaikan lebar panel agar tidak overflow ke kiri layar

---

### F7 — Form Cairkan Koin dengan Validasi yang Lebih Kuat

#### Current Behavior (Defect)

10.1 WHEN kreator mengisi form pencairan di Wallet THEN field "Bank / E-Wallet" adalah input teks bebas yang memungkinkan nilai tidak valid masuk ke database

10.2 WHEN kreator mengisi nomor rekening THEN tidak ada validasi format (misalnya nomor terlalu pendek atau terlalu panjang)

#### Expected Behavior (Correct)

10.3 WHEN kreator mengisi form pencairan THEN sistem SHALL mengganti field "Bank / E-Wallet" dengan dropdown berisi pilihan: BCA, BNI, BRI, Mandiri, BSI, GoPay, OVO, DANA, ShopeePay, LinkAja, dan pilihan "Lainnya"

10.4 WHEN kreator memasukkan nomor rekening/akun THEN sistem SHALL memvalidasi bahwa panjang nomor antara 8–20 karakter dan hanya berisi angka, menampilkan pesan error inline jika tidak valid sebelum form dapat disubmit

10.5 WHEN form pencairan lengkap dan valid THEN sistem SHALL memungkinkan submit dan melanjutkan proses seperti sebelumnya melalui edge function `request-payout`

#### Unchanged Behavior (Regression Prevention)

10.6 WHEN semua field valid dan jumlah koin memenuhi minimum THEN sistem SHALL CONTINUE TO mengirim permintaan payout melalui edge function dan menampilkan konfirmasi sukses

---

### F8 — Dashboard Admin Interaktif dengan Grafik

#### Expected Behavior (Correct)

11.1 WHEN admin membuka Dashboard Admin THEN sistem SHALL menampilkan grafik tren top up (jumlah koin dan jumlah permintaan) per hari untuk 7 hari terakhir, menggunakan library chart yang sudah ada atau Recharts

11.2 WHEN admin melihat dashboard THEN sistem SHALL menampilkan grafik pertumbuhan user baru per minggu untuk 4 minggu terakhir

11.3 WHEN admin melihat dashboard THEN sistem SHALL menampilkan grafik perbandingan video approved vs rejected per minggu untuk 4 minggu terakhir

11.4 WHEN admin mengklik salah satu stat card THEN sistem SHALL navigate ke halaman yang relevan: card "Total Mahasiswa" → `/admin/users`, card "Total Video" → `/admin/videos`, card "Total Top Up" → `/admin/transaksi`, card "Revenue Platform" → `/admin/transaksi`

#### Unchanged Behavior (Regression Prevention)

11.5 WHEN data statistik dimuat THEN sistem SHALL CONTINUE TO menampilkan nilai numerik di stat card sebelum grafik selesai dirender

---

### F9 — Bulk Action di Antrian Review Video

#### Expected Behavior (Correct)

12.1 WHEN admin berada di halaman Review Video THEN sistem SHALL menampilkan checkbox di setiap baris video serta checkbox "Pilih Semua" di header tabel

12.2 WHEN admin memilih satu atau lebih video dengan checkbox THEN sistem SHALL menampilkan toolbar aksi bulk dengan tombol "Setujui Semua Terpilih" dan "Tolak Semua Terpilih"

12.3 WHEN admin mengklik "Setujui Semua Terpilih" THEN sistem SHALL memanggil edge function `admin-moderate-video` untuk setiap video terpilih secara berurutan, menampilkan progress, dan merefresh daftar setelah semua selesai

12.4 WHEN admin mengklik "Tolak Semua Terpilih" THEN sistem SHALL menampilkan prompt tunggal untuk alasan penolakan yang berlaku untuk semua video terpilih, kemudian memproses penolakan untuk setiap video

---

### F10 — Export Data

#### Expected Behavior (Correct)

13.1 WHEN admin berada di halaman Transaksi, Laporan, atau Manajemen User THEN sistem SHALL menampilkan tombol "Export" di header halaman

13.2 WHEN admin mengklik Export di halaman Transaksi THEN sistem SHALL mengunduh file CSV berisi semua data transaksi yang sedang ditampilkan (sesuai filter aktif), dengan kolom: ID, Nama User, Tipe, Jumlah Koin, Tanggal

13.3 WHEN admin mengklik Export di halaman Laporan THEN sistem SHALL mengunduh file CSV berisi daftar laporan dengan kolom: ID, Video, Pelapor, Alasan, Status, Tanggal

13.4 WHEN admin mengklik Export di halaman Manajemen User THEN sistem SHALL mengunduh file CSV berisi daftar user dengan kolom: ID, Nama, Email, Role, Status, Tanggal Daftar

13.5 WHEN file CSV diunduh THEN file SHALL memiliki nama dengan format `sinau-{tipe}-{tanggal-hari-ini}.csv` dan encoding UTF-8 BOM agar kompatibel dengan Excel

---

### F11 — Log Aktivitas Admin (Audit Trail)

#### Expected Behavior (Correct)

14.1 WHEN admin melakukan aksi moderasi (setujui/tolak video, setujui/tolak top up, setujui/tolak payout, suspend/unsuspend user) THEN sistem SHALL mencatat aksi ke tabel `admin_audit_log` dengan kolom: `admin_id`, `action`, `target_type`, `target_id`, `note`, `created_at` (tabel sudah ada di migration 008)

14.2 WHEN admin membuka halaman Pengaturan → tab "Log Aktivitas" THEN sistem SHALL menampilkan daftar semua entri `admin_audit_log` diurutkan dari terbaru, dengan filter berdasarkan tipe aksi dan rentang tanggal

14.3 WHEN log ditampilkan THEN sistem SHALL menampilkan nama admin yang melakukan aksi (join ke tabel `profiles`), bukan hanya UUID

---

### F12 — Notifikasi Real-time Admin

#### Expected Behavior (Correct)

15.1 WHEN ada permintaan top up baru masuk ke tabel `topup_requests` dengan status `pending` THEN sistem SHALL menampilkan badge hitungan di item "Monitor Transaksi" di sidebar admin dan memperbarui hitungan secara real-time via Supabase Realtime

15.2 WHEN ada video baru masuk ke antrian review (status `pending` di tabel `videos`) THEN sistem SHALL memperbarui badge di item "Review Video" di sidebar admin secara real-time tanpa perlu refresh halaman (sekaligus memperbaiki B16)

15.3 WHEN ada laporan baru dengan status `baru` di tabel `reports` THEN sistem SHALL menampilkan badge di item "Laporan" di sidebar admin

15.4 WHEN admin mengklik item menu yang memiliki badge THEN badge SHALL dikosongkan setelah halaman dibuka (atau diperbarui sesuai data terbaru)
