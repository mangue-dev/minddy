-- Keep equal-score page ordering consistent with protected in-memory search.
BEGIN;
CREATE OR REPLACE FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "project_id" "uuid", "parent_id" "uuid", "title" "text", "icon" "text", "updated_at" timestamp with time zone, "excerpt" "text", "rank" real)
    LANGUAGE "sql" STABLE
    AS $$
  with q as (select websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq)
  select
    p.id,
    p.project_id,
    p.parent_id,
    p.title,
    p.icon,
    p.updated_at,
    -- Without highlight tag: the excerpt is read in a palette line and
    -- in a tool result, two surfaces that do not render HTML.
    ts_headline(
      'simple',
      p.search_text,
      q.tsq,
      'StartSel="", StopSel="", MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
    ) as excerpt,
    ts_rank_cd(p.search_tsv, q.tsq) as rank
  from public.pages p, q
  where p.deleted_at is null
    and (p_project_id is null or p.project_id = p_project_id)
    and p.search_tsv @@ q.tsq
  order by rank desc, p.updated_at desc, p.id asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;


COMMIT;
