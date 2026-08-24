-- ============================================================
-- Sinau Platform — Seed Data for Demo
-- ============================================================
-- IMPORTANT: Run this AFTER 001_init.sql AND after creating
-- the admin@sinau.ac.id user in Supabase Auth Dashboard.
-- Then replace the UUID placeholders below with real user IDs.
-- ============================================================

-- Default app settings
INSERT INTO public.app_settings (key, value) VALUES
  ('free_preview_seconds', '60'),
  ('paywall_coin', '1'),
  ('koin_to_rupiah_rate', '500'),
  ('revenue_split_creator', '80'),
  ('min_payout_koin', '50'),
  ('qris_image_url', '')
ON CONFLICT (key) DO NOTHING;

-- Step 1: After creating admin account in Supabase Auth, 
-- run this to make them admin:
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<admin-user-id>';

-- Step 2: Dummy video data (after uploading actual .mp4 files to Storage)
-- Replace creator_id with actual user IDs from auth.users

-- Sample approved videos for demo
-- These will only show in Explore after being approved
-- Use Supabase Dashboard → Storage to upload actual .mp4 files

INSERT INTO public.videos (id, creator_id, judul, deskripsi, kategori, durasi_detik, harga_koin, status, view_count)
SELECT
  uuid_generate_v4(),
  (SELECT id FROM public.profiles WHERE role = 'mahasiswa' LIMIT 1),
  judul, deskripsi, kategori, durasi, harga, 'approved', views
FROM (VALUES
  ('Pengantar Algoritma Sorting', 'Belajar bubble sort, insertion sort, dan quick sort dengan penjelasan visual dan implementasi kode Python.', 'Pemrograman', 120, 0, 15),
  ('Kalkulus Diferensial — Konsep Turunan', 'Memahami konsep turunan, aturan rantai, dan aplikasinya dalam soal fisika dan teknik.', 'Matematika', 240, 5, 8),
  ('Hukum Newton dan Gerak Proyektil', 'Penjelasan mendalam tentang tiga hukum Newton dengan contoh soal gerak dua dimensi.', 'Fisika', 300, 8, 22),
  ('SQL Dasar untuk Pemula', 'SELECT, WHERE, JOIN, GROUP BY — semua perintah SQL yang perlu kamu tahu untuk memulai.', 'Pemrograman', 180, 0, 31),
  ('Statistika Deskriptif — Mean, Median, Modus', 'Cara menghitung ukuran pemusatan data dan kapan harus menggunakan masing-masing ukuran.', 'Statistika', 150, 0, 19),
  ('Termodinamika — Hukum Pertama', 'Energi internal, kalor, dan kerja: memahami hukum pertama termodinamika dari dasar.', 'Fisika', 360, 10, 7),
  ('Struktur Data: Stack dan Queue', 'Implementasi stack dan queue di Python, dengan aplikasi nyata di dunia industri.', 'Pemrograman', 200, 6, 14),
  ('Ekonomi Mikro — Permintaan dan Penawaran', 'Kurva permintaan, penawaran, dan keseimbangan pasar — dengan contoh kasus nyata Indonesia.', 'Ekonomi', 270, 7, 11)
) AS t(judul, deskripsi, kategori, durasi, harga, views)
WHERE EXISTS (SELECT 1 FROM public.profiles WHERE role = 'mahasiswa' LIMIT 1)
ON CONFLICT DO NOTHING;
