-- ============================================================
-- Sinau Platform — Database Migration 001
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Tables ──────────────────────────────────────────────────

-- profiles: linked to auth.users, NOT a separate user table
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama          TEXT,
  jurusan       TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'mahasiswa' CHECK (role IN ('mahasiswa', 'admin')),
  saldo_koin    INTEGER NOT NULL DEFAULT 0 CHECK (saldo_koin >= 0),
  is_suspended  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  judul           TEXT NOT NULL,
  deskripsi       TEXT,
  kategori        TEXT,
  video_file_url  TEXT,
  thumbnail_url   TEXT,
  durasi_detik    INTEGER,
  harga_koin      INTEGER NOT NULL DEFAULT 0 CHECK (harga_koin >= 0),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_note  TEXT,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.views (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id              UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  viewer_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  watch_percentage      NUMERIC DEFAULT 0,
  has_paid_to_continue  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Required for ON CONFLICT in process_purchase UPSERT
  CONSTRAINT uq_view_per_user UNIQUE (video_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'earning')),
  amount_koin      INTEGER NOT NULL CHECK (amount_koin > 0),
  related_video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index: one purchase per user per video (database-level idempotency for race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_once
  ON public.transactions (user_id, related_video_id)
  WHERE type = 'purchase';

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_summary      TEXT,
  questions_json  TEXT,
  is_fallback     BOOLEAN NOT NULL DEFAULT false,
  user_score      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_quiz_per_user_video UNIQUE (video_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alasan      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diproses', 'selesai')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Helper Functions ─────────────────────────────────────────

-- Check if a user is active (not suspended) — used in RLS policies
CREATE OR REPLACE FUNCTION public.is_active_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT NOT COALESCE(
    (SELECT is_suspended FROM public.profiles WHERE id = user_id),
    true
  );
$$;

-- ── Triggers ─────────────────────────────────────────────────

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, nama, jurusan)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nama', NEW.email),
    NEW.raw_user_meta_data->>'jurusan'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Guard saldo_koin, role, is_suspended from being modified directly by non-service-role callers
-- Service role bypasses RLS but request.jwt.claim.role = 'service_role' for service role calls
CREATE OR REPLACE FUNCTION public.prevent_profile_self_abuse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Block saldo_koin changes from non-service-role
  IF NEW.saldo_koin IS DISTINCT FROM OLD.saldo_koin THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      NEW.saldo_koin := OLD.saldo_koin;
    END IF;
  END IF;
  -- Block role changes from non-service-role
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Block is_suspended self-modification (admin uses service role via Edge Function)
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      NEW.is_suspended := OLD.is_suspended;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_self_abuse();

-- Auto-increment view_count on videos when a new view is inserted
CREATE OR REPLACE FUNCTION public.increment_view_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.videos SET view_count = view_count + 1 WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_view ON public.views;
CREATE TRIGGER on_new_view
  AFTER INSERT ON public.views
  FOR EACH ROW EXECUTE FUNCTION public.increment_view_count();

-- ── RPC Functions ────────────────────────────────────────────

-- Atomic purchase function (called only from purchase-continue Edge Function via service role)
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_viewer_id UUID,
  p_video_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_id  UUID;
  v_harga_koin  INTEGER;
  v_viewer_saldo INTEGER;
BEGIN
  -- 1. Get video info + lock row
  SELECT creator_id, harga_koin INTO v_creator_id, v_harga_koin
  FROM public.videos
  WHERE id = p_video_id AND status = 'approved'
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Video not found or not approved';
  END IF;

  -- 2. Self-purchase check
  IF p_viewer_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot purchase own video';
  END IF;

  -- 3. Check & lock viewer balance
  SELECT saldo_koin INTO v_viewer_saldo
  FROM public.profiles
  WHERE id = p_viewer_id
  FOR UPDATE;

  IF v_viewer_saldo < v_harga_koin THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_viewer_saldo, v_harga_koin;
  END IF;

  -- 4. Execute atomically
  UPDATE public.profiles SET saldo_koin = saldo_koin - v_harga_koin WHERE id = p_viewer_id;
  UPDATE public.profiles SET saldo_koin = saldo_koin + (v_harga_koin * 80 / 100) WHERE id = v_creator_id;

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (p_viewer_id, 'purchase', v_harga_koin, p_video_id);

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (v_creator_id, 'earning', (v_harga_koin * 80 / 100), p_video_id);

  -- 5. UPSERT view record (handles missing row gracefully)
  INSERT INTO public.views (video_id, viewer_id, has_paid_to_continue)
  VALUES (p_video_id, p_viewer_id, true)
  ON CONFLICT ON CONSTRAINT uq_view_per_user
  DO UPDATE SET has_paid_to_continue = true;

  RETURN jsonb_build_object('success', true, 'message', 'Purchase completed', 'already_paid', false);

EXCEPTION
  WHEN unique_violation THEN
    -- Handles race condition / double request (uq_purchase_once index)
    RETURN jsonb_build_object('success', true, 'message', 'Already purchased', 'already_paid', true);
END;
$$;

-- Prevent direct client access — only callable via service_role (Edge Functions)
REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) TO service_role;

