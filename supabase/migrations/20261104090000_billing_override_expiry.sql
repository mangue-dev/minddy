-- minddy — offrir un plan PENDANT UN TEMPS (échéance sur l'override admin).
--
-- L'override admin (20260816090000) était définitif : offert une fois, offert
-- pour toujours, et il fallait penser à revenir le retirer. Une échéance
-- facultative suffit à en faire un cadeau borné : la résolution du plan
-- (lib/server/billing-accounts.ts) IGNORE un override dont l'échéance est
-- passée, donc le droit tombe tout seul, sans cron ni webhook.
--
-- Le balayage horaire (cron billing-sync → `expireAdminOverrides`) ne sert donc
-- pas à couper l'accès : il nettoie la ligne pour qu'elle arrête de décrire un
-- cadeau qui n'existe plus, et l'écriture pousse le changement aux onglets
-- ouverts par le direct.
--
-- `null` = sans limite : les overrides déjà posés gardent exactement le sens
-- qu'ils avaient.
alter table public.billing_accounts
  add column if not exists admin_override_expires_at timestamptz;

comment on column public.billing_accounts.admin_override_expires_at is
  'Fin du plan offert par un admin (null = sans limite). Passée, l''override est ignoré à la résolution.';

-- Le balayage ne regarde que les cadeaux à échéance.
create index if not exists idx_billing_accounts_override_expiry
  on public.billing_accounts(admin_override_expires_at)
  where admin_override_expires_at is not null;

-- L'échéance suit `admin_override_plan_id` du côté lisible : c'est le droit de
-- la personne, et jusqu'à quand. La NOTE d'override, elle, reste cachée
-- (20260926090000).
grant select (admin_override_expires_at)
  on public.billing_accounts to authenticated;
