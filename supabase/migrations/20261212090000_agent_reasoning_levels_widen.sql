-- minddy — les niveaux de raisonnement sont ceux des MODÈLES, pas les nôtres
--
-- MIN-122 avait figé quatre paliers (`off` / `low` / `medium` / `high`), les
-- mêmes pour tous les modèles. Or chaque modèle publie les siens : OpenRouter les
-- expose modèle par modèle dans `/models` (objet `reasoning`, champ
-- `supported_efforts`), et 128 modèles sur 406 en déclarent — `minimal` chez les
-- GPT-5 et les Gemini 3, `xhigh` chez les codex-max, `max` chez une centaine
-- d'autres. Le vocabulaire s'élargit donc à celui d'OpenRouter, à un mot près :
-- leur `none` reste notre `off`, qui dit un peu plus — n'envoyer AUCUN champ de
-- raisonnement, seul défaut sûr hors OpenRouter où un champ inconnu revient en
-- 400 et tue le round.
--
-- Ce que le CHECK garde : que la colonne ne porte que des paliers que le code
-- sait traduire (`lib/agent-reasoning.ts`). Ce qu'il ne garde PAS, et ne peut pas
-- garder : qu'un palier soit accepté par le modèle du run — ça, c'est ce que le
-- sélecteur lit dans l'index, et ce qu'OpenRouter rabat de son côté.
--
-- Les valeurs existantes restent toutes valides : c'est un ÉLARGISSEMENT, aucune
-- ligne à réécrire. Idempotent — safe to re-run.

alter table public.agent_runs drop constraint if exists agent_runs_reasoning_level_check;
alter table public.agent_runs add constraint agent_runs_reasoning_level_check
  check (reasoning_level in ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

alter table public.user_agent_preferences
  drop constraint if exists user_agent_preferences_default_reasoning_level_check;
alter table public.user_agent_preferences
  add constraint user_agent_preferences_default_reasoning_level_check
  check (default_reasoning_level is null
         or default_reasoning_level in
            ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));

-- `agent_routines.reasoning_level` n'a jamais porté de CHECK (cf.
-- 20261113090000_agent_routines.sql) : rien à élargir ici, et rien à resserrer
-- non plus — la validation se fait à l'écriture (`toReasoningLevel`), et poser
-- une contrainte maintenant refuserait des lignes qu'on n'a pas relues.
