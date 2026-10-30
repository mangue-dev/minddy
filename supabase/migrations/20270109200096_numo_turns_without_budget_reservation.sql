-- MIN-869: a Numo turn no longer reserves part of the account's AI budget.
-- Each billed account calls OpenRouter with its own key, capped at what its
-- plan still includes, so the cap holds across concurrent conversations
-- without a per-turn allowance. The reservation only refused work: one live
-- turn held the whole remaining budget and every other conversation failed
-- with usage_budget_reserved.
--
-- The application admits every turn with begin_numo_turn. The account
-- pre-flight and each routine's spend cap still apply. Until the new code is
-- live, the previous release's managed Numo admission fails on the missing
-- function; that window is accepted for this release.
BEGIN;

DROP FUNCTION IF EXISTS public.begin_numo_turn_with_budget(uuid, uuid, uuid, uuid, jsonb, text, text, uuid, integer, text, jsonb, jsonb, timestamp with time zone, numeric, numeric);
-- Its only caller was begin_numo_turn_with_budget.
DROP FUNCTION IF EXISTS public.concurrent_managed_budget_grant(numeric, numeric);
-- Read only by the per-turn allocation check the application no longer runs.
DROP FUNCTION IF EXISTS public.get_numo_operation_platform_spend(uuid);
-- Also removes numo_assistant_turns_managed_budget_non_negative.
ALTER TABLE public.numo_assistant_turns DROP COLUMN IF EXISTS managed_budget_usd;

COMMIT;
