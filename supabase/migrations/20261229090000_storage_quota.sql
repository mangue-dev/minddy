-- minddy — MIN-348 : un plafond de stockage par compte.
--
-- Le trou : l'envoi d'une pièce jointe part du NAVIGATEUR directement vers le
-- bucket, avec le JWT de son auteur. Il ne traverse aucune route, donc aucun
-- limiteur, aucune garde TypeScript — la policy `attachments insert` était la
-- seule chose sur son chemin, et elle ne regardait que le préfixe. Un compte
-- gratuit pouvait donc y écrire un volume illimité, vingt mégaoctets à la fois.
--
-- La borne se pose donc là où passe VRAIMENT l'écriture : dans la policy.
--
-- Ce qu'on compte : les octets ENREGISTRÉS (`attachments.size_bytes` +
-- `page_files.size_bytes`) des projets dont le compte est OWNER. Deux
-- conséquences, toutes deux voulues :
--   • l'imputation suit celle de l'usage IA — le propriétaire du projet paie
--     pour ce que ses invités y déposent, comme il paie leurs appels de modèle ;
--   • un objet téléversé mais jamais enregistré (un composeur abandonné) ne
--     compte pour personne. C'est le balayage des orphelins qui le ramasse
--     (`lib/server/attachments.ts`, `sweepOrphanAttachments`), pas le quota :
--     faire porter à quelqu'un des octets que l'app ne sait plus montrer
--     donnerait un plafond que personne ne peut redescendre.
--
-- Idempotent — safe to re-run.

-- ── Le barème ────────────────────────────────────────────────────────────────
-- MIROIR de `maxStorageBytes` dans lib/billing-plans.ts, qui reste la source de
-- vérité PRODUIT (c'est elle que l'UI lit). Les deux doivent dire la même
-- chose : `lib/billing-plans.test.ts` relit ce fichier et compare.
create table if not exists public.plan_storage_quotas (
  plan_id text primary key,
  bytes   bigint not null
);

insert into public.plan_storage_quotas (plan_id, bytes) values
  ('free', 1073741824),     -- 1 Go
  ('go',   21474836480),    -- 20 Go
  ('pro',  107374182400)    -- 100 Go
on conflict (plan_id) do update set bytes = excluded.bytes;

-- Lisible par tous : le plafond d'un plan n'est pas un secret, et la fonction
-- de quota le lit sous l'identité de l'appelant du plan.
alter table public.plan_storage_quotas enable row level security;
drop policy if exists plan_storage_quotas_select on public.plan_storage_quotas;
create policy plan_storage_quotas_select on public.plan_storage_quotas
  for select to authenticated, service_role using (true);

-- ── Le plan effectif, en SQL ─────────────────────────────────────────────────
-- Même précédence que `resolvePlanFromBillingAccount`
-- (lib/server/billing-accounts.ts) : override admin encore valide, puis
-- abonnement Stripe dans un statut actif, puis `free`. La règle est courte, et
-- la redire ici est le prix à payer pour qu'une policy puisse la lire.
create or replace function public.effective_plan_id(p_user uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select a.admin_override_plan_id
       from public.billing_accounts a
      where a.user_id = p_user
        and a.admin_override_plan_id is not null
        and (a.admin_override_expires_at is null
             or a.admin_override_expires_at > now())),
    (select a.stripe_plan_id
       from public.billing_accounts a
      where a.user_id = p_user
        and a.stripe_plan_id is not null
        and a.stripe_subscription_status in ('active', 'trialing', 'past_due')),
    'free')
$$;

