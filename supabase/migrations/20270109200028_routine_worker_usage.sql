-- Repair delegated search attribution and read occurrence totals from the ledger.
BEGIN;

-- Older worker searches carried only their run id, so the parent's shared cap
-- and the routine segment could not see them. Preserve every charge and identity.
UPDATE public.ai_usage AS usage
SET numo_turn_id = COALESCE(usage.numo_turn_id, run.parent_numo_turn_id),
    conversation_id = COALESCE(run.parent_numo_conversation_id, usage.conversation_id),
    routine_id = COALESCE(usage.routine_id, run.routine_id)
FROM public.agent_runs AS run
WHERE usage.run_id = COALESCE(run.run_id, run.id)
  AND run.parent_numo_turn_id IS NOT NULL
  AND (usage.numo_turn_id IS NULL OR usage.routine_id IS DISTINCT FROM run.routine_id);

-- The occurrence owns routine attribution even when a historic caller omitted it.
UPDATE public.ai_usage AS usage
SET routine_id = occurrence.routine_id
FROM public.numo_assistant_turns AS turn
JOIN public.numo_routine_occurrences AS occurrence
  ON occurrence.conversation_id = turn.conversation_id
WHERE usage.numo_turn_id = turn.id
  AND usage.routine_id IS DISTINCT FROM occurrence.routine_id;

UPDATE public.ai_usage
SET feature = CASE WHEN feature = 'sandbox_compute' THEN 'routine_compute'
                  ELSE 'routine_code' END
WHERE routine_id IS NOT NULL
  AND feature IN ('agent_code', 'numo_chat', 'web_search', 'sandbox_compute');

-- Aggregate inside PostgreSQL: row-limited API reads can undercount a long run.
-- Include all turns of a resumed occurrence and keep BYOK out of included usage.
CREATE OR REPLACE FUNCTION public.get_numo_routine_occurrence_spend(
  p_conversation_ids uuid[]
) RETURNS TABLE (conversation_id uuid, total_cost numeric, platform_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT occurrence.conversation_id,
         COALESCE(SUM(usage.cost), 0) AS total_cost,
         COALESCE(SUM(usage.cost) FILTER (WHERE usage.key_mode = 'platform'), 0) AS platform_cost
  FROM public.numo_routine_occurrences AS occurrence
  LEFT JOIN public.numo_assistant_turns AS turn
    ON turn.conversation_id = occurrence.conversation_id
  LEFT JOIN public.ai_usage AS usage ON usage.numo_turn_id = turn.id
  WHERE occurrence.conversation_id = ANY(p_conversation_ids)
  GROUP BY occurrence.conversation_id;
$$;
REVOKE ALL ON FUNCTION public.get_numo_routine_occurrence_spend(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_numo_routine_occurrence_spend(uuid[]) TO service_role;

COMMIT;
