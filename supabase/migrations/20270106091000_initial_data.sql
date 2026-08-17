-- minddy — données initiales du baseline (MIN-379).
--
-- Un dump de schéma Supabase ne transporte pas les INSERT de configuration.
-- Ces valeurs sont donc une migration distincte, idempotente, pour qu'une
-- instance neuve retrouve exactement les défauts applicatifs du précédent
-- historique de 211 migrations.

insert into public.app_config (key, value) values
  ('assistant_model', 'deepseek/deepseek-v4-flash'),
  ('fallback_model', 'deepseek/deepseek-v4-flash'),
  ('transcription_model', 'openai/whisper-large-v3'),
  ('dictate_model', 'google/gemini-3.1-flash-lite'),
  ('smart_assign_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_analysis_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_embedding_model', 'openai/text-embedding-3-small'),
  ('feedback_merge_auto_threshold', '0.92'),
  ('feedback_merge_suggest_floor', '0.6'),
  ('feedback_analysis_batch_size', '50'),
  ('feedback_classify_enabled', 'true'),
  ('feedback_classify_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_classify_batch_size', '50'),
  ('agent_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_junk_purge_days', '30')
on conflict (key) do nothing;

insert into public.plan_storage_quotas (plan_id, bytes) values
  ('free', 1073741824),
  ('go',   21474836480),
  ('pro',  107374182400)
on conflict (plan_id) do update set bytes = excluded.bytes;
