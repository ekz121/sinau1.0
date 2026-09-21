-- ============================================================
-- Sinau Platform — Migration 003: Top-up QRIS & Payout
-- ============================================================

-- ── app_settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO public.app_settings (key, value) VALUES ('qris_image_url', '') ON CONFLICT DO NOTHING;

-- ── topup_requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.topup_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  jumlah_koin         INTEGER NOT NULL CHECK (jumlah_koin > 0),
  jumlah_rupiah       INTEGER NOT NULL,
  bukti_transfer_url  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'selesai', 'ditolak')),
  admin_note          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ
);

-- ── payout_requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  jumlah_koin   INTEGER NOT NULL CHECK (jumlah_koin > 0),
  jumlah_rupiah INTEGER NOT NULL,
  data_tujuan   JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'selesai', 'ditolak')),
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.app_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- app_settings: semua authenticated bisa baca
CREATE POLICY "app_settings_select" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_admin" ON public.app_settings
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

-- topup_requests
CREATE POLICY "topup_req_select_own" ON public.topup_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "topup_req_insert_own" ON public.topup_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "topup_req_select_admin" ON public.topup_requests
  FOR SELECT TO authenticated USING (public.get_my_role() = 'admin');
CREATE POLICY "topup_req_update_admin" ON public.topup_requests
  FOR UPDATE TO authenticated USING (public.get_my_role() = 'admin');

-- payout_requests
CREATE POLICY "payout_req_select_own" ON public.payout_requests
  FOR SELECT TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "payout_req_insert_own" ON public.payout_requests
  FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "payout_req_select_admin" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.get_my_role() = 'admin');
CREATE POLICY "payout_req_update_admin" ON public.payout_requests
  FOR UPDATE TO authenticated USING (public.get_my_role() = 'admin');

-- ── RPC: request_payout (kunci saldo atomic) ─────────────────
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
  v_saldo INTEGER;
BEGIN
  SELECT saldo_koin INTO v_saldo FROM public.profiles WHERE id = p_creator_id FOR UPDATE;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_saldo < p_jumlah_koin THEN RAISE EXCEPTION 'Saldo tidak cukup: punya %, butuh %', v_saldo, p_jumlah_koin; END IF;
  IF p_jumlah_koin < 50 THEN RAISE EXCEPTION 'Minimum pencairan 50 koin'; END IF;

  UPDATE public.profiles SET saldo_koin = saldo_koin - p_jumlah_koin WHERE id = p_creator_id;

  INSERT INTO public.payout_requests (creator_id, jumlah_koin, jumlah_rupiah, data_tujuan)
  VALUES (p_creator_id, p_jumlah_koin, p_jumlah_koin * 500, p_data_tujuan);

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) TO service_role;

-- ── RPC: resolve_payout (admin approve/reject) ────────────────
CREATE OR REPLACE FUNCTION public.resolve_payout(
  p_payout_id UUID,
  p_action    TEXT,
  p_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req public.payout_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status != 'pending' THEN RAISE EXCEPTION 'Request already processed'; END IF;

  IF p_action = 'selesai' THEN
    UPDATE public.payout_requests SET status = 'selesai', admin_note = p_note, processed_at = NOW() WHERE id = p_payout_id;
  ELSIF p_action = 'ditolak' THEN
    UPDATE public.payout_requests SET status = 'ditolak', admin_note = p_note, processed_at = NOW() WHERE id = p_payout_id;
    -- Refund koin
    UPDATE public.profiles SET saldo_koin = saldo_koin + v_req.jumlah_koin WHERE id = v_req.creator_id;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payout(UUID, TEXT, TEXT) TO service_role;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_topup_req_user   ON public.topup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_req_status ON public.topup_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_req_creator ON public.payout_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_payout_req_status  ON public.payout_requests(status);