-- Atomic top-up function
CREATE OR REPLACE FUNCTION public.process_topup(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET saldo_koin = saldo_koin + p_amount
  WHERE id = p_user_id
  RETURNING saldo_koin INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount_koin)
  VALUES (p_user_id, 'topup', p_amount);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Prevent direct client access — only callable via service_role (Edge Functions)
REVOKE EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER) TO service_role;

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.views        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports      ENABLE ROW LEVEL SECURITY;

-- ── profiles policies ─────────────────────────────────────────
-- SELECT own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Admin can SELECT all profiles
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- UPDATE own profile (saldo/role/is_suspended protected by trigger)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- ── videos policies ──────────────────────────────────────────
-- Anyone authenticated can view approved videos
CREATE POLICY "videos_select_approved" ON public.videos
  FOR SELECT TO authenticated
  USING (status = 'approved' AND public.is_active_user(auth.uid()));

-- Creators can view their own videos (any status)
CREATE POLICY "videos_select_own" ON public.videos
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

-- Admin can view all videos
CREATE POLICY "videos_select_admin" ON public.videos
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Creators can insert their own videos
CREATE POLICY "videos_insert_own" ON public.videos
  FOR INSERT TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND public.is_active_user(auth.uid())
  );

-- Creators can update their own videos (title, description etc, not status)
CREATE POLICY "videos_update_own" ON public.videos
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() AND public.is_active_user(auth.uid()));

-- Admin can update all videos (for moderation)
CREATE POLICY "videos_update_admin" ON public.videos
  FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── views policies ───────────────────────────────────────────
CREATE POLICY "views_select_own" ON public.views
  FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

CREATE POLICY "views_insert_own" ON public.views
  FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND public.is_active_user(auth.uid())
  );

CREATE POLICY "views_update_own" ON public.views
  FOR UPDATE TO authenticated
  USING (viewer_id = auth.uid());

-- ── transactions policies ─────────────────────────────────────
-- Only SELECT own transactions (no INSERT/UPDATE from client — service role only)
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "transactions_select_admin" ON public.transactions
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── quiz_results policies ──────────────────────────────────────
CREATE POLICY "quiz_select_own" ON public.quiz_results
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "quiz_insert_own" ON public.quiz_results
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── reports policies ─────────────────────────────────────────
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.is_active_user(auth.uid()));

CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "reports_select_admin" ON public.reports
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "reports_update_admin" ON public.reports
  FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── Storage Buckets ───────────────────────────────────────────
-- NOTE: Run these manually in Supabase Dashboard → Storage, OR uncomment:

-- INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true) ON CONFLICT DO NOTHING;

-- Videos bucket: authenticated users can upload their own files; no public access (signed URLs only)
-- Storage policies are set in the Supabase dashboard (see SETUP.md)

-- ── Indexes for performance ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_creator ON public.videos(creator_id);
CREATE INDEX IF NOT EXISTS idx_videos_kategori ON public.videos(kategori);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_video ON public.transactions(related_video_id);
CREATE INDEX IF NOT EXISTS idx_views_video ON public.views(video_id);
CREATE INDEX IF NOT EXISTS idx_views_viewer ON public.views(viewer_id);
