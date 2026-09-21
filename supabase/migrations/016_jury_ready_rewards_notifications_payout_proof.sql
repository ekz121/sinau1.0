BEGIN;

-- Creator reward: one blue coin for every new unique viewer/video pair.
INSERT INTO public.app_settings (key, value)
VALUES ('creator_coin_per_unique_view', '1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS related_view_id UUID REFERENCES public.views(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_earning_per_unique_view
  ON public.transactions (related_view_id)
  WHERE type = 'earning' AND related_view_id IS NOT NULL;

-- Client-side inserts are removed. Views are recorded by get-video-url through
-- a service-only RPC, preventing users from minting creator coins directly.
DROP POLICY IF EXISTS "views_insert_own" ON public.views;

CREATE OR REPLACE FUNCTION public.increment_view_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_earning_id UUID;
BEGIN
  SELECT creator_id INTO v_creator_id
  FROM public.videos
  WHERE id = NEW.video_id AND status = 'approved' AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND OR v_creator_id = NEW.viewer_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.transactions
    (user_id, type, amount_koin, platform_amount_koin, related_video_id, related_view_id, status)
  VALUES
    (v_creator_id, 'earning', 1, 0, NEW.video_id, NEW.id, 'berhasil')
  ON CONFLICT (related_view_id) WHERE type = 'earning' AND related_view_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_earning_id;

  -- Credit only when the unique reward ledger row was actually inserted.
  -- This makes a repeated trigger invocation unable to duplicate the balance.
  IF v_earning_id IS NOT NULL THEN
    UPDATE public.videos SET view_count = view_count + 1 WHERE id = NEW.video_id;
    UPDATE public.profiles
    SET saldo_koin_kreator = saldo_koin_kreator + 1
    WHERE id = v_creator_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_video_view(
  p_viewer_id UUID,
  p_video_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_view_id UUID;
BEGIN
  IF NOT public.is_active_user(p_viewer_id) THEN
    RAISE EXCEPTION 'Account inactive';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.videos
    WHERE id = p_video_id AND status = 'approved' AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Video not found or not approved';
  END IF;

  INSERT INTO public.views (video_id, viewer_id, watch_percentage)
  VALUES (p_video_id, p_viewer_id, 0)
  ON CONFLICT ON CONSTRAINT uq_view_per_user DO NOTHING
  RETURNING id INTO v_view_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_unique_view', v_view_id IS NOT NULL,
    'view_id', v_view_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_video_view(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view(UUID, UUID) TO service_role;

-- Buying full access now pays the platform coin. The creator has already
-- received exactly one blue coin when the unique view was recorded.
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

  UPDATE public.profiles
  SET saldo_koin_topup = saldo_koin_topup - v_price
  WHERE id = p_viewer_id;

  INSERT INTO public.transactions
    (user_id, type, amount_koin, platform_amount_koin, related_video_id, status)
  VALUES
    (p_viewer_id, 'purchase', v_price, v_price, p_video_id, 'berhasil');

  INSERT INTO public.views (video_id, viewer_id, has_paid_to_continue)
  VALUES (p_video_id, p_viewer_id, true)
  ON CONFLICT ON CONSTRAINT uq_view_per_user
  DO UPDATE SET has_paid_to_continue = true;

  RETURN jsonb_build_object(
    'success', true,
    'already_paid', false,
    'creator_earn', 0,
    'platform_earn', v_price,
    'topup_balance', v_topup - v_price
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) TO service_role;

-- Reliable notification read operation that only touches the authenticated
-- user's own rows.
CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_notification_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND is_read = false
    AND (p_notification_id IS NULL OR id = p_notification_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID) TO authenticated;

-- Payout completion requires a private transfer proof uploaded by the admin.
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS bukti_payout_url TEXT;

DROP FUNCTION IF EXISTS public.resolve_payout(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.resolve_payout(
  p_payout_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_bukti_payout_url TEXT DEFAULT NULL
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

  IF p_action = 'selesai' AND (
    p_bukti_payout_url IS NULL OR
    p_bukti_payout_url NOT LIKE ('payout/' || p_payout_id::TEXT || '/%')
  ) THEN
    RAISE EXCEPTION 'Payout transfer proof is required';
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
  SET status = p_action,
      admin_note = NULLIF(BTRIM(p_note), ''),
      bukti_payout_url = CASE WHEN p_action = 'selesai' THEN p_bukti_payout_url ELSE NULL END,
      processed_at = NOW()
  WHERE id = v_req.id;

  RETURN jsonb_build_object(
    'success', true, 'already_processed', false, 'action', p_action,
    'creator_id', v_req.creator_id, 'jumlah_koin', v_req.jumlah_koin,
    'bukti_payout_url', CASE WHEN p_action = 'selesai' THEN p_bukti_payout_url ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT, TEXT) TO service_role;

DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
CREATE POLICY "payment_proofs_insert_own_or_admin_payout" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'payment-proofs' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR ((storage.foldername(name))[1] = 'payout' AND public.get_my_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "payment_proofs_select_own_or_admin" ON storage.objects;
CREATE POLICY "payment_proofs_select_own_admin_or_payout_owner" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'payment-proofs' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1]
      OR public.get_my_role() = 'admin'
      OR EXISTS (
        SELECT 1 FROM public.payout_requests
        WHERE payout_requests.creator_id = auth.uid()
          AND payout_requests.bukti_payout_url = name
      )
    )
  );

DROP POLICY IF EXISTS "payment_proofs_delete_own" ON storage.objects;
CREATE POLICY "payment_proofs_delete_unreferenced" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'payment-proofs' AND (
      (
        auth.uid()::TEXT = (storage.foldername(name))[1]
        AND NOT EXISTS (
          SELECT 1 FROM public.topup_requests
          WHERE topup_requests.user_id = auth.uid()
            AND topup_requests.bukti_transfer_url = name
        )
      )
      OR (
        (storage.foldername(name))[1] = 'payout'
        AND public.get_my_role() = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM public.payout_requests
          WHERE payout_requests.bukti_payout_url = name
        )
      )
    )
  );

COMMIT;
