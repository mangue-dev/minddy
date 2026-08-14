-- minddy — MIN-329 : une ligne de ledger ne peut pas RENDRE de l'argent.
--
-- `ai_usage` est le seul registre du budget : le quota mensuel d'un compte et le
-- plafond d'un run sont des SOMMES de sa colonne `cost`. Une seule ligne
-- négative les fait donc descendre — elle n'annule pas une dépense, elle en
-- efface d'autres, et le plafond de dépense saute pour tout le compte.
--
-- Le chemin par lequel c'était atteignable est fermé côté fonction (le plan de
-- contrôle de la microVM borne et plafonne le montant qu'on lui annonce, cf.
-- `lib/server/agent/usage-claim.ts`). Cette contrainte est la SECONDE serrure :
-- elle vaut pour tous les écrivains, y compris ceux qu'on écrira plus tard sans
-- se souvenir de celui-ci. Elle ne coûte rien — un `check` sur une colonne déjà
-- écrite ligne à ligne.
--
-- `cost is null` reste permis : le fournisseur ne rapporte pas toujours de
-- montant (un modèle hors catalogue, un stream coupé), et une ligne sans coût
-- porte quand même ses tokens et son id de génération.

alter table public.ai_usage
  drop constraint if exists ai_usage_cost_non_negative;

alter table public.ai_usage
  add constraint ai_usage_cost_non_negative
  check (cost is null or cost >= 0);
