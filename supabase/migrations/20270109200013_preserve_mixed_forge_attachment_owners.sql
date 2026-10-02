-- A repository link and its PR can temporarily use different name formats.
-- Preserve every historical object whose PR still exists, including aliases.
BEGIN;
CREATE OR REPLACE FUNCTION public.list_forge_attachment_orphans(p_limit integer)
RETURNS TABLE(name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_forge_orphan_batch' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT o.name FROM storage.objects o
    LEFT JOIN public.forge_attachment_objects f ON f.storage_path = o.name
    WHERE o.bucket_id = 'forge-attachments'
      AND o.created_at < now() - interval '1 hour'
      AND (
        (o.name ~ '^projects/[0-9a-f-]{36}/forge/[0-9a-f-]{36}/[0-9a-f-]{36}$'
          AND f.id IS NULL)
        OR
        (o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
          AND NOT EXISTS (
            SELECT 1 FROM public.forge_attachment_legacy_pr_aliases alias
              JOIN public.pull_requests p ON p.id = alias.current_pr_id
              WHERE alias.old_pr_id::text = split_part(o.name, '/', 1)
            UNION ALL
            SELECT 1 FROM public.pull_requests p
              WHERE p.id::text = split_part(o.name, '/', 1)
          ))
      )
    ORDER BY o.created_at, o.name LIMIT p_limit;
END;
$$;
COMMIT;
