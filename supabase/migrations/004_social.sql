-- ============================================================
-- Sinau Platform — Migration 004: Komentar, Likes, Follows, Notifikasi
-- ============================================================

-- ── comments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content           TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_video ON public.comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_comment_id);

-- ── video_likes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_like_per_user UNIQUE (video_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_video ON public.video_likes(video_id);

-- ── follows ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_follow UNIQUE (follower_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_creator ON public.follows(creator_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);

-- ── notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  payload_json JSONB,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- comments
CREATE POLICY "comments_select" ON public.comments FOR SELECT TO authenticated USING (is_deleted = false);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_active_user(auth.uid()));
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "comments_update_admin" ON public.comments FOR UPDATE TO authenticated USING (public.get_my_role() = 'admin');

-- video_likes
CREATE POLICY "likes_select" ON public.video_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "likes_insert" ON public.video_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "likes_update" ON public.video_likes FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "likes_delete" ON public.video_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- follows
CREATE POLICY "follows_select" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete" ON public.follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- notifications
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ── Trigger: notifikasi saat video approved/rejected ─────────
CREATE OR REPLACE FUNCTION public.notify_video_moderated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.notifications (user_id, type, payload_json)
    VALUES (
      NEW.creator_id,
      'video_moderated',
      jsonb_build_object('video_id', NEW.id, 'judul', NEW.judul, 'status', NEW.status, 'rejection_note', NEW.rejection_note)
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_video_moderated ON public.videos;
CREATE TRIGGER on_video_moderated AFTER UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.notify_video_moderated();

-- ── Trigger: notifikasi saat ada komentar baru ───────────────
CREATE OR REPLACE FUNCTION public.notify_new_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_creator_id   UUID;
  v_video_judul  TEXT;
  v_parent_user  UUID;
BEGIN
  SELECT creator_id, judul INTO v_creator_id, v_video_judul FROM public.videos WHERE id = NEW.video_id;
  IF v_creator_id IS NOT NULL AND v_creator_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, payload_json)
    VALUES (v_creator_id, 'new_comment', jsonb_build_object('video_id', NEW.video_id, 'judul', v_video_judul, 'comment_id', NEW.id));
  END IF;
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO v_parent_user FROM public.comments WHERE id = NEW.parent_comment_id;
    IF v_parent_user IS NOT NULL AND v_parent_user != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, payload_json)
      VALUES (v_parent_user, 'comment_reply', jsonb_build_object('video_id', NEW.video_id, 'comment_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_new_comment ON public.comments;
CREATE TRIGGER on_new_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_new_comment();
