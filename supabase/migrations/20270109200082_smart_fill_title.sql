-- MIN-798: Smart Fill may write the title of an issue whose author left it
-- empty. Like the four other properties, a title it wrote is listed in
-- `issue_smart_fill.fields` until someone edits it by hand, so a later
-- re-evaluation may rewrite it. Widening the CHECK is compatible with the
-- previous release, which never writes `title`.

ALTER TABLE public.issue_smart_fill
  DROP CONSTRAINT issue_smart_fill_fields_ck;

ALTER TABLE public.issue_smart_fill
  ADD CONSTRAINT issue_smart_fill_fields_ck CHECK (
    fields <@ ARRAY['priority', 'effort', 'category_ids', 'objective_id', 'title']::text[]
  );