-- ── Les octets d'un compte ───────────────────────────────────────────────────
create or replace function public.account_storage_bytes(p_user uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select
    coalesce((select sum(a.size_bytes)
                from public.attachments a
                join public.projects p on p.id = a.project_id
               where p.owner_id = p_user
                 and a.storage_path is not null), 0)
  + coalesce((select sum(f.size_bytes)
                from public.page_files f
                join public.projects p on p.id = f.project_id
               where p.owner_id = p_user), 0)
$$;

-- « Ce compte peut-il encore écrire ? »
--
-- Comparaison au plafond du plan, plafond du plan `free` si le barème ne
-- connaît pas le plan résolu (un plan neuf mal déployé ne doit pas OUVRIR le
-- robinet). Un compte inconnu — l'envoi anonyme n'existe pas ici — répond faux.
--
-- AIDE DE POLICY : elle doit rester exécutable par `authenticated`. Lui retirer
-- son EXECUTE ne la ferait pas refuser, ça la ferait LEVER — et une policy dont
-- une branche lève tombe en entier.
create or replace function public.storage_quota_ok(p_user uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_user is not null
     and public.account_storage_bytes(p_user) < coalesce(
           (select q.bytes from public.plan_storage_quotas q
             where q.plan_id = public.effective_plan_id(p_user)),
           (select q.bytes from public.plan_storage_quotas q where q.plan_id = 'free'),
           0)
$$;

-- Le même verdict pour un PROJET : c'est son owner qui répond des octets.
-- Aide de policy elle aussi, donc ouverte à `authenticated` pour la même raison.
create or replace function public.project_storage_quota_ok(p_project uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.storage_quota_ok(
    (select p.owner_id from public.projects p where p.id = p_project))
$$;

-- Les deux fonctions du DESSOUS ne sont appelées que depuis les deux
-- aides de policy, qui sont `security definer` : leurs appels internes passent
-- avec les droits du propriétaire, pas ceux de l'appelant. Personne n'a donc
-- besoin de les exécuter directement — et le barème d'un plan comme les octets
-- d'un compte n'ont rien à faire à portée d'une clé anon.
revoke all on function public.effective_plan_id(uuid)
  from public, anon, authenticated;
grant execute on function public.effective_plan_id(uuid) to service_role;
revoke all on function public.account_storage_bytes(uuid)
  from public, anon, authenticated;
grant execute on function public.account_storage_bytes(uuid) to service_role;

-- Les deux aides de POLICY, elles, restent ouvertes : une policy qui appelle
-- une fonction sans EXECUTE ne refuse pas la branche, elle LÈVE — et la policy
-- entière tombe avec.
grant execute on function public.storage_quota_ok(uuid) to authenticated, service_role;
grant execute on function public.project_storage_quota_ok(uuid) to authenticated, service_role;

-- ── Les orphelins du bucket ──────────────────────────────────────────────────
-- Les objets de `attachments` que plus AUCUNE ligne ne désigne, passé un délai
-- de grâce.
--
-- Il en naît à chaque composeur abandonné : l'envoi est direct-to-storage et
-- précède l'enregistrement de la ressource, donc fermer la fenêtre entre les
-- deux laisse l'objet derrière. Rien ne les ramassait — ils n'étaient comptés
-- nulle part, et ne partaient jamais.
--
-- La famille `chat/` est EXCLUE, et ce n'est pas un oubli : les téléversements
-- du shell de l'assistant n'ont pas de ligne du tout (ils sont cités dans
-- `assistant_messages.metadata`), donc « sans ligne » y veut dire « normal ».
-- Ce balayage-là ne connaît que `projects/`.
--
-- SECURITY DEFINER + service_role seul : le schéma `storage` n'est pas exposé
-- par PostgREST, et la liste des objets du bucket n'a rien à faire chez un
-- client.
create or replace function public.orphan_attachment_objects(
  p_before timestamptz,
  p_limit  integer default 500
)
returns table (name text)
language sql
security definer
set search_path = ''
stable
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < p_before
    and (storage.foldername(o.name))[1] = 'projects'
    and not exists (select 1 from public.attachments a where a.storage_path = o.name)
    and not exists (select 1 from public.page_files f where f.storage_path = o.name)
  order by o.created_at
  limit p_limit
$$;

revoke all on function public.orphan_attachment_objects(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.orphan_attachment_objects(timestamptz, integer)
  to service_role;

-- Le balayage relit `attachments.storage_path` et `page_files.storage_path`
-- pour chaque candidat : sans index, c'est un scan de table par objet.
create index if not exists idx_attachments_storage_path
  on public.attachments(storage_path) where storage_path is not null;
create index if not exists idx_page_files_storage_path
  on public.page_files(storage_path);

-- ── La policy ────────────────────────────────────────────────────────────────
-- Reprise à l'identique de 20260717090000_attachments.sql, plus le quota. Le
-- CASE imbriqué (et non un AND) reste indispensable : Postgres ne garantit pas
-- le court-circuit dans une policy, et le cast ::uuid doit rester derrière le
-- test de forme de l'uuid.
drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and case (storage.foldername(name))[1]
      when 'projects' then
        case when (storage.foldername(name))[2]
               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.can_access_project(((storage.foldername(name))[2])::uuid)
                  and public.project_storage_quota_ok(((storage.foldername(name))[2])::uuid)
             else false
        end
      when 'chat' then
        case when (storage.foldername(name))[2] = (select auth.uid()::text)
             then public.storage_quota_ok((select auth.uid()))
             else false
        end
      else false
    end
  );
