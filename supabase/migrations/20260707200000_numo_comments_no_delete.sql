-- minddy — les commentaires de Numo ne sont pas supprimables non plus
-- Complète 20260707190000 : un utilisateur n'édite NI ne supprime les
-- commentaires postés via Numo (ils portent son author_id pour la traçabilité
-- mais ne sont pas « les siens »). Supprimer son propre commentaire racine
-- emporte toujours ses réponses (cascade FK, hors RLS), réponses de Numo
-- incluses — on supprime son fil, pas le message de Numo isolément.
-- Idempotent — safe to re-run.

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid() and via_assistant = false);
