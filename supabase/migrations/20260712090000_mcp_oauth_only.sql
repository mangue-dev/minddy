-- minddy — MCP en OAuth uniquement : retrait des clés API personnelles mdyk_.
-- L'endpoint /api/mcp n'accepte plus que les access tokens OAuth (mdyat_).
-- Les lignes api_keys sont CONSERVÉES : les acteurs OAuth y vivent, et les
-- événements/commentaires historiques (api_key_id) doivent continuer à
-- résoudre leur nom dans la timeline. On révoque simplement les clés
-- personnelles restantes (elles ne pourraient plus s'authentifier de toute
-- façon, le chemin de vérification étant supprimé du code).
-- Idempotent — safe to re-run.

update public.api_keys
  set revoked_at = now()
  where oauth_client_id is null
    and revoked_at is null;
