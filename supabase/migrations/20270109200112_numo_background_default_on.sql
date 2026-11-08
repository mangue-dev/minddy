-- Background Numo is on by default. Until now a member heard about workspace
-- events only once they had turned "Numo in the background" on
-- (`numo_background = 'true'` in user_metadata). Now every member hears them
-- unless they turned it off (`'false'`). The other conditions are unchanged:
-- not the event's actor, Numo's memory on, and active in the last 30 days.
-- `lib/numo-background.ts` reads the switch the same way.
--
-- The body of 20270109200103, with that one condition changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.numo_event_recipients(p_project_id uuid, p_actor_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT account.id FROM (
    SELECT owner_id AS user_id FROM public.projects WHERE id=p_project_id AND deleted_at IS NULL
    UNION
    SELECT m.user_id FROM public.project_members m JOIN public.projects p ON p.id=m.project_id
      WHERE m.project_id=p_project_id AND p.deleted_at IS NULL
  ) member
  JOIN auth.users account ON account.id=member.user_id
  WHERE account.id IS DISTINCT FROM p_actor_id
    AND account.deleted_at IS NULL
    AND COALESCE(account.raw_user_meta_data->>'numo_memory','true')<>'false'
    AND COALESCE(account.raw_user_meta_data->>'numo_background','true')<>'false'
    AND (account.last_sign_in_at>=now()-interval '30 days' OR EXISTS(
      SELECT 1 FROM auth.sessions s WHERE s.user_id=account.id
        AND GREATEST(s.created_at,s.updated_at,s.refreshed_at::timestamptz)>=now()-interval '30 days'))
$$;
REVOKE ALL ON FUNCTION public.numo_event_recipients(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.numo_event_recipients(uuid,uuid) TO service_role;

COMMIT;
