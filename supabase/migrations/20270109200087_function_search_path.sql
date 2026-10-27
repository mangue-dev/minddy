-- MIN-823: the Supabase linter (lint 0011) reported a mutable search_path on
-- `search_pages` and `topic_uuid`. Both are SECURITY INVOKER, so a caller
-- could only redirect them to objects it can already reach, but a pinned path
-- removes the question. Their bodies already qualify `public.pages` and only
-- use built-ins, which resolve through pg_catalog even with an empty path.

ALTER FUNCTION public.search_pages(text, uuid, integer) SET search_path = '';
ALTER FUNCTION public.topic_uuid(text) SET search_path = '';
