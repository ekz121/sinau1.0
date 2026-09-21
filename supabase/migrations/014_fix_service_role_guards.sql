-- Supabase exposes current JWT claims through auth.jwt(). The legacy
-- request.jwt.claim.role setting is not populated consistently on newer
-- projects, which caused legitimate service-role updates to be reverted.

CREATE OR REPLACE FUNCTION public.is_service_role_request()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, auth
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_self_abuse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_service_role_request() THEN
    NEW.saldo_koin := OLD.saldo_koin;
    NEW.saldo_koin_topup := OLD.saldo_koin_topup;
    NEW.saldo_koin_kreator := OLD.saldo_koin_kreator;
    NEW.role := OLD.role;
    NEW.is_suspended := OLD.is_suspended;
    NEW.is_deleted := OLD.is_deleted;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_video_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_service_role_request() THEN
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

CREATE OR REPLACE FUNCTION public.protect_view_access_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_service_role_request() THEN
    NEW.video_id := OLD.video_id;
    NEW.viewer_id := OLD.viewer_id;
    NEW.has_paid_to_continue := OLD.has_paid_to_continue;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_comment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_service_role_request() THEN
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
