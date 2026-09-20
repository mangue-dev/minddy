-- MIN-513: extend issue relations to objectives.
--
-- Until now `issue_relations` could only pair two issues (its endpoints were
-- FK'd to `issues`). Relations now also support objective endpoints
-- (issue↔objective, objective↔issue, objective↔objective) with the same three
-- perspectives: `blocks` / `blocked_by` (an inverted `blocks` edge) / `related`.
--
-- The endpoints become polymorphic: two explicit kind columns replace the FK
-- constraints, and the same-project / existence validation moves into the
-- `enforce_issue_relation` trigger. Existing rows backfill to 'issue' (the
-- column default), so nothing changes for them.

ALTER TABLE "public"."issue_relations"
    ADD COLUMN IF NOT EXISTS "source_type" "text" DEFAULT 'issue' NOT NULL,
    ADD COLUMN IF NOT EXISTS "target_type" "text" DEFAULT 'issue' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issue_relations_endpoint_type_check'
  ) THEN
    ALTER TABLE "public"."issue_relations"
        ADD CONSTRAINT "issue_relations_endpoint_type_check" CHECK (
            "source_type" = ANY (ARRAY['issue'::text, 'objective'::text])
            AND "target_type" = ANY (ARRAY['issue'::text, 'objective'::text])
        );
  END IF;
END $$;

-- A polymorphic endpoint cannot be enforced by a plain FK anymore: the FKs on
-- source_id / target_id are dropped, and cascade-on-hard-delete is replaced by
-- explicit purge triggers below (trashed — soft-deleted — endpoints keep their
-- relation rows, exactly as before).
ALTER TABLE "public"."issue_relations" DROP CONSTRAINT IF EXISTS "issue_relations_source_id_fkey";
ALTER TABLE "public"."issue_relations" DROP CONSTRAINT IF EXISTS "issue_relations_target_id_fkey";

-- Hard deletes of an issue or an objective (purge from trash) take their
-- relation rows with them — the FK ON DELETE CASCADE used to do this.
CREATE OR REPLACE FUNCTION "public"."purge_issue_relations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.issue_relations r
  where r.source_id = old.id or r.target_id = old.id;
  return old;
end;
$$;

DROP TRIGGER IF EXISTS "issues_purge_relations" ON "public"."issues";
CREATE TRIGGER "issues_purge_relations" AFTER DELETE ON "public"."issues"
    FOR EACH ROW EXECUTE FUNCTION "public"."purge_issue_relations"();

DROP TRIGGER IF EXISTS "objectives_purge_relations" ON "public"."objectives";
CREATE TRIGGER "objectives_purge_relations" AFTER DELETE ON "public"."objectives"
    FOR EACH ROW EXECUTE FUNCTION "public"."purge_issue_relations"();

-- The endpoint validation moves here: each endpoint must exist — as an issue
-- or an objective, matching its declared kind — in the relation's project. The
-- `related` canonicalization now swaps the kind columns along with the ids.
CREATE OR REPLACE FUNCTION "public"."enforce_issue_relation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  tmp uuid;
  tmp_type text;
begin
  if new.source_type not in ('issue', 'objective') then
    raise exception 'The relationship source kind must be issue or objective';
  end if;
  if new.target_type not in ('issue', 'objective') then
    raise exception 'The relationship target kind must be issue or objective';
  end if;

  if new.source_type = 'issue' then
    if not exists (
      select 1 from public.issues i
      where i.id = new.source_id and i.project_id = new.project_id
        and i.deleted_at is null
    ) then
      raise exception 'The source of the relationship must be in the same project';
    end if;
  elsif not exists (
    select 1 from public.objectives o
    where o.id = new.source_id and o.project_id = new.project_id
      and o.deleted_at is null
  ) then
    raise exception 'The source objective of the relationship must be in the same project';
  end if;

  if new.target_type = 'issue' then
    if not exists (
      select 1 from public.issues i
      where i.id = new.target_id and i.project_id = new.project_id
        and i.deleted_at is null
    ) then
      raise exception 'The relationship target must be in the same project';
    end if;
  elsif not exists (
    select 1 from public.objectives o
    where o.id = new.target_id and o.project_id = new.project_id
      and o.deleted_at is null
  ) then
    raise exception 'The relationship target objective must be in the same project';
  end if;

  if new.type = 'related' and new.source_id > new.target_id then
    tmp := new.source_id;
    tmp_type := new.source_type;
    new.source_id := new.target_id;
    new.source_type := new.target_type;
    new.target_id := tmp;
    new.target_type := tmp_type;
  end if;
  return new;
end;
$$;

GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."purge_issue_relations"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_issue_relations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_issue_relations"() TO "service_role";
