-- ============================================================
-- Sinau Platform — Migration 011: Full audit hardening
-- Financial integrity, content protection, reports, storage and notifications.
-- ============================================================

BEGIN;

-- ── Canonical fixed platform settings ───────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('koin_to_rupiah_rate', '500'),
  ('paywall_coin', '1'),
  ('free_preview_seconds', '60'),
  ('revenue_split_creator', '80'),
  ('revenue_split_platform', '20'),
  ('min_topup_koin', '1'),
  ('max_topup_koin', '10000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
WHERE public.app_settings.key IN (
  'koin_to_rupiah_rate', 'paywall_coin', 'free_preview_seconds'
);

-- Every approved upload uses the same one-coin paywall.
UPDATE public.videos SET harga_koin = 1 WHERE harga_koin IS DISTINCT FROM 1;
ALTER TABLE public.videos ALTER COLUMN harga_koin SET DEFAULT 1;
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_harga_koin_check;
ALTER TABLE public.videos
  ADD CONSTRAINT videos_harga_koin_check CHECK (harga_koin = 1);

-- ── Decimal creator earnings; yellow/top-up coins stay integer ─
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_saldo_koin_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_saldo_koin_kreator_check;
ALTER TABLE public.profiles
  ALTER COLUMN saldo_koin TYPE NUMERIC(14,2) USING saldo_koin::NUMERIC,
  ALTER COLUMN saldo_koin SET DEFAULT 0,
  ALTER COLUMN saldo_koin_kreator TYPE NUMERIC(14,2) USING saldo_koin_kreator::NUMERIC,
  ALTER COLUMN saldo_koin_kreator SET DEFAULT 0;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_saldo_koin_check CHECK (saldo_koin >= 0),
  ADD CONSTRAINT profiles_saldo_koin_kreator_check CHECK (saldo_koin_kreator >= 0);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_koin_check;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions
  ALTER COLUMN amount_koin TYPE NUMERIC(14,2) USING amount_koin::NUMERIC,
  ADD COLUMN IF NOT EXISTS platform_amount_koin NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'berhasil',
  ADD COLUMN IF NOT EXISTS related_topup_request_id UUID REFERENCES public.topup_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE SET NULL;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_koin_check CHECK (amount_koin > 0),
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('topup', 'purchase', 'earning', 'payout', 'refund')),
  ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending', 'berhasil', 'gagal')),
  ADD CONSTRAINT transactions_platform_amount_check CHECK (platform_amount_koin >= 0);

-- Best-effort backfill for legacy purchases. Future rows store the exact split used.
UPDATE public.transactions
SET platform_amount_koin = ROUND(
  amount_koin * (100 - COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'revenue_split_creator'), 80
  )) / 100,
  2
)
WHERE type = 'purchase' AND platform_amount_koin = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_topup_request
  ON public.transactions (related_topup_request_id)
  WHERE type = 'topup' AND related_topup_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_payout_request
  ON public.transactions (related_payout_request_id)
  WHERE type = 'payout' AND related_payout_request_id IS NOT NULL;

