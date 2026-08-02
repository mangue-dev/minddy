-- minddy — le direct était MORT, et pas seulement celui des pull requests.
--
-- Mesuré sur la prod en écrivant MIN-161 : TOUT join de canal privé était refusé,
-- pour tous les topics et tous les comptes, avec
--   « Unauthorized: You do not have permissions to read from this Channel topic ».
-- Le compte de démo n'entrait ni sur `user:{son propre id}`, ni sur
-- `project:{un de ses projets}`. Un token trafiqué, lui, se faisait bien refuser
-- pour signature invalide, et un topic PUBLIC se joignait sans problème : la
-- vérification du JWT marchait, c'était l'évaluation de la policy qui tombait.
--
-- Cause, isolée en évaluant chaque branche sous le rôle `authenticated` :
--
--   can_watch_pr_review('pr-review:…') → ERREUR
--     permission denied for function can_watch_pr_review
--
-- Une branche qui LÈVE ne rend pas « faux » : elle fait échouer l'expression
-- ENTIÈRE. Et PostgreSQL ne garantit aucun court-circuit sur `or` — il est libre
-- d'évaluer la 5e branche pour un topic `user:%`. Une seule fonction non
-- exécutable suffisait donc à fermer la réception broadcast de toute
-- l'application : notifications, board, tickets, sessions d'agent, tout.
--
-- D'où le trou : `20260926093000_definer_grants_sweep` révoque EXECUTE à
-- `authenticated` sur TOUS les SECURITY DEFINER de `public`, sauf cinq nommés à
-- la main — et cette allowlist ne pouvait pas connaître les fonctions écrites
-- après elle. `can_watch_pr_review` (20260927090000) est arrivée ensuite, et
-- s'est retrouvée du mauvais côté du balai.
--
-- La règle qui manquait, et que cette migration pose : **une fonction appelée
-- depuis une expression de POLICY doit être exécutable par le rôle qui déclenche
-- la policy.** Le contrôle de privilège s'y fait au nom de l'appelant, pas du
-- propriétaire — même pour une fonction SECURITY DEFINER. Les six ci-dessous ne
-- répondent que sur l'accès de CET appelant (`auth.uid()`) : les exposer ne lui
-- apprend rien qu'il ne sache déjà.
--
-- À TENIR À JOUR : toute nouvelle branche de `members_receive_broadcasts` ajoute
-- sa fonction à cette liste, dans la migration qui l'introduit.
--
-- Idempotent — safe to re-run.

grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;
grant execute on function public.can_watch_agent_run(text) to authenticated;
grant execute on function public.can_watch_numo_comment(text) to authenticated;
grant execute on function public.can_watch_pr_review(text) to authenticated;
grant execute on function public.can_watch_pull_request(text) to authenticated;
