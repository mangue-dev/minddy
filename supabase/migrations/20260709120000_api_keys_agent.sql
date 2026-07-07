-- minddy — Clés API : rattachement à un agent
-- Les clés générées par le flow « connecter un agent » (settings du compte)
-- portent l'identifiant de l'agent cible (claude, codex, cursor, gemini,
-- vscode, windsurf). Une seule clé ACTIVE par (user, agent) : le flow révoque
-- l'ancienne avant d'en régénérer une, après confirmation de l'utilisateur.
-- NULL = clé créée manuellement (dialog « Nouvelle clé API »).
-- Idempotent — safe to re-run.

alter table public.api_keys
  add column if not exists agent text;

create index if not exists idx_api_keys_user_agent
  on public.api_keys(user_id, agent) where revoked_at is null;
