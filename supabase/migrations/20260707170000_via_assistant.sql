-- minddy — attribution Numo dans le journal d'activité
-- Les actions déclenchées via l'assistant restent attribuées à l'utilisateur
-- (actor_id/author_id = qui a demandé, pour la traçabilité), mais portent un
-- marqueur via_assistant pour que la timeline les affiche comme « Numo ».
-- Idempotent — safe to re-run.

alter table public.issue_events
  add column if not exists via_assistant boolean not null default false;

alter table public.comments
  add column if not exists via_assistant boolean not null default false;
