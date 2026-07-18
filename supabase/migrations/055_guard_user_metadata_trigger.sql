-- ============================================================================
-- 055  Security hardening — guard trigger on auth.users  (APPLY AFTER CODE DEPLOY)
-- ============================================================================
-- Defense-in-depth for KRIT-1. MUST be applied only after the app code that
-- reads role/account_type from app_metadata is live in prod — otherwise
-- stripping user_metadata.role would lock out admins whose running code still
-- reads user_metadata.
--
--   * role         — never allowed to live in the self-writable user_metadata;
--                    stripped on every insert/update. Role is set exclusively in
--                    app_metadata via the service-role admin API.
--   * account_type — on signup only, the user-chosen value is promoted into the
--                    server-controlled app_metadata; later user_metadata edits
--                    are ignored (not re-promoted), closing the escalation path.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_user_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- role must never be readable from user_metadata
  IF NEW.raw_user_meta_data ? 'role' THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'role';
  END IF;

  -- promote the signup-time account_type choice into server-only app_metadata
  IF TG_OP = 'INSERT' AND NEW.raw_user_meta_data ? 'account_type' THEN
    NEW.raw_app_meta_data := coalesce(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('account_type', NEW.raw_user_meta_data ->> 'account_type');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_user_metadata ON auth.users;
CREATE TRIGGER trg_guard_user_metadata
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_metadata();

-- One-time cleanup: drop the now-ignored role key from existing user_metadata.
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'role'
WHERE raw_user_meta_data ? 'role';
