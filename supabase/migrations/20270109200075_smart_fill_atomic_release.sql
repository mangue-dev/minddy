-- MIN-750: take properties back from Smart Fill atomically.
--
-- A property changed by hand leaves `issue_smart_fill.fields`. Two such
-- writes on the same issue can overlap (a priority change and a category
-- change sent together); filtering the array in the application and writing
-- it back would let one release overwrite the other and leave a hand-set
-- property owned by Smart Fill. The UPDATE below locks the row, so concurrent
-- releases are serialized. A row that owns nothing anymore is deleted: no
-- pass can do anything for that issue.

CREATE FUNCTION public.release_smart_fill_fields(p_issue_id uuid, p_fields text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.issue_smart_fill AS s
     SET fields = ARRAY(
           SELECT t.field
             FROM unnest(s.fields) WITH ORDINALITY AS t(field, ord)
            WHERE t.field <> ALL (p_fields)
            ORDER BY t.ord
         )
   WHERE s.issue_id = p_issue_id
     AND s.fields && p_fields;

  DELETE FROM public.issue_smart_fill
   WHERE issue_id = p_issue_id
     AND cardinality(fields) = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.release_smart_fill_fields(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_smart_fill_fields(uuid, text[]) TO service_role;
