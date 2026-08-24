-- ============================================================
-- Sinau Platform — Migration 009: Coin Separation & Storage Infrastructure
-- Separates Top-Up Coins and Creator Blue Coins (saldo_koin_kreator)
-- ============================================================

-- ── 1. Add coin separation columns to profiles ───────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS saldo_koin_topup   INTEGER NOT NULL DEFAULT 0 CHECK (saldo_koin_topup >= 0),
  ADD COLUMN IF NOT EXISTS saldo_koin_kreator INTEGER NOT NULL DEFAULT 0 CHECK (saldo_koin_kreator >= 0);

-- Migrate existing total saldo_koin to saldo_koin_topup (if new columns are still 0)
UPDATE public.profiles
SET saldo_koin_topup = saldo_koin
WHERE saldo_koin > 0 AND saldo_koin_topup = 0 AND saldo_koin_kreator = 0;

-- ── 2. Trigger to sync total saldo_koin ──────────────────────
-- Keeps total saldo_koin = saldo_koin_topup + saldo_koin_kreator for backward compatibility
CREATE OR REPLACE FUNCTION public.sync_total_saldo_koin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.saldo_koin := COALESCE(NEW.saldo_koin_topup, 0) + COALESCE(NEW.saldo_koin_kreator, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_total_saldo_koin ON public.profiles;
CREATE TRIGGER tr_sync_total_saldo_koin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_total_saldo_koin();

-- ── 3. Guard profile sensitive fields ─────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_self_abuse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    -- Block direct modifications to balance, role, suspension status
    IF NEW.saldo_koin IS DISTINCT FROM OLD.saldo_koin OR
       NEW.saldo_koin_topup IS DISTINCT FROM OLD.saldo_koin_topup OR
       NEW.saldo_koin_kreator IS DISTINCT FROM OLD.saldo_koin_kreator THEN
      NEW.saldo_koin := OLD.saldo_koin;
      NEW.saldo_koin_topup := OLD.saldo_koin_topup;
      NEW.saldo_koin_kreator := OLD.saldo_koin_kreator;
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      NEW.is_suspended := OLD.is_suspended;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_self_abuse();

-- ── 4. RPC: process_topup (credits topup coins) ───────────────
CREATE OR REPLACE FUNCTION public.process_topup(
  p_user_id         UUID,
  p_amount          INTEGER,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_topup   INTEGER;
  v_new_total   INTEGER;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.topup_requests
      WHERE idempotency_key = p_idempotency_key AND status = 'selesai'
    ) THEN
      SELECT saldo_koin INTO v_new_total FROM public.profiles WHERE id = p_user_id;
      RETURN jsonb_build_object('success', true, 'new_balance', v_new_total, 'already_processed', true);
    END IF;
  END IF;

  UPDATE public.profiles
  SET saldo_koin_topup = saldo_koin_topup + p_amount
  WHERE id = p_user_id
  RETURNING saldo_koin_topup, saldo_koin INTO v_new_topup, v_new_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount_koin)
  VALUES (p_user_id, 'topup', p_amount);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_total, 'topup_balance', v_new_topup, 'already_processed', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER, TEXT) TO service_role;

-- ── 5. RPC: process_purchase (deducts viewer coins, credits creator blue coins) ──
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_viewer_id UUID,
  p_video_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_id     UUID;
  v_harga_koin     INTEGER;
  v_viewer_topup   INTEGER;
  v_viewer_kreator INTEGER;
  v_total_viewer   INTEGER;
  v_split_pct      INTEGER;
  v_creator_earn   INTEGER;
  v_deduct_topup   INTEGER := 0;
  v_deduct_kreator INTEGER := 0;
