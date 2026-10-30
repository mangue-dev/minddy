-- MIN-874: a call made with a member's personal key (BYOK) is paid by the
-- member, so minddy no longer records it. recordAiUsage drops these calls;
-- this removes the ones already in the ledger, so the instance's cost
-- dashboard and its exports stop showing them.
--
-- Every quota, routine cap and Numo operation spend already reads
-- key_mode = 'platform' only, so no limit changes. The key_mode CHECK keeps
-- accepting 'byok': the previous release still writes such rows until the new
-- code is live, and this migration only clears what it left behind.
DELETE FROM public.ai_usage WHERE key_mode = 'byok';
