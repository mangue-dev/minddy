-- MIN-949: a sixth effort size, XXL, for work that spans several days.
--
-- The change only widens the allowed set, so the previous release (which
-- never writes 'xxl') keeps working against the new constraint. The constraint
-- is re-added NOT VALID and validated in a second statement: existing rows all
-- satisfy the narrower set, and validation takes a lighter lock than a plain
-- ADD CONSTRAINT.

alter table public.issues drop constraint if exists issues_effort_check;

alter table public.issues
  add constraint issues_effort_check
  check (effort = any (array['xs', 's', 'm', 'l', 'xl', 'xxl']))
  not valid;

alter table public.issues validate constraint issues_effort_check;
