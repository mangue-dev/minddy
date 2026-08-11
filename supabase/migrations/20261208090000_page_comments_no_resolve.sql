-- minddy — MIN-282 : un commentaire de page ne se RÉSOUT pas.
--
-- La résolution est arrivée avec la table (20261207090000) et repart aussitôt :
-- à l'usage, le bouton n'a pas de sens ici. Résoudre un fil veut dire « ce point
-- est traité, on peut fusionner » — c'est le vocabulaire d'une RELECTURE DE
-- CODE, et les fils d'une pull request le portent déjà. Une note laissée dans
-- une doc n'a aucune échéance à franchir : elle vaut tant qu'elle vaut, puis on
-- la supprime.
--
-- Les deux colonnes partent plutôt que de rester vides : une colonne que plus
-- rien n'écrit est une fonctionnalité qu'on croira lire dans le schéma. Vérifié
-- avant écriture — aucune ligne n'avait de `resolved_at` (les deux seuls
-- commentaires existants sont des essais, tous deux ouverts).
--
-- Idempotent — safe à re-run.

alter table public.page_comments drop column if exists resolved_at;
alter table public.page_comments drop column if exists resolved_by;

-- ── La policy d'écriture se resserre sur l'AUTEUR ───────────────────────────
-- `page_comments_update` était ouverte à toute l'équipe pour une seule raison :
-- la résolution, qui n'appartient à personne en particulier. Elle disparaît, et
-- le seul geste d'écriture restant est « corriger son propre texte » — réécrire
-- les mots d'un autre sous son nom n'est pas de la modération, et c'est la même
-- règle que sur les trois autres fils de l'app.
--
-- La route PATCH filtrait déjà sur `author_id` : ce qui change ici, c'est que la
-- règle cesse de dépendre du chemin emprunté.
drop policy if exists page_comments_update on public.page_comments;
create policy page_comments_update on public.page_comments for update to authenticated
  using (public.can_access_project(project_id) and author_id = (select auth.uid()))
  with check (public.can_access_project(project_id) and author_id = (select auth.uid()));
