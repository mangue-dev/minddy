-- minddy — MIN-136 « Tickets récurrents ».
--
-- Un ticket récurrent porte sa cadence dans `recurrence` ; sa PROCHAINE
-- échéance reste dans `due_date`. C'est le point qui évite une seconde notion
-- de date dans toute l'app : le tri « échéance », « Échéances proches », le
-- calcul de retard et le panneau latéral continuent de lire le même champ.
--
-- L'invariant qui compte : UN SEUL ticket vivant porte une récurrence donnée.
-- À la clôture, lib/server/recurrence.ts remet `recurrence` à null sur le
-- ticket terminé puis la repose sur l'occurrence qu'il crée — un
-- compare-and-swap qui rend l'opération idempotente (done → todo → done ne
-- recrée rien) et sûre à deux écritures concurrentes.
--
-- `recurrence_series_id` est l'id du PREMIER ticket de la série, hérité tel
-- quel par chaque occurrence : de quoi retrouver l'historique d'une récurrence
-- (et la compter) sans requête récursive sur une chaîne de parents. Il reste
-- NULL sur le ticket d'origine — sa série, c'est lui : `recurrence_series_id ??
-- id` (lib/recurrence.ts, seriesIdOf) donne l'identifiant de série de n'importe
-- quelle ligne, sans écriture supplémentaire à la création.
-- Idempotent — safe à re-run.

alter table public.issues
  add column if not exists recurrence text
    check (recurrence is null or recurrence in ('daily','weekly','monthly','yearly')),
  add column if not exists recurrence_series_id uuid
    references public.issues(id) on delete set null;

-- Partiel : les tickets récurrents sont une poignée par projet. Sert les deux
-- seules lectures qui les cherchent — la page « Récurrences » des paramètres
-- du projet et le filtre « masquer les récurrents » du tableau.
create index if not exists idx_issues_recurrence
  on public.issues(project_id)
  where recurrence is not null;
