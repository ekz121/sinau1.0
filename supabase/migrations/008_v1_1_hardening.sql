-- ============================================================
-- Sinau Platform — Migration 008: v1.1 Hardening
-- admin_audit_log, quiz_results fixes, idempotency guards
-- ============================================================

-- ── 1. admin_audit_log: catat semua aksi sensitif admin ──────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,          -- 'approve_video','reject_video','approve_topup',
                                        -- 'reject_topup','approve_payout','reject_payout',
                                        -- 'suspend_user','unsuspend_user','soft_delete_user',
                                        -- 'promote_admin','demote_admin','update_settings'
  target_type  TEXT,                   -- 'video','user','topup_request','payout_request','settings'
  target_id    TEXT,                   -- ID target (UUID sebagai text agar fleksibel)
  note         TEXT,                   -- catatan tambahan / alasan
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query log per admin atau per target
CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.admin_audit_log(created_at DESC);

-- RLS: admin bisa SELECT; INSERT via service_role saja
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select_admin ON public.admin_audit_log;
CREATE POLICY "audit_select_admin" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- Hanya service_role yang INSERT (dari Edge Functions)
REVOKE INSERT ON public.admin_audit_log FROM anon, authenticated;

-- ── 2. quiz_results: tambah kolom is_fallback & is_video_level ─
-- is_video_level = true → satu kuis per video (di-cache, semua user pakai)
-- is_fallback = true → dibuat dari deskripsi, bukan video asli
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS is_fallback     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_video_level  BOOLEAN NOT NULL DEFAULT false;

-- Unique index untuk video-level quiz (satu per video, bukan per user)
-- user_id NULL = video-level cache
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_video_level
  ON public.quiz_results (video_id)
  WHERE is_video_level = true;

-- ── 3. process_purchase idempotency: unique index per purchase ──
-- Satu user hanya bisa beli satu video sekali (idempotency key alami)
-- Jika sudah ada unique index dari migration sebelumnya, ini idempoten
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'views'
    AND indexname = 'uq_view_per_user'
  ) THEN
    CREATE UNIQUE INDEX uq_view_per_user ON public.views(video_id, viewer_id);
  END IF;
END $$;

-- ── 4. topup_requests: unique per status+idempotency_key ────────
-- Sudah ada di 007, pastikan idempoten
CREATE UNIQUE INDEX IF NOT EXISTS uq_topup_idempotency
  ON public.topup_requests (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 5. payout_requests: cegah concurrent pending untuk user yg sama ─
-- Satu user tidak boleh punya lebih dari 1 payout pending sekaligus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payout_requests'
    AND indexname = 'uq_payout_one_pending_per_creator'
  ) THEN
    CREATE UNIQUE INDEX uq_payout_one_pending_per_creator
      ON public.payout_requests (creator_id)
      WHERE status = 'pending';
  END IF;
END $$;

-- ── 6. resolve_payout: perbarui dengan idempotency guard ────────
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
  -- Lock row untuk mencegah race condition
  SELECT * INTO v_req FROM public.payout_requests
  WHERE id = p_payout_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  -- Idempotency: jika sudah diproses, return current state
  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'current_status', v_req.status
    );
  END IF;

  IF p_action = 'ditolak' THEN
    -- Refund koin ke kreator
    UPDATE public.profiles
    SET saldo_koin = saldo_koin + v_req.jumlah_koin
    WHERE id = v_req.creator_id;

    -- Catat transaksi refund
    INSERT INTO public.transactions (user_id, type, amount_koin)
    VALUES (v_req.creator_id, 'refund', v_req.jumlah_koin);
  END IF;

  -- Update status
  UPDATE public.payout_requests
  SET
    status     = p_action,
    admin_note = p_note,
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

-- ── 7. Trigger: generate-quiz otomatis setelah video approved ──
-- Insert queue record ke tabel quiz_generation_queue
-- Edge function poll table ini atau kita trigger via DB function
CREATE TABLE IF NOT EXISTS public.quiz_generation_queue (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_queue_video
  ON public.quiz_generation_queue(video_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.quiz_generation_queue ENABLE ROW LEVEL SECURITY;
-- Hanya service_role yang bisa akses queue ini
REVOKE ALL ON public.quiz_generation_queue FROM anon, authenticated;

-- Trigger: saat video di-approve → masukkan ke antrian
CREATE OR REPLACE FUNCTION public.queue_quiz_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    INSERT INTO public.quiz_generation_queue (video_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_approved_queue_quiz ON public.videos;
CREATE TRIGGER on_video_approved_queue_quiz
  AFTER UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_quiz_generation();

-- ── 8. Index tambahan untuk performa ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON public.transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_views_video_paid ON public.views(video_id, has_paid_to_continue);
