-- minddy — dictée vocale (bouton dictate, façon AutoKap)
-- Le modèle de transcription est configuré en base comme le modèle assistant.
-- Idempotent — safe to re-run.

insert into public.app_config (key, value)
values ('transcription_model', 'openai/whisper-large-v3')
on conflict (key) do nothing;
