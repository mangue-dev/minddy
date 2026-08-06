-- minddy — MIN-185 : les routines ont leur propre ligne de facture.
--
-- Techniquement, un run de routine est le même run qu'un run d'agent. En
-- FACTURATION, non : un run d'agent est un geste qu'on a fait, une routine est
-- un abonnement qu'on a laissé tourner. La dépense d'une routine se compte donc
-- sous « Routines » et jamais sous « Agents » — c'est la seule façon de répondre
-- à « qu'est-ce qui a mangé mon budget ce mois-ci ? » quand la réponse est
-- « quelque chose qui tourne tout seul ». Précédent exact de `pr_review`
-- (MIN-141) : sa propre feature pour qu'on puisse lire son coût seul.
--
-- DEUX features et pas une : sans `routine_compute`, les minutes de microVM
-- d'une routine resteraient sous « Agents » et la séparation serait à moitié
-- fausse.
--
-- Le budget, lui, reste UN seul pot : nommer une dépense n'est pas lui ouvrir
-- une enveloppe (le budget compte toutes les features depuis 20260819090000).
--
-- `get_user_usage_history` (20260817090000) garde `min(feature)` par run pour
-- que le run garde le type que l'utilisateur reconnaît : `'routine_code' <
-- 'routine_compute'` en ordre alphabétique, donc un run de routine s'affiche
-- bien comme du code de routine et non comme du compute — exactement comme
-- `agent_code` < `sandbox_compute`. C'est un heureux hasard de l'alphabet, et
-- c'est écrit ici pour qu'un futur nom de feature ne le casse pas en silence.
--
-- Étend le CHECK de 20261108090000_ai_usage_feedback_voice.sql. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split', 'feedback_voice',
    'routine_code', 'routine_compute'));
