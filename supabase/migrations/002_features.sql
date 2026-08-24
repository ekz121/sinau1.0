-- ============================================================
-- Sinau Platform — Migration 002: Fitur Tambahan Tahap 1
-- ============================================================

-- ── Kolom baru di videos ─────────────────────────────────────
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ── Kolom baru di profiles ────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ── Update RLS videos: exclude is_deleted ────────────────────
DROP POLICY IF EXISTS "videos_select_approved" ON public.videos;
CREATE POLICY "videos_select_approved" ON public.videos
  FOR SELECT TO authenticated
  USING (status = 'approved' AND is_deleted = false AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "videos_select_own" ON public.videos;
CREATE POLICY "videos_select_own" ON public.videos
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid() AND is_deleted = false);

-- Admin bisa lihat semua video termasuk deleted (untuk audit)
DROP POLICY IF EXISTS "videos_select_admin" ON public.videos;
CREATE POLICY "videos_select_admin" ON public.videos
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- Admin bisa delete (soft) video
DROP POLICY IF EXISTS "videos_delete_admin" ON public.videos;
CREATE POLICY "videos_delete_admin" ON public.videos
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ── Update index ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_deleted ON public.videos(is_deleted);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted ON public.profiles(is_deleted);
