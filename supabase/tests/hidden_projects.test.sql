-- MIN-692: hiding a project is private to the user who hid it and requires
-- access to the project. Run against an isolated database with the migrations
-- applied; everything is rolled back.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('69200000-0000-4000-8000-000000000001', 'hide-owner@example.test'),
  ('69200000-0000-4000-8000-000000000002', 'hide-member@example.test'),
  ('69200000-0000-4000-8000-000000000003', 'hide-outsider@example.test');

INSERT INTO public.projects (id, owner_id, name, key) VALUES
  ('69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000001', 'Shared project', 'HID');

INSERT INTO public.project_members (project_id, user_id, role, added_by) VALUES
  ('69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000002', 'member',
   '69200000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;

-- The member hides the shared project for themselves.
SELECT set_config('request.jwt.claim.sub', '69200000-0000-4000-8000-000000000002', true);
INSERT INTO public.hidden_projects (user_id, project_id)
  VALUES ('69200000-0000-4000-8000-000000000002', '69200000-0000-4000-8000-0000000000a1');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.hidden_projects) <> 1 THEN
    RAISE EXCEPTION 'the member''s preference did not persist';
  END IF;
  BEGIN
    INSERT INTO public.hidden_projects (user_id, project_id)
      VALUES ('69200000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-0000000000a1');
    RAISE EXCEPTION 'hiding a project for another user succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- The owner neither sees nor removes the member's preference, and still sees the project.
SELECT set_config('request.jwt.claim.sub', '69200000-0000-4000-8000-000000000001', true);
DELETE FROM public.hidden_projects;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.hidden_projects) THEN
    RAISE EXCEPTION 'another member read the preference';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = '69200000-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'hiding changed another member''s access';
  END IF;
END $$;

-- An outsider cannot hide a project they cannot access.
SELECT set_config('request.jwt.claim.sub', '69200000-0000-4000-8000-000000000003', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.hidden_projects (user_id, project_id)
      VALUES ('69200000-0000-4000-8000-000000000003', '69200000-0000-4000-8000-0000000000a1');
    RAISE EXCEPTION 'an outsider hid an inaccessible project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- The member keeps access, and showing the project again removes only their row.
SELECT set_config('request.jwt.claim.sub', '69200000-0000-4000-8000-000000000002', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.hidden_projects) <> 1 THEN
    RAISE EXCEPTION 'another member removed the preference';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = '69200000-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'hiding removed the member''s own access';
  END IF;
END $$;
DELETE FROM public.hidden_projects WHERE project_id = '69200000-0000-4000-8000-0000000000a1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.hidden_projects) THEN
    RAISE EXCEPTION 'showing the project did not remove the preference';
  END IF;
END $$;

ROLLBACK;
