-- minddy — MIN-282 : QUEL agent a écrit cette version.
--
-- L'historique d'une page sait depuis MIN-277 qu'une écriture est humaine ou
-- automatisée (`author_kind`), et c'est tout ce qu'il faut pour NOMMER l'auteur
-- — la règle d'identité dit « minddy » dans les deux cas d'agent. Pour le
-- MONTRER, ça ne suffit plus : « agent » recouvre deux visages, celui de Numo
-- (le chat, l'agent de code) et celui de l'agent qui tient une clé MCP, qui a un
-- nom et un logo (« Claude Code »). L'activité les distingue déjà, par
-- `issue_events.api_key_id` ; l'historique, non.
--
-- Deux colonnes, et l'ordre entre elles est tout le mécanisme :
--
--   • `pages.updated_api_key_id` — la clé derrière l'état COURANT. Elle est
--     écrite en même temps que `updated_kind`, par le même chemin.
--   • `page_versions.author_api_key_id` — recopiée depuis la précédente au
--     moment de l'archivage. Une version archive l'état qu'une écriture
--     RECOUVRE : son auteur est celui de `pages` d'avant, pas celui qui écrit.
--
-- Les versions déjà en base gardent `null` : leurs écritures d'agent
-- retomberont sur le visage de Numo, qui est le bon repli — une clé MCP est
-- l'exception, et rien dans la ligne ne permet de la retrouver après coup.
--
-- Idempotent — safe à re-run.

alter table public.pages
  add column if not exists updated_api_key_id uuid
    references public.api_keys(id) on delete set null;

alter table public.page_versions
  add column if not exists author_api_key_id uuid
    references public.api_keys(id) on delete set null;

-- Pas d'index : ces colonnes ne sont jamais un CRITÈRE de recherche, seulement
-- une valeur qu'on lit sur des lignes déjà trouvées par leur page.