-- Idempotency keys are scoped to their owner, so unrelated users cannot
-- accidentally (or deliberately) block one another with the same key.
DROP INDEX IF EXISTS public.uq_topup_idempotency;
CREATE UNIQUE INDEX uq_topup_idempotency
  ON public.topup_requests (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Recompute the backwards-compatible total whenever either wallet changes.
CREATE OR REPLACE FUNCTION public.sync_total_saldo_koin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.saldo_koin := COALESCE(NEW.saldo_koin_topup, 0) + COALESCE(NEW.saldo_koin_kreator, 0);
  RETURN NEW;
END;
$$;

-- ── Purchase: yellow coins only, 0.80 blue coin to creator ──
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_viewer_id UUID,
  p_video_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_price INTEGER;
  v_topup INTEGER;
  v_creator_split INTEGER;
  v_creator_earn NUMERIC(14,2);
  v_platform_earn NUMERIC(14,2);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = p_viewer_id AND related_video_id = p_video_id AND type = 'purchase'
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true);
  END IF;

  SELECT creator_id, harga_koin INTO v_creator_id, v_price
  FROM public.videos
  WHERE id = p_video_id AND status = 'approved' AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Video not found or not approved'; END IF;
  IF p_viewer_id = v_creator_id THEN RAISE EXCEPTION 'Cannot purchase own video'; END IF;
  IF NOT public.is_active_user(p_viewer_id) THEN RAISE EXCEPTION 'Account inactive'; END IF;

  SELECT saldo_koin_topup INTO v_topup
  FROM public.profiles WHERE id = p_viewer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_topup < v_price THEN
    RAISE EXCEPTION 'Insufficient topup balance: have %, need %', v_topup, v_price;
  END IF;

  SELECT COALESCE((SELECT value::INTEGER FROM public.app_settings
    WHERE key = 'revenue_split_creator'), 80) INTO v_creator_split;
  IF v_creator_split < 0 OR v_creator_split > 100 THEN
    RAISE EXCEPTION 'Invalid creator revenue split';
  END IF;

  v_creator_earn := ROUND(v_price::NUMERIC * v_creator_split / 100, 2);
  v_platform_earn := v_price::NUMERIC - v_creator_earn;

  UPDATE public.profiles
  SET saldo_koin_topup = saldo_koin_topup - v_price
  WHERE id = p_viewer_id;

  UPDATE public.profiles
  SET saldo_koin_kreator = saldo_koin_kreator + v_creator_earn
  WHERE id = v_creator_id;

  INSERT INTO public.transactions
    (user_id, type, amount_koin, platform_amount_koin, related_video_id, status)
  VALUES
    (p_viewer_id, 'purchase', v_price, v_platform_earn, p_video_id, 'berhasil'),
    (v_creator_id, 'earning', v_creator_earn, 0, p_video_id, 'berhasil');

  INSERT INTO public.views (video_id, viewer_id, has_paid_to_continue)
  VALUES (p_video_id, p_viewer_id, true)
  ON CONFLICT ON CONSTRAINT uq_view_per_user
  DO UPDATE SET has_paid_to_continue = true;

  RETURN jsonb_build_object(
    'success', true,
    'already_paid', false,
    'creator_earn', v_creator_earn,
    'platform_earn', v_platform_earn,
    'topup_balance', v_topup - v_price
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) TO service_role;

