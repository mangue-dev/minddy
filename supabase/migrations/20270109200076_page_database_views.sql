-- MIN-764: saved views of a page database.
--
-- The sort, filter and hidden columns of a database page were kept in each
-- browser. They now belong to the page, as named views shared by every member
-- of its project, like the views of the issue board: each view has its own
-- configuration, and members with write access create, rename, reorder and
-- delete them. `position` is the shared order of the view strip.
--
-- The views live in their own table rather than in a `pages` column so that
-- the page envelope, its collaboration projection and its SQL guards keep
-- their exact shape. The name and the filter value are free text, so the row
-- is sealed in the page's project scope whenever page content protection is
-- active (`encrypted_content`, `name` and `view` NULL). A deployment without
-- it stores both in clear, and the next write after activation seals them.
--
-- Only the service role reads or writes this table: the API checks project
-- membership and write access first. The views follow their page: they are
-- deleted with it and copied with it on duplication.

CREATE TABLE public.page_database_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text,
  view jsonb,
  position double precision NOT NULL,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_database_views_page_fkey FOREIGN KEY (page_id, project_id)
    REFERENCES public.pages(id, project_id) ON DELETE CASCADE,
  CONSTRAINT page_database_views_content CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL
      AND name IS NOT NULL AND view IS NOT NULL AND jsonb_typeof(view) = 'object')
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND name IS NULL AND view IS NULL)
  )
);

CREATE INDEX page_database_views_page_idx
  ON public.page_database_views (page_id, position);
CREATE INDEX page_database_views_project_idx
  ON public.page_database_views (project_id);

ALTER TABLE public.page_database_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.page_database_views FROM anon, authenticated;
GRANT ALL ON TABLE public.page_database_views TO service_role;

COMMENT ON TABLE public.page_database_views IS
  'Saved views (name, sort, filter, hidden columns) of a page database, shared by the project (MIN-764). Service role only.';
