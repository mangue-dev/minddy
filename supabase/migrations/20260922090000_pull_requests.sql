-- minddy — MIN-143 : la pull request devient une ENTITÉ.
--
-- Jusqu'ici une PR n'existait que par le run qui l'avait ouverte : le porteur
-- était `agent_runs.pr_number` / `pr_state` / `pr_url`, et la page Pull Requests
-- partait de `agent_runs` puis dédoublonnait par (repo_link_id, pr_number). Une
-- PR HUMAINE n'a pas de run : elle n'avait littéralement aucun endroit où
-- exister, et minddy montrait la moitié du dépôt sans le dire.
--
-- La clé est `(provider, repo_full_name, number)`, PAS `repo_link_id` : une PR
-- est un fait du DÉPÔT, et deux projets qui lient le même dépôt doivent voir la
-- même ligne, pas deux copies. L'ACCÈS, lui, se résout à la lecture en joignant
-- `project_git_links` — exactement le raisonnement de `repoLinkIds()`, qui
-- renvoie volontairement PLUSIEURS liens.
--
-- `agent_runs.pr_number` n'est PAS supprimé : il reste le lien run → PR (le
-- garde `prMerged` du steer s'en sert, la reprise de session aussi). Cette table
-- devient la source de vérité de l'ÉTAT de la PR ; le run garde son pointeur.
--
-- RLS : lecture = quiconque accède à un projet qui lie ce dépôt. Écritures =
-- service client uniquement (l'ingestion est serveur : webhooks + balayages).
-- Idempotent — safe to re-run.

-- ── La pull request ────────────────────────────────────────────────────────
create table if not exists public.pull_requests (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  repo_full_name    text not null,
  number            integer not null,
  url               text,
  title             text,
  state             text not null default 'open'
                      check (state in ('draft','open','merged','closed')),
  author_login      text,
  author_avatar_url text,
  head_branch       text,
  base_branch       text,
  head_sha          text,
  -- Rattachement au ticket, PAR CONVENTION (clé de projet dans la branche, le
  -- titre ou une ligne Fixes/Closes) — jamais par devinette. Une PR non
  -- rattachée est un état normal. `set null` : supprimer le ticket ne doit pas
  -- effacer la PR, qui existe chez la forge indépendamment de minddy.
  issue_id          uuid references public.issues(id) on delete set null,
  opened_at         timestamptz,
  merged_at         timestamptz,
  -- Dernière mise à jour CHEZ LA FORGE (et non de la ligne) : c'est le tri de la
  -- liste. Un balayage de rattrapage retouche toutes les lignes du dépôt — s'il
  -- bousculait cette date, l'ordre « la plus active en haut » ne voudrait plus
  -- rien dire. La fraîcheur de la ligne, elle, vit dans `synced_at`.
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now()
);

-- L'identité d'une PR : son numéro, dans son dépôt, chez sa forge. `owner/name`
-- n'est unique QUE par forge (miroirs, forks migrés) — d'où le provider.
create unique index if not exists idx_pull_requests_key
  on public.pull_requests(provider, repo_full_name, number);
-- Liste de la page : toutes les PR d'un dépôt, la plus fraîche en tête.
create index if not exists idx_pull_requests_repo
  on public.pull_requests(provider, repo_full_name, updated_at desc);
create index if not exists idx_pull_requests_issue
  on public.pull_requests(issue_id) where issue_id is not null;

alter table public.pull_requests enable row level security;

-- Lecture = il existe une liaison projet↔dépôt sur CE dépôt dont le projet
-- m'est accessible. `can_access_project` est security definer : elle traverse
-- la RLS de projects/project_members sans récursion.
drop policy if exists pull_requests_select on public.pull_requests;
create policy pull_requests_select on public.pull_requests for select
  using (
    exists (
      select 1
      from public.project_git_links l
      where l.provider = pull_requests.provider
        and l.repo_full_name = pull_requests.repo_full_name
        and public.can_access_project(l.project_id)
    )
  );

-- ── Fraîcheur du balayage, par DÉPÔT ───────────────────────────────────────
-- L'ingestion est webhook + rattrapage (à la liaison, et paresseux quand la
-- lecture trouve le dépôt trop vieux). Il faut donc savoir quand un dépôt a été
-- balayé pour la DERNIÈRE fois — question qui porte sur le dépôt, pas sur une de
-- ses PR : `max(synced_at)` répondrait « jamais » à un dépôt sans aucune PR, et
-- le ferait re-balayer à chaque affichage de la page.
--
-- `truncated` voyage avec : la pagination des deux forges est bornée
-- (MAX_PR_PAGES), et une liste coupée doit se voir à l'écran plutôt que mentir
-- par omission.
create table if not exists public.pull_request_syncs (
  provider       text not null,
  repo_full_name text not null,
  synced_at      timestamptz not null default now(),
  truncated      boolean not null default false,
  primary key (provider, repo_full_name)
);

alter table public.pull_request_syncs enable row level security;

drop policy if exists pull_request_syncs_select on public.pull_request_syncs;
create policy pull_request_syncs_select on public.pull_request_syncs for select
  using (
    exists (
      select 1
      from public.project_git_links l
      where l.provider = pull_request_syncs.provider
        and l.repo_full_name = pull_request_syncs.repo_full_name
        and public.can_access_project(l.project_id)
    )
  );

-- ── Reprise des PR déjà connues ────────────────────────────────────────────
-- Sans ce backfill la page se VIDE au déploiement : elle lira `pull_requests`,
-- où rien n'existe encore. Une ligne par (dépôt, numéro) distinct d'`agent_runs`,
-- avec l'issue et l'état du run le plus RÉCENT qui la porte (une issue enchaîne
-- plusieurs runs sur la même PR ; le dernier a l'état le moins périmé).
--
-- Les runs dont `repo_link_id` est null (liaison supprimée depuis) sont laissés
-- de côté : sans nom de dépôt, la PR n'a pas de clé — et elle est de toute façon
-- déjà morte côté produit, toutes ses routes répondant « No repository linked ».
--
-- `synced_at` reste volontairement à la date du run, donc VIEUX : le premier
-- affichage de la page déclenchera le rattrapage paresseux, qui remplira titre,
-- auteur et branches — que `agent_runs` n'a jamais stockés.
insert into public.pull_requests (
  provider, repo_full_name, number, url, state, issue_id, opened_at, updated_at, synced_at
)
select distinct on (l.provider, l.repo_full_name, r.pr_number)
  l.provider,
  l.repo_full_name,
  r.pr_number,
  r.pr_url,
  coalesce(r.pr_state, 'open'),
  r.issue_id,
  r.created_at,
  r.updated_at,
  r.updated_at
from public.agent_runs r
join public.project_git_links l on l.id = r.repo_link_id
where r.pr_number is not null
  and l.repo_full_name is not null
order by l.provider, l.repo_full_name, r.pr_number, r.updated_at desc
on conflict (provider, repo_full_name, number) do nothing;
