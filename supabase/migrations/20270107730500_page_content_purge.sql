-- MIN-591: permanent deletion removes an encrypted page tree without detaching cells.
BEGIN;
ALTER TABLE public.pages
  DROP CONSTRAINT pages_parent_id_fkey,
  DROP CONSTRAINT pages_deleted_root_id_fkey,
  ADD CONSTRAINT pages_parent_id_fkey FOREIGN KEY(parent_id)
    REFERENCES public.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT pages_deleted_root_id_fkey FOREIGN KEY(deleted_root_id)
    REFERENCES public.pages(id) ON DELETE CASCADE;
COMMIT;