BEGIN
  -- 0. Read split percentage from app_settings (default 80)
  SELECT COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'revenue_split_creator'),
    80
  ) INTO v_split_pct;

  -- 1. Get video info + lock row
  SELECT creator_id, harga_koin INTO v_creator_id, v_harga_koin
  FROM public.videos
  WHERE id = p_video_id AND status = 'approved' AND is_deleted = false
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Video not found or not approved';
  END IF;

  -- 2. Self-purchase check
  IF p_viewer_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot purchase own video';
  END IF;

  -- 3. Check & lock viewer balances
  SELECT saldo_koin_topup, saldo_koin_kreator INTO v_viewer_topup, v_viewer_kreator
  FROM public.profiles
  WHERE id = p_viewer_id
  FOR UPDATE;

  v_total_viewer := COALESCE(v_viewer_topup, 0) + COALESCE(v_viewer_kreator, 0);

  IF v_total_viewer < v_harga_koin THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_total_viewer, v_harga_koin;
  END IF;

  -- Calculate deduction (prefer deducting topup coins first, then creator coins)
  IF v_viewer_topup >= v_harga_koin THEN
    v_deduct_topup := v_harga_koin;
    v_deduct_kreator := 0;
  ELSE
    v_deduct_topup := v_viewer_topup;
    v_deduct_kreator := v_harga_koin - v_viewer_topup;
  END IF;

  -- 4. Calculate creator earnings
  v_creator_earn := (v_harga_koin * v_split_pct) / 100;

  -- 5. Execute atomic updates
  UPDATE public.profiles
  SET
    saldo_koin_topup   = saldo_koin_topup - v_deduct_topup,
    saldo_koin_kreator = saldo_koin_kreator - v_deduct_kreator
  WHERE id = p_viewer_id;

  -- Creator ONLY gets credited to saldo_koin_kreator (Koin Biru)
  UPDATE public.profiles
  SET saldo_koin_kreator = saldo_koin_kreator + v_creator_earn
  WHERE id = v_creator_id;

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (p_viewer_id, 'purchase', v_harga_koin, p_video_id);

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (v_creator_id, 'earning', v_creator_earn, p_video_id);

  -- 6. Upsert view access record
  INSERT INTO public.views (video_id, viewer_id, has_paid_to_continue)
  VALUES (p_video_id, p_viewer_id, true)
  ON CONFLICT ON CONSTRAINT uq_view_per_user
  DO UPDATE SET has_paid_to_continue = true;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Purchase completed',
    'already_paid', false,
    'creator_earn', v_creator_earn,
    'split_pct', v_split_pct
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already purchased', 'already_paid', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) TO service_role;

-- ── 6. RPC: request_payout (only allows payout from saldo_koin_kreator) ──
CREATE OR REPLACE FUNCTION public.request_payout(
  p_creator_id  UUID,
  p_jumlah_koin INTEGER,
  p_data_tujuan JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_kreator  INTEGER;
  v_min_payout     INTEGER;
  v_koin_rate      INTEGER;
  v_jumlah_rupiah   INTEGER;
BEGIN
  -- Read settings
  SELECT COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'min_payout_koin'),
    50
  ) INTO v_min_payout;

  SELECT COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'koin_to_rupiah_rate'),
    500
  ) INTO v_koin_rate;

  IF p_jumlah_koin < v_min_payout THEN
    RAISE EXCEPTION 'Minimum pencairan % koin', v_min_payout;
  END IF;

  -- Lock & check ONLY saldo_koin_kreator (Koin Biru)
  SELECT saldo_koin_kreator INTO v_saldo_kreator
  FROM public.profiles
  WHERE id = p_creator_id
  FOR UPDATE;

  IF v_saldo_kreator IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_saldo_kreator < p_jumlah_koin THEN
    RAISE EXCEPTION 'Saldo koin pendapatan kreator (koin biru) tidak cukup: punya %, butuh %', v_saldo_kreator, p_jumlah_koin;
  END IF;

  v_jumlah_rupiah := p_jumlah_koin * v_koin_rate;

  -- Deduct ONLY from saldo_koin_kreator
  UPDATE public.profiles
  SET saldo_koin_kreator = saldo_koin_kreator - p_jumlah_koin
  WHERE id = p_creator_id;

  INSERT INTO public.payout_requests (creator_id, jumlah_koin, jumlah_rupiah, data_tujuan)
  VALUES (p_creator_id, p_jumlah_koin, v_jumlah_rupiah, p_data_tujuan);

  RETURN jsonb_build_object('success', true, 'jumlah_rupiah', v_jumlah_rupiah);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) TO service_role;

-- ── 7. RPC: resolve_payout (refunds to saldo_koin_kreator on rejection) ──
CREATE OR REPLACE FUNCTION public.resolve_payout(
  p_payout_id UUID,
  p_action    TEXT,   -- 'selesai' | 'ditolak'
  p_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req public.payout_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.payout_requests
  WHERE id = p_payout_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'current_status', v_req.status
    );
  END IF;

  IF p_action = 'ditolak' THEN
    -- Refund to creator blue coin balance
    UPDATE public.profiles
    SET saldo_koin_kreator = saldo_koin_kreator + v_req.jumlah_koin
    WHERE id = v_req.creator_id;

    INSERT INTO public.transactions (user_id, type, amount_koin)
    VALUES (v_req.creator_id, 'refund', v_req.jumlah_koin);
  END IF;

  UPDATE public.payout_requests
  SET
    status       = p_action,
    admin_note   = p_note,
    processed_at = NOW()
  WHERE id = p_payout_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'action', p_action
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) TO service_role;
