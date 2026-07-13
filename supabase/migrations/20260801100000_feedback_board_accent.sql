-- minddy — MIN-59 : couleur d'accent du board public
-- Deux couleurs d'accent optionnelles (hex), une par thème, pour recolorer le
-- board public (/f/[token]). NULL = comportement par défaut (bleu minddy). Le
-- layout du board injecte ces valeurs comme override de --primary/--brand/--ring.
-- Idempotent — safe to re-run.

alter table public.feedback_boards
  add column if not exists accent_light text,
  add column if not exists accent_dark text;