-- ── Top-up approval/rejection in one locked DB transaction ──
CREATE OR REPLACE FUNCTION public.resolve_topup_request(
  p_request_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.topup_requests%ROWTYPE;
  v_new_balance INTEGER;
BEGIN
  IF p_action NOT IN ('selesai', 'ditolak') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_req FROM public.topup_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topup request not found'; END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', true, 'already_processed', true,
      'current_status', v_req.status, 'user_id', v_req.user_id,
      'jumlah_koin', v_req.jumlah_koin
    );
  END IF;

  IF p_action = 'selesai' THEN
    UPDATE public.profiles
    SET saldo_koin_topup = saldo_koin_topup + v_req.jumlah_koin
    WHERE id = v_req.user_id
    RETURNING saldo_koin_topup INTO v_new_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

    INSERT INTO public.transactions
      (user_id, type, amount_koin, related_topup_request_id, status)
    VALUES
      (v_req.user_id, 'topup', v_req.jumlah_koin, v_req.id, 'berhasil');
  END IF;

  UPDATE public.topup_requests
  SET status = p_action, admin_note = NULLIF(BTRIM(p_note), ''), processed_at = NOW()
  WHERE id = v_req.id;

  RETURN jsonb_build_object(
    'success', true, 'already_processed', false, 'action', p_action,
    'user_id', v_req.user_id, 'jumlah_koin', v_req.jumlah_koin,
    'topup_balance', v_new_balance
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_topup_request(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_topup_request(UUID, TEXT, TEXT) TO service_role;

-- The older helper stays server-only, but no user-facing flow calls it anymore.
REVOKE EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

-- ── Payout idempotency and transaction lifecycle ────────────
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
DROP INDEX IF EXISTS public.uq_payout_idempotency;
CREATE UNIQUE INDEX uq_payout_idempotency
  ON public.payout_requests (creator_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_payout(
  p_creator_id UUID,
  p_jumlah_koin INTEGER,
  p_data_tujuan JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_min INTEGER;
  v_rate INTEGER;
  v_rupiah INTEGER;
  v_request_id UUID;
  v_existing public.payout_requests%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR LENGTH(BTRIM(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  SELECT * INTO v_existing FROM public.payout_requests
  WHERE creator_id = p_creator_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'already_submitted', true,
      'request_id', v_existing.id, 'jumlah_rupiah', v_existing.jumlah_rupiah
    );
  END IF;

  SELECT COALESCE((SELECT value::INTEGER FROM public.app_settings WHERE key = 'min_payout_koin'), 50),
         500
  INTO v_min, v_rate;
  IF p_jumlah_koin < v_min THEN RAISE EXCEPTION 'Minimum payout % coins', v_min; END IF;
  IF NOT public.is_active_user(p_creator_id) THEN RAISE EXCEPTION 'Account inactive'; END IF;

  SELECT saldo_koin_kreator INTO v_balance
  FROM public.profiles WHERE id = p_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_jumlah_koin THEN RAISE EXCEPTION 'Insufficient creator balance'; END IF;

  v_rupiah := p_jumlah_koin * v_rate;
  UPDATE public.profiles
  SET saldo_koin_kreator = saldo_koin_kreator - p_jumlah_koin
  WHERE id = p_creator_id;

  INSERT INTO public.payout_requests
    (creator_id, jumlah_koin, jumlah_rupiah, data_tujuan, idempotency_key)
  VALUES
    (p_creator_id, p_jumlah_koin, v_rupiah, p_data_tujuan, p_idempotency_key)
  RETURNING id INTO v_request_id;

  INSERT INTO public.transactions
    (user_id, type, amount_koin, related_payout_request_id, status)
  VALUES
    (p_creator_id, 'payout', p_jumlah_koin, v_request_id, 'pending');

  RETURN jsonb_build_object(
    'success', true, 'already_submitted', false,
    'request_id', v_request_id, 'jumlah_rupiah', v_rupiah
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_payout(
  p_payout_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.payout_requests%ROWTYPE;
BEGIN
  IF p_action NOT IN ('selesai', 'ditolak') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT * INTO v_req FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout request not found'; END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', true, 'already_processed', true,
      'current_status', v_req.status, 'creator_id', v_req.creator_id,
      'jumlah_koin', v_req.jumlah_koin
    );
  END IF;

  IF p_action = 'ditolak' THEN
    UPDATE public.profiles
    SET saldo_koin_kreator = saldo_koin_kreator + v_req.jumlah_koin
    WHERE id = v_req.creator_id;
    INSERT INTO public.transactions (user_id, type, amount_koin, related_payout_request_id, status)
    VALUES (v_req.creator_id, 'refund', v_req.jumlah_koin, v_req.id, 'berhasil');
  END IF;

  UPDATE public.transactions
  SET status = CASE WHEN p_action = 'selesai' THEN 'berhasil' ELSE 'gagal' END
  WHERE related_payout_request_id = v_req.id AND type = 'payout';

  UPDATE public.payout_requests
  SET status = p_action, admin_note = NULLIF(BTRIM(p_note), ''), processed_at = NOW()
  WHERE id = v_req.id;

  RETURN jsonb_build_object(
    'success', true, 'already_processed', false, 'action', p_action,
    'creator_id', v_req.creator_id, 'jumlah_koin', v_req.jumlah_koin
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) TO service_role;

-- Client writes to financial/request tables are never a fallback path.
DROP POLICY IF EXISTS "topup_req_insert_own" ON public.topup_requests;
DROP POLICY IF EXISTS "topup_req_update_admin" ON public.topup_requests;
DROP POLICY IF EXISTS "payout_req_insert_own" ON public.payout_requests;
DROP POLICY IF EXISTS "payout_req_update_admin" ON public.payout_requests;
DROP POLICY IF EXISTS "app_settings_admin" ON public.app_settings;
DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;

-- ── Safe public profile projection ───────────────────────────
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, nama, jurusan, avatar_url, created_at
FROM public.profiles
WHERE is_deleted = false;
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- Prevent creators from editing moderation, ownership and counters directly.
CREATE OR REPLACE FUNCTION public.protect_video_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.creator_id := OLD.creator_id;
    NEW.status := OLD.status;
    NEW.rejection_note := OLD.rejection_note;
    NEW.is_deleted := OLD.is_deleted;
    NEW.view_count := OLD.view_count;
    NEW.harga_koin := OLD.harga_koin;
    NEW.video_file_url := OLD.video_file_url;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_video_sensitive_fields ON public.videos;
CREATE TRIGGER guard_video_sensitive_fields
  BEFORE UPDATE ON public.videos FOR EACH ROW
  EXECUTE FUNCTION public.protect_video_sensitive_fields();

CREATE OR REPLACE FUNCTION public.protect_view_access_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.video_id := OLD.video_id;
    NEW.viewer_id := OLD.viewer_id;
    NEW.has_paid_to_continue := OLD.has_paid_to_continue;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_view_access_fields ON public.views;
CREATE TRIGGER guard_view_access_fields
  BEFORE UPDATE ON public.views FOR EACH ROW
  EXECUTE FUNCTION public.protect_view_access_fields();

CREATE OR REPLACE FUNCTION public.protect_comment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.user_id := OLD.user_id;
    NEW.video_id := OLD.video_id;
    NEW.parent_comment_id := OLD.parent_comment_id;
  END IF;
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    NEW.content := '[Komentar dihapus]';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_comment_identity ON public.comments;
CREATE TRIGGER guard_comment_identity
  BEFORE UPDATE ON public.comments FOR EACH ROW
  EXECUTE FUNCTION public.protect_comment_identity();

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "likes_insert" ON public.video_likes;
CREATE POLICY "likes_insert" ON public.video_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active_user(auth.uid()));
DROP POLICY IF EXISTS "likes_update" ON public.video_likes;
CREATE POLICY "likes_update" ON public.video_likes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_active_user(auth.uid()));
DROP POLICY IF EXISTS "likes_delete" ON public.video_likes;
CREATE POLICY "likes_delete" ON public.video_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (
    follower_id = auth.uid() AND creator_id <> auth.uid()
    AND public.is_active_user(auth.uid())
  );
DROP POLICY IF EXISTS "follows_delete" ON public.follows;
CREATE POLICY "follows_delete" ON public.follows FOR DELETE TO authenticated
  USING (follower_id = auth.uid() AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "views_update_own" ON public.views;
CREATE POLICY "views_update_own" ON public.views FOR UPDATE TO authenticated
  USING (viewer_id = auth.uid() AND public.is_active_user(auth.uid()))
  WITH CHECK (viewer_id = auth.uid() AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "quiz_select_video_level" ON public.quiz_results;
CREATE POLICY "quiz_select_video_level" ON public.quiz_results
  FOR SELECT TO authenticated
  USING (
    is_video_level = true
    AND public.is_active_user(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = quiz_results.video_id
        AND videos.status = 'approved'
        AND videos.is_deleted = false
        AND (
          COALESCE(videos.durasi_detik, 0) <= 60
          OR videos.creator_id = auth.uid()
          OR public.get_my_role() = 'admin'
          OR EXISTS (
            SELECT 1 FROM public.views
            WHERE views.video_id = videos.id
              AND views.viewer_id = auth.uid()
              AND views.has_paid_to_continue = true
          )
        )
    )
  );

-- ── Reports may target exactly one video or comment ─────────
ALTER TABLE public.reports ALTER COLUMN video_id DROP NOT NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('baru', 'diproses', 'selesai', 'ditolak'));
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_exactly_one_target;
ALTER TABLE public.reports ADD CONSTRAINT reports_exactly_one_target
  CHECK ((video_id IS NOT NULL)::INTEGER + (comment_id IS NOT NULL)::INTEGER = 1);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON public.reports(comment_id);

-- ── Storage: public media separated from private proofs ──────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('videos', 'videos', false, 104857600, ARRAY['video/mp4']),
  ('thumbnails', 'thumbnails', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "thumbnails_insert_authed" ON storage.objects;
DROP POLICY IF EXISTS "thumbnails_update_authed" ON storage.objects;
DROP POLICY IF EXISTS "thumbnails_delete_own" ON storage.objects;
CREATE POLICY "thumbnails_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'thumbnails' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR ((storage.foldername(name))[1] = 'qris' AND public.get_my_role() = 'admin')
    )
  );
CREATE POLICY "thumbnails_update_scoped" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'thumbnails' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR ((storage.foldername(name))[1] = 'qris' AND public.get_my_role() = 'admin')
    )
  ) WITH CHECK (
    bucket_id = 'thumbnails' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR ((storage.foldername(name))[1] = 'qris' AND public.get_my_role() = 'admin')
    )
  );
CREATE POLICY "thumbnails_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'thumbnails' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR ((storage.foldername(name))[1] = 'qris' AND public.get_my_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_select_own_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_delete_own" ON storage.objects;
CREATE POLICY "payment_proofs_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );
CREATE POLICY "payment_proofs_select_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'payment-proofs' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR public.get_my_role() = 'admin'
    )
  );
