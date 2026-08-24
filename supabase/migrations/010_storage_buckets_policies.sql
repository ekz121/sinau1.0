-- ============================================================
-- 010: Storage Buckets & Policies Fix
-- Memastikan bucket thumbnails (public) dan videos (private)
-- ada dengan policy yang benar, sehingga thumbnail tampil
-- dan video bisa diakses via signed URL.
-- ============================================================

-- ── 1. Pastikan bucket ada dengan visibilitas benar ──────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 2. Bucket thumbnails (PUBLIC): siapa pun boleh lihat ─────
DROP POLICY IF EXISTS "thumbnails_public_read" ON storage.objects;
CREATE POLICY "thumbnails_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

-- Pengguna login boleh upload/mengelola thumbnail, avatar,
-- QRIS, dan bukti transfer di bucket ini.
-- Path yang dipakai aplikasi: {uid}/..., bukti/..., qris/..., avatars/...
DROP POLICY IF EXISTS "thumbnails_insert_authed" ON storage.objects;
CREATE POLICY "thumbnails_insert_authed" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails_update_authed" ON storage.objects;
CREATE POLICY "thumbnails_update_authed" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails_delete_own" ON storage.objects;
CREATE POLICY "thumbnails_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 3. Bucket videos (PRIVATE): signed URL saja ──────────────
-- Upload hanya ke folder milik sendiri (path: {uid}/namafile.mp4)
DROP POLICY IF EXISTS "videos_insert_own_folder" ON storage.objects;
CREATE POLICY "videos_insert_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Kreator boleh membaca/membuat signed URL untuk video miliknya
-- (preview video pending). Penonton lain tetap lewat Edge Function
-- get-video-url agar paywall ditegakkan.
DROP POLICY IF EXISTS "videos_select_own_folder" ON storage.objects;
CREATE POLICY "videos_select_own_folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "videos_update_own_folder" ON storage.objects;
CREATE POLICY "videos_update_own_folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "videos_delete_own_folder" ON storage.objects;
CREATE POLICY "videos_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
