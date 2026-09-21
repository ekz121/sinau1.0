-- The audit foreign key uses ON DELETE SET NULL, so admin_id must be nullable.
-- Keep historical actions even if an admin account is later removed.
ALTER TABLE public.admin_audit_log
  ALTER COLUMN admin_id DROP NOT NULL;
