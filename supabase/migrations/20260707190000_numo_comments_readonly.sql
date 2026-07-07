-- minddy — les commentaires de Numo ne sont pas éditables
-- Un utilisateur ne modifie que SES propres commentaires : ceux postés via
-- Numo (via_assistant) portent son author_id pour la traçabilité, mais ne
-- doivent pas être éditables pour autant. L'agent, lui, met à jour ses
-- réponses via le service client (hors RLS) — rien ne change pour lui.
-- La suppression reste permise (nettoyer une réponse ratée).
-- Idempotent — safe to re-run.

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update
  using (author_id = auth.uid() and via_assistant = false)
  with check (author_id = auth.uid() and via_assistant = false);
