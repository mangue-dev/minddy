-- MIN-346 — La suppression d'un client OAuth ne doit plus pouvoir emporter des
-- grants.
--
-- `oauth_grants.client_id` référençait `oauth_clients` en ON DELETE CASCADE.
-- Le seul code qui supprime un client est la purge d'hygiène DCR, et elle ne
-- vise que des clients sans grant : le CASCADE n'avait donc rien à faire de
-- légitime. En revanche, le jour où la purge se trompe — une lecture tronquée
-- suffisait —, il détruisait sans bruit les autorisations de TOUS les
-- utilisateurs du client, chacun perdant son accès MCP.
--
-- En RESTRICT, la même erreur lève au lieu de détruire. C'est le filet sous le
-- correctif applicatif, pas son remplaçant.

alter table public.oauth_grants
  drop constraint if exists oauth_grants_client_id_fkey;

alter table public.oauth_grants
  add constraint oauth_grants_client_id_fkey
  foreign key (client_id) references public.oauth_clients(client_id)
  on delete restrict;
