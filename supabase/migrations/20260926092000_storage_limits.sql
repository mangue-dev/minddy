-- minddy — MIN-118 : limites de taille sur les buckets + fin du listing public.
--
--  1. Aucun bucket ne portait de `file_size_limit` : les gardes TS
--     (MAX_ATTACHMENT_BYTES, MAX_ICON_UPLOAD_BYTES) ne protègent que NOS
--     routes — l'upload direct-to-storage parle à l'API Storage avec le JWT
--     de l'utilisateur, sans passer par elles. La limite bucket est la seule
--     borne que le client ne peut pas contourner.
--     Pas d'allowlist MIME sur `attachments` : toute pièce jointe est légitime
--     (produit), et les réponses passent par des URLs signées, pas du HTML.
--
--  2. La policy « project icons public read » sur storage.objects ne servait
--     qu'à LISTER le bucket via l'API (la lecture des fichiers d'un bucket
--     public passe par /object/public/… qui ne consulte pas les policies) :
--     énumération des icônes de tous les projets ouverte à `anon`. Supprimée —
--     rien côté app ne liste ce bucket.
--
-- Le bucket public `avatars` (orphelin depuis 20260903090000) se supprime via
-- `scripts/drop-avatars-bucket.mjs` — l'API Storage, pas le SQL.
--
-- Idempotent — safe to re-run.

update storage.buckets
  set file_size_limit = 20 * 1024 * 1024   -- 20 Mo = MAX_ATTACHMENT_BYTES
  where id = 'attachments';

update storage.buckets
  set file_size_limit = 25 * 1024 * 1024   -- 25 Mo = MAX_ICON_UPLOAD_BYTES
  where id = 'project-icons';

drop policy if exists "project icons public read" on storage.objects;
