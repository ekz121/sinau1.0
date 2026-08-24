-- ============================================================
-- Sinau Platform — Migration 007: v1.1 Foundation Fixes
-- Menutup gap hasil audit Fase 0
-- ============================================================

-- ── 1. Pastikan get_my_role() ada (idempoten) ─────────────────
-- Fungsi ini dipanggil di 002 tapi baru dibuat di 006 — buat di sini agar idempoten
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── 2. app_settings: tambah key free_preview_seconds ─────────
INSERT INTO public.app_settings (key, value)
VALUES ('free_preview_seconds', '180')
ON CONFLICT (key) DO NOTHING;

-- ── 3. topup_requests: tambah idempotency_key ────────────────
-- Mencegah user submit topup request ganda dengan nominal yang sama
-- dalam waktu singkat (frontend retry / double-click)
ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_topup_idempotency
  ON public.topup_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 4. payout_requests: pastikan data_tujuan hanya bisa dibaca
--       oleh pemilik sendiri & admin (kolom sensitif = rekening)
-- RLS per-row sudah ada: payout_req_select_own & payout_req_select_admin
-- Tidak perlu perubahan — verifikasi policy sudah benar

-- ── 5. profiles: kolom is_deleted sudah ada di 002 & 006 (idempoten)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ── 6. videos: kolom is_deleted sudah ada di 002 (idempoten)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- ── 7. Trigger: notifikasi ke followers saat video baru approved ──
-- Ketika kreator punya video yang berubah status ke 'approved',
-- semua follower-nya mendapat notifikasi.
CREATE OR REPLACE FUNCTION public.notify_followers_new_video()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Hanya jalankan ketika status berubah dari non-approved ke approved
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, payload_json)
    SELECT
      f.follower_id,
      'new_video_from_following',
      jsonb_build_object(
        'video_id',    NEW.id,
        'judul',       NEW.judul,
        'creator_id',  NEW.creator_id,
        'thumbnail_url', NEW.thumbnail_url
      )
    FROM public.follows f
    WHERE f.creator_id = NEW.creator_id
      -- Jangan notif kreator sendiri
      AND f.follower_id != NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_approved_notify_followers ON public.videos;
CREATE TRIGGER on_video_approved_notify_followers
  AFTER UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_followers_new_video();

