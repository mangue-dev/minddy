-- minddy — « Plan d'implémentation » par issue
-- Document markdown dédié, distinct de la description, écrit/tenu à jour par
-- les agents (Numo, futur MCP) et éditable dans l'UI. Le markdown est la
-- source de vérité unique : les tâches sont des lignes checkbox
-- ('- [ ]' à faire, '- [~]' en cours, '- [x]' terminée, '- [-]' annulée)
-- parsées côté client et serveur (lib/plan.ts). Pas de diff stocké : le
-- journal issue_events porte les transitions d'état des tâches.
-- Idempotent — safe to re-run.

alter table public.issues add column if not exists plan text;
