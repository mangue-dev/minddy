-- minddy — MIN-260 : Smart-fill, la deuxième automatisation du formulaire.
--
-- Smart Assign choisit QUI prend le ticket ; Smart-fill remplit ce qu'il EST
-- (priorité, effort, catégories, objectif) à partir de son titre et de sa
-- description. Deux passes distinctes, deux features distinctes : leurs coûts se
-- lisent séparément, comme `agent_code` et `sandbox_compute`.
--
-- Côté UTILISATEUR, en revanche, elles partagent une ligne — « Automatisations »
-- (cf. `USAGE_SEGMENTS` dans lib/billing-plans.ts). C'est un revirement assumé :
-- la ligne s'appelait « Smart Assign », et le commentaire d'alors écartait
-- justement le mot « automatisations » parce qu'il désignait déjà les chaînes de
-- règles (MIN-147). Il le désigne toujours — mais ces chaînes ne dépensent rien
-- en propre (elles se lisent dans la ligne des runs qu'elles lancent), donc le
-- mot était libre. Et à deux features, « Smart Assign » ne pouvait plus nommer
-- la ligne sans en cacher la moitié.
--
-- Le budget reste UN seul pot : nommer une dépense n'est pas lui ouvrir une
-- enveloppe (le budget compte toutes les features depuis 20260819090000).
--
-- `get_user_usage_history` (20260817090000) garde `min(feature)` par run — sans
-- effet ici, Smart-fill est un appel unique, donc un run d'une seule ligne.
--
-- Étend le CHECK de 20261113091000_ai_usage_routine.sql. Idempotent.
--
-- `issue_autocomplete` N'EST PAS DE CE TICKET, et il est pourtant dans la liste.
-- La contrainte VIVANTE en production le contenait déjà, posée à la main hors de
-- ce dépôt, et la table portait des lignes qui l'utilisaient. Le CHECK se
-- réécrivant ENTIER, l'omettre ici aurait fait échouer ce push sur ces lignes-là.
--
-- Cette feature a depuis été abandonnée : la migration suivante
-- (20261124093000) supprime ses lignes et la retire de la liste. Ce fichier
-- garde la valeur parce que c'est ce qui a réellement tourné ici.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'smart_fill', 'feedback_classify', 'feedback_analyze',
    'embedding', 'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split', 'feedback_voice',
    'routine_code', 'routine_compute', 'issue_autocomplete'));
