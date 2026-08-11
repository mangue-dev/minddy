-- minddy — les pages en FAVORI, épinglées en tête de la barre secondaire.
--
-- Une colonne sur `pages`, pas une table de jointure par utilisateur : le
-- favori est PARTAGÉ par le projet. C'est une décision de produit, et elle se
-- lit dans ce choix de schéma — épingler une page, c'est dire à l'équipe « on
-- passe par là », pas se ranger son bureau. Le jour où le besoin d'un favori
-- personnel apparaîtra, il faudra une seconde notion et un second nom, pas une
-- réinterprétation de celle-ci.
--
-- Pas de `position` qui l'accompagne : les favoris se lisent dans l'ordre de
-- l'arbre (`position`, la même clé que la fratrie). Un ordre à part serait une
-- deuxième chose à ranger pour un bloc qui compte, en pratique, trois lignes.
--
-- Idempotent — safe à re-run.

alter table public.pages
  add column if not exists favorite boolean not null default false;

-- La lecture de la barre secondaire prend TOUTES les pages du projet d'un coup
-- (idx_pages_project) et trie les favoris en mémoire : cet index-ci ne sert
-- donc pas l'arbre. Il sert la question inverse — « les pages épinglées de ce
-- projet » — que la recherche et les surfaces futures poseront directement, et
-- il est partiel : les favoris sont une poignée de lignes par projet.
create index if not exists idx_pages_favorite
  on public.pages(project_id)
  where favorite and deleted_at is null;
