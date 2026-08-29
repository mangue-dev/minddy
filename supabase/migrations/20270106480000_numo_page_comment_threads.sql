-- Give page comments the same durable Numo lifecycle as issue, objective, and
-- feedback comments. The generated text still streams over Realtime; these
-- columns only preserve working/tool/final/error state for reconnecting clients.
ALTER TABLE public.page_comments
  ADD COLUMN IF NOT EXISTS assistant_status text,
  ADD COLUMN IF NOT EXISTS assistant_tool text;

ALTER TABLE public.page_comments
  DROP CONSTRAINT IF EXISTS page_comments_assistant_status_check;
ALTER TABLE public.page_comments
  ADD CONSTRAINT page_comments_assistant_status_check
  CHECK (assistant_status = ANY (ARRAY['working'::text, 'done'::text, 'error'::text]));

-- A live Numo topic can now belong to either comment table. Resolve the page
-- project directly when the id is not present in the shared comments table.
CREATE OR REPLACE FUNCTION public.can_watch_numo_comment(topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  cid uuid;
  pid uuid;
  c record;
begin
  begin
    cid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;

  select issue_id, objective_id, feedback_post_id into c
    from public.comments where id = cid;
  if found then
    if c.issue_id is not null then
      select project_id into pid from public.issues where id = c.issue_id;
    elsif c.objective_id is not null then
      select project_id into pid from public.objectives where id = c.objective_id;
    elsif c.feedback_post_id is not null then
      select project_id into pid from public.feedback_posts where id = c.feedback_post_id;
    end if;
  else
    select project_id into pid from public.page_comments where id = cid;
  end if;

  if pid is null then
    return false;
  end if;
  return public.can_access_project(pid);
end;
$$;
