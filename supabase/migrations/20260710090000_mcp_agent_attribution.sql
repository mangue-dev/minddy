-- minddy — Attribution des actions MCP à l'agent (pas à l'utilisateur)
-- via_mcp (booléen) disait « fait via MCP » mais la timeline affichait quand
-- même l'utilisateur. On rattache désormais chaque événement/commentaire MCP
-- à la CLÉ qui l'a produit : la timeline affiche « Claude Code (mcp) » — le
-- nom de la clé, qui est le label de l'agent pour le flow « connecter un
-- agent ». on delete set null : l'attribution survit à la révocation (la
-- ligne api_keys n'est jamais supprimée, pattern integrations) mais pas à un
-- éventuel hard delete. Les lignes antérieures (via_mcp sans api_key_id)
-- retombent sur le libellé générique « Agent (mcp) ».
-- Idempotent — safe to re-run.

alter table public.issue_events
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;

alter table public.comments
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;
