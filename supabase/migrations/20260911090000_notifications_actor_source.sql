-- minddy — l'inbox montre QUI a déclenché la ligne, pas seulement quoi.
--
-- Une notification portait jusqu'ici son seul `actor_id`. Ça suffit pour un
-- humain, mais pas pour les deux acteurs qui n'en sont pas un :
--
--   • une action passée par le serveur MCP : l'`actor_id` est le propriétaire de
--     la clé, alors que l'acteur AFFICHÉ est l'agent (Claude Code, Cursor…) ;
--   • une affectation faite par Smart Assign : il n'y a pas d'acteur du tout,
--     et « Quelqu'un vous a assigné ce ticket » ment par omission.
--
-- Ces deux cas sont déjà nommés dans `issue_events` (via_mcp + api_key_id,
-- via_smart_assign) et la timeline sait les dessiner. On reprend ici LE MÊME
-- vocabulaire plutôt qu'un `source text` de plus : une notification et un
-- événement décrivent la même action, ils doivent la décrire pareil.
--
-- Colonnes additives à valeur par défaut : les lignes existantes restent
-- exactement ce qu'elles étaient (acteur humain). RLS inchangée (les colonnes
-- suivent les policies de leur table). Idempotent.

alter table public.notifications
  add column if not exists via_mcp boolean not null default false;

-- La clé qui a agi — son nom/agent donne le libellé et le logo affichés.
-- `on delete set null` : une clé révoquée puis supprimée ne doit pas emporter
-- les notifications qu'elle a produites (le `via_mcp` seul retombe alors sur
-- l'icône générique).
alter table public.notifications
  add column if not exists api_key_id uuid
    references public.api_keys(id) on delete set null;

alter table public.notifications
  add column if not exists via_smart_assign boolean not null default false;
