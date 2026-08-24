-- ============================================================
-- Sinau Platform — Migration 006: Settings Config & Helpers
-- ============================================================

-- ── Helper: get_my_role (cached, used in RLS policies) ───────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── app_settings: tambah config keys ─────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('revenue_split_creator', '80'),
  ('koin_to_rupiah_rate', '500'),
  ('min_payout_koin', '50'),
  ('free_preview_seconds', '60'),
  ('paywall_coin', '1'),
  ('qris_image_url', '')
ON CONFLICT (key) DO NOTHING;

-- ── profiles: tambah kolom is_deleted jika belum ada ─────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ── RLS: user yang is_deleted tidak bisa akses ────────────────
-- Update is_active_user helper
CREATE OR REPLACE FUNCTION public.is_active_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT NOT COALESCE(
    (SELECT is_suspended OR is_deleted FROM public.profiles WHERE id = user_id),
    true
  );
$$;
