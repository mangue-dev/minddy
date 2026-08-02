-- minddy — ajoute le feature 'landing_demo' au ledger ai_usage (MIN-150).
--
-- La démo de dictée de la landing fait deux appels par passage : la
-- transcription de la prise, puis le rangement dans les champs. Écrits sous
-- 'transcription' et 'dictation', ils se mélangeaient à la dictée des VRAIS
-- comptes — donc « combien nous coûte la démo publique ? » n'avait plus de
-- réponse, et « combien coûte la dictée de nos utilisateurs ? » non plus.
--
-- Sa propre feature, comme 'import_map' avant elle. Les deux appels partagent
-- un run_id : une ligne 'landing_demo' du tableau admin = une démo jouée, et
-- son coût moyen par run est le prix d'un passage. Le détail des deux appels
-- (et leurs modèles) reste lisible en ouvrant le run.
--
-- Étend le CHECK de 20261002090000_ai_usage_import_map.sql. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo'));
