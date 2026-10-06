-- MIN-637: remove the profile directory and its per-account activity scans.
DROP FUNCTION public.get_admin_users_overview(text, integer, integer);

CREATE FUNCTION public.get_admin_account(p_email text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, email text, name text, is_internal boolean, email_confirmed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.email::text,
    coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
             nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data->>'name'), '')),
    coalesce(u.raw_app_meta_data->>'internal', '') = 'true',
    u.email_confirmed_at IS NOT NULL
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND ((p_user_id IS NULL AND nullif(btrim(p_email), '') IS NOT NULL
          AND lower(u.email) = lower(btrim(p_email)))
      OR (p_email IS NULL AND p_user_id IS NOT NULL AND u.id = p_user_id))
  ORDER BY u.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_admin_account(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_account(text, uuid) TO service_role;

-- Preserve onboarding semantics with existence checks instead of content counts.
-- Only the metadata keys consumed by the shared resolver leave the database.
CREATE FUNCTION public.get_admin_onboarding_signals(p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
RETURNS TABLE(user_id uuid, is_internal boolean, meta jsonb, has_project boolean, has_issue boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH page AS (
    SELECT u.id, u.raw_user_meta_data,
      coalesce(u.raw_app_meta_data->>'internal', '') = 'true' AS internal
    FROM auth.users u
    WHERE u.deleted_at IS NULL
    ORDER BY u.id
    LIMIT greatest(0, least(coalesce(p_limit, 500), 500))
    OFFSET greatest(0, coalesce(p_offset, 0))
  )
  SELECT p.id, p.internal,
    CASE WHEN p.internal THEN '{}'::jsonb ELSE jsonb_strip_nulls(jsonb_build_object(
      'onboarding_started', p.raw_user_meta_data->'onboarding_started',
      'onboarding_steps', p.raw_user_meta_data->'onboarding_steps',
      'onboarding_dismissed', p.raw_user_meta_data->'onboarding_dismissed',
      'onboarding_version', p.raw_user_meta_data->'onboarding_version',
      'cycles_enabled', p.raw_user_meta_data->'cycles_enabled'
    )) END,
    CASE WHEN p.internal THEN false ELSE
      EXISTS (SELECT 1 FROM public.projects pr WHERE pr.deleted_at IS NULL AND pr.owner_id = p.id)
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        JOIN public.projects pr ON pr.id = pm.project_id AND pr.deleted_at IS NULL
        WHERE pm.user_id = p.id
      ) END,
    CASE WHEN p.internal THEN false ELSE
      EXISTS (
        SELECT 1 FROM public.projects pr
        JOIN public.issues i ON i.project_id = pr.id
        WHERE pr.deleted_at IS NULL AND pr.owner_id = p.id
      ) OR EXISTS (
        SELECT 1 FROM public.project_members pm
        JOIN public.projects pr ON pr.id = pm.project_id AND pr.deleted_at IS NULL
        JOIN public.issues i ON i.project_id = pr.id
        WHERE pm.user_id = p.id
      ) END
  FROM page p ORDER BY p.id;
$$;
REVOKE ALL ON FUNCTION public.get_admin_onboarding_signals(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_onboarding_signals(integer, integer) TO service_role;