-- ── 8. RPC: process_purchase — baca revenue split dari app_settings ──
-- Menggantikan hardcoded 80/20 dengan nilai dari app_settings
CREATE OR REPLACE FUNCTION public.process_purchase(
  p_viewer_id UUID,
  p_video_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_id    UUID;
  v_harga_koin    INTEGER;
  v_viewer_saldo  INTEGER;
  v_split_pct     INTEGER;
  v_creator_earn  INTEGER;
BEGIN
  -- 0. Baca revenue split dari app_settings (default 80 jika tidak ada)
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

  -- 3. Check & lock viewer balance
  SELECT saldo_koin INTO v_viewer_saldo
  FROM public.profiles
  WHERE id = p_viewer_id
  FOR UPDATE;

  IF v_viewer_saldo < v_harga_koin THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_viewer_saldo, v_harga_koin;
  END IF;

  -- 4. Hitung pendapatan kreator berdasarkan split dari app_settings
  v_creator_earn := (v_harga_koin * v_split_pct) / 100;

  -- 5. Execute atomically
  UPDATE public.profiles SET saldo_koin = saldo_koin - v_harga_koin WHERE id = p_viewer_id;
  UPDATE public.profiles SET saldo_koin = saldo_koin + v_creator_earn WHERE id = v_creator_id;

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (p_viewer_id, 'purchase', v_harga_koin, p_video_id);

  INSERT INTO public.transactions (user_id, type, amount_koin, related_video_id)
  VALUES (v_creator_id, 'earning', v_creator_earn, p_video_id);

  -- 6. UPSERT view record (handles missing row gracefully)
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
    -- Handles race condition / double request (uq_purchase_once index)
    RETURN jsonb_build_object('success', true, 'message', 'Already purchased', 'already_paid', true);
END;
$$;

-- Revoke akses langsung — tetap hanya service_role yang bisa eksekusi
REVOKE EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_purchase(UUID, UUID) TO service_role;

-- ── 9. RPC: request_payout — baca min_payout & rate dari app_settings ──
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
  v_saldo        INTEGER;
  v_min_payout   INTEGER;
  v_koin_rate    INTEGER;
  v_jumlah_rupiah INTEGER;
BEGIN
  -- 0. Baca konfigurasi dari app_settings
  SELECT COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'min_payout_koin'),
    50
  ) INTO v_min_payout;

  SELECT COALESCE(
    (SELECT value::INTEGER FROM public.app_settings WHERE key = 'koin_to_rupiah_rate'),
    500
  ) INTO v_koin_rate;

  -- 1. Validasi minimum
  IF p_jumlah_koin < v_min_payout THEN
    RAISE EXCEPTION 'Minimum pencairan % koin', v_min_payout;
  END IF;

  -- 2. Cek & lock saldo kreator
  SELECT saldo_koin INTO v_saldo FROM public.profiles WHERE id = p_creator_id FOR UPDATE;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_saldo < p_jumlah_koin THEN
    RAISE EXCEPTION 'Saldo tidak cukup: punya %, butuh %', v_saldo, p_jumlah_koin;
  END IF;

  -- 3. Hitung rupiah berdasarkan rate dari app_settings
  v_jumlah_rupiah := p_jumlah_koin * v_koin_rate;

  -- 4. Kurangi saldo langsung saat request (kunci saldo)
  UPDATE public.profiles SET saldo_koin = saldo_koin - p_jumlah_koin WHERE id = p_creator_id;

  -- 5. Insert payout request
  INSERT INTO public.payout_requests (creator_id, jumlah_koin, jumlah_rupiah, data_tujuan)
  VALUES (p_creator_id, p_jumlah_koin, v_jumlah_rupiah, p_data_tujuan);

  RETURN jsonb_build_object('success', true, 'jumlah_rupiah', v_jumlah_rupiah);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(UUID, INTEGER, JSONB) TO service_role;

-- ── 10. RPC: process_topup — idempotency via topup request status ──
-- process_topup dipanggil saat admin approve → cek status request sebelum apply
-- Idempotency sudah dijaga di admin-approve-topup Edge Function (cek status != 'pending')
-- Tambahkan idempotency key support di process_topup untuk proteksi ganda
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
  v_new_balance INTEGER;
BEGIN
  -- Idempotency check: jika idempotency_key sudah dipakai di topup_requests yang selesai, return sukses
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.topup_requests
      WHERE idempotency_key = p_idempotency_key AND status = 'selesai'
    ) THEN
      SELECT saldo_koin INTO v_new_balance FROM public.profiles WHERE id = p_user_id;
      RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'already_processed', true);
    END IF;
  END IF;

  UPDATE public.profiles
  SET saldo_koin = saldo_koin + p_amount
  WHERE id = p_user_id
  RETURNING saldo_koin INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount_koin)
  VALUES (p_user_id, 'topup', p_amount);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'already_processed', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER, TEXT) TO service_role;

-- Keep backward-compat for old signature (2 args) — proxy ke 3-arg version
CREATE OR REPLACE FUNCTION public.process_topup(
  p_user_id UUID,
  p_amount  INTEGER
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.process_topup(p_user_id, p_amount, NULL);
$$;

REVOKE EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup(UUID, INTEGER) TO service_role;

-- ── 11. resolve_payout — pastikan idempoten ──────────────────
-- Sudah ada cek: IF v_req.status != 'pending' THEN RAISE EXCEPTION
-- Ini sudah idempoten — tidak ada perubahan diperlukan

-- ── 12. RLS: admin bisa SELECT semua payout_requests (sudah ada)
--         tapi views (admin perlu lihat semua untuk laporan)
CREATE POLICY "views_select_admin" ON public.views
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- ── 13. RLS: transactions — pastikan admin bisa SELECT semua ─
-- Sudah ada "transactions_select_admin" di 001, tidak ada perubahan

-- ── 14. Index tambahan ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(user_id, type);
CREATE INDEX IF NOT EXISTS idx_follows_both ON public.follows(follower_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_topup_idempotency ON public.topup_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