CREATE POLICY "payment_proofs_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'payment-proofs'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
    AND NOT EXISTS (
      SELECT 1 FROM public.topup_requests
      WHERE topup_requests.user_id = auth.uid()
        AND topup_requests.bukti_transfer_url = name
    )
  );

-- Realtime is required for wallet/admin status and notification refreshes.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'profiles', 'transactions', 'topup_requests', 'payout_requests',
      'notifications', 'reports', 'videos'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ── Admin notifications for actionable events ───────────────
CREATE OR REPLACE FUNCTION public.notify_admins_action_required()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_payload JSONB;
BEGIN
  IF TG_TABLE_NAME = 'videos' THEN
    v_type := 'admin_video_pending';
    v_payload := jsonb_build_object('video_id', NEW.id, 'judul', NEW.judul);
  ELSIF TG_TABLE_NAME = 'topup_requests' THEN
    v_type := 'admin_topup_pending';
    v_payload := jsonb_build_object('request_id', NEW.id, 'jumlah_koin', NEW.jumlah_koin);
  ELSIF TG_TABLE_NAME = 'payout_requests' THEN
    v_type := 'admin_payout_pending';
    v_payload := jsonb_build_object('request_id', NEW.id, 'jumlah_koin', NEW.jumlah_koin);
  ELSE
    v_type := 'admin_report_pending';
    v_payload := jsonb_build_object('report_id', NEW.id, 'video_id', NEW.video_id, 'comment_id', NEW.comment_id);
  END IF;

  INSERT INTO public.notifications (user_id, type, payload_json)
  SELECT id, v_type, v_payload FROM public.profiles
  WHERE role = 'admin' AND is_suspended = false AND is_deleted = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_admin_video_pending ON public.videos;
CREATE TRIGGER notify_admin_video_pending AFTER INSERT ON public.videos
  FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION public.notify_admins_action_required();
DROP TRIGGER IF EXISTS notify_admin_topup_pending ON public.topup_requests;
CREATE TRIGGER notify_admin_topup_pending AFTER INSERT ON public.topup_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_action_required();
DROP TRIGGER IF EXISTS notify_admin_payout_pending ON public.payout_requests;
CREATE TRIGGER notify_admin_payout_pending AFTER INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_action_required();
DROP TRIGGER IF EXISTS notify_admin_report_pending ON public.reports;
CREATE TRIGGER notify_admin_report_pending AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_action_required();

COMMIT;
