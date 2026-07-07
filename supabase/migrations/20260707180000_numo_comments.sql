-- minddy — @Numo dans les commentaires (fire and forget, façon Linear)
-- Un commentaire mentionnant @numo déclenche une réponse de l'assistant sous
-- forme de réponse de fil. La réponse est un commentaire vivant : pendant la
-- génération, assistant_status='working' et assistant_tool porte l'étape en
-- cours (affichée en direct via Realtime) ; à la fin il ne reste que le texte.
-- Idempotent — safe to re-run.

alter table public.comments
  add column if not exists assistant_status text
    check (assistant_status in ('working', 'done', 'error'));

alter table public.comments
  add column if not exists assistant_tool text;
