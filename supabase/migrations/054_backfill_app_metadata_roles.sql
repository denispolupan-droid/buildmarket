-- ============================================================================
-- 054  Security hardening — backfill role/account_type into app_metadata
-- ============================================================================
-- Phase 2 (KRIT-1): move the trust root for role/account_type from the
-- self-writable user_metadata to the server-only app_metadata.
--
-- This migration is ADDITIVE and safe to run before the code switch: it only
-- copies existing values into app_metadata; nothing yet reads app_metadata, and
-- user_metadata is left intact so current admin sessions keep working until the
-- application code is deployed. The guard trigger + user_metadata cleanup lives
-- in a separate migration applied AFTER the code deploy.
-- ============================================================================
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
       'role',         raw_user_meta_data ->> 'role',
       'account_type', raw_user_meta_data ->> 'account_type'
     ))
WHERE raw_user_meta_data ? 'role'
   OR raw_user_meta_data ? 'account_type';
