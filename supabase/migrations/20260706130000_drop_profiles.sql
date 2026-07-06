-- minddy — remove the `profiles` mirror table.
--
-- User display names and email→account resolution now read LIVE from Supabase
-- Auth (auth.users) via the admin API — see lib/server/auth-users.ts. The mirror
-- (table + sync trigger + upsert function) created in 20260704130000_profiles.sql
-- is no longer needed.
--
-- NOTE: the `project_invitations` realtime publication added alongside the table
-- in that same migration is INDEPENDENT and intentionally left in place (the
-- invitee's Home banner live-updates depend on it). Idempotent — safe to re-run.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_auth_user_upsert();
drop table if exists public.profiles;
