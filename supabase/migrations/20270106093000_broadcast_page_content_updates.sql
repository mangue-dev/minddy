-- Notify project members that a page body changed without sending its content.
-- `broadcast_page_row` removes the body from the payload before broadcasting.

drop trigger if exists pages_broadcast_update on public.pages;

create trigger pages_broadcast_update
after update on public.pages
for each row
when (
  old.title is distinct from new.title
  or old.icon is distinct from new.icon
  or old.parent_id is distinct from new.parent_id
  or old.position is distinct from new.position
  or old.favorite is distinct from new.favorite
  or old.deleted_at is distinct from new.deleted_at
  or old.deleted_root_id is distinct from new.deleted_root_id
  or old.parent_block_removed is distinct from new.parent_block_removed
  or old.content is distinct from new.content
)
execute function public.broadcast_page_row();
