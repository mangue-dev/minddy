-- Fetch fresh authorized identities before reusing process-local ciphertext.
-- This avoids transferring every unchanged document for each search request.
BEGIN;
CREATE FUNCTION public.page_search_cipher_fingerprints(
  p_project_id uuid DEFAULT NULL,p_offset integer DEFAULT 0,p_limit integer DEFAULT 200
) RETURNS TABLE(id uuid,project_id uuid,parent_id uuid,updated_at timestamptz,
  encryption_version integer,cipher_digest text,protected_fields_clear boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_offset IS NULL OR p_limit IS NULL OR p_offset<0 OR p_limit<1 OR p_limit>200 THEN
    RAISE EXCEPTION 'invalid_page_search_batch' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT p.id,p.project_id,p.parent_id,p.updated_at,p.encryption_version,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.encrypted_content,'UTF8')),'hex'),
    p.encryption_version=0 OR (p.title IS NULL AND p.icon IS NULL AND p.content IS NULL
      AND p.database_schema IS NULL AND p.database_title_name IS NULL
      AND p.property_values IS NULL AND p.search_text IS NULL)
    FROM public.pages p WHERE p.deleted_at IS NULL AND
      (p_project_id IS NULL OR p.project_id=p_project_id)
    ORDER BY p.id LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.page_search_cipher_fingerprints(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.page_search_cipher_fingerprints(uuid,integer,integer) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
