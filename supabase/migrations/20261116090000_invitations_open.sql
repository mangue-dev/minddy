-- MIN-197 : inviter une adresse qui n'a pas encore de compte minddy.
--
-- L'invitation naît désormais SANS `invited_user_id` (la colonne était déjà
-- nullable, personne ne s'en servait) : elle se rattache à un compte plus tard,
-- à la première session dont l'email vérifié correspond. Deux colonnes le
-- rendent possible :
--
--   token      — ce que porte le lien du mail. Il ne donne AUCUN accès : il ne
--                sert qu'à afficher « X vous invite sur *Projet* » au-dessus du
--                formulaire de connexion. Le rattachement, lui, se fait sur
--                l'email vérifié de la session. Un token volé ne fait rien.
--   expires_at — une invitation en attente ne pend pas indéfiniment : 30 jours.
--
-- Le token vient de `gen_random_uuid()` (cœur de Postgres, 122 bits) et non de
-- `gen_random_bytes()` : ce dernier demande pgcrypto, que rien d'autre dans ce
-- schéma n'exige.
--
-- Idempotent — safe to re-run.

alter table public.project_invitations
  add column if not exists token text,
  add column if not exists expires_at timestamptz;

-- Les lignes déjà là (invitations vers des comptes existants) : un token par
-- ligne, pas un pour toutes — l'index unique ci-dessous les refuserait.
update public.project_invitations
   set token = replace(gen_random_uuid()::text, '-', '')
 where token is null;

update public.project_invitations
   set expires_at = created_at + interval '30 days'
 where expires_at is null;

alter table public.project_invitations
  alter column token set default replace(gen_random_uuid()::text, '-', ''),
  alter column token set not null,
  alter column expires_at set default now() + interval '30 days',
  alter column expires_at set not null;

create unique index if not exists idx_project_invitations_token
  on public.project_invitations(token);

-- Le rattachement à la première session cherche par EMAIL seul, sur les seules
-- invitations encore orphelines. L'index unique partiel existant est sur
-- (project_id, invited_email) : il ne sert pas cette recherche-là.
create index if not exists idx_project_invitations_unclaimed
  on public.project_invitations(invited_email)
  where invited_user_id is null and status = 'pending';

-- Rappel de ce sur quoi tout le reste s'appuie : un seul pending par
-- (projet, email) — la garde du doublon ne dépend PAS d'`invited_user_id`,
-- elle tient donc aussi quand il est null. Créé par projects_foundation, redit
-- ici parce que MIN-197 en fait un invariant load-bearing.
create unique index if not exists idx_project_invitations_pending_unique
  on public.project_invitations(project_id, invited_email)
  where status = 'pending';
