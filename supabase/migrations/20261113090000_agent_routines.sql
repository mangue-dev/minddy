-- minddy — MIN-185 : les ROUTINES de Numo, un run d'agent programmé.
--
-- Numo ne savait travailler que sur demande : depuis un ticket, une note, une
-- pull request. Une routine est le quatrième cas — un titre, une instruction,
-- une cadence, un modèle — dont chaque échéance lance un VRAI run de numo
-- (streaming, sandbox, tools compris). Elle n'est liée à aucun ticket : c'est
-- une entité de projet, comme une automatisation, pas un ticket récurrent.
--
-- Au PROJET et non au compte, même raison que les automatisations de MIN-147 :
-- c'est le projet qui porte le dépôt à cloner, et l'usage IA s'impute au owner
-- du projet. `owner_id` est l'acteur TECHNIQUE de la routine — sa clé, son
-- quota, sa langue, ses notifications — gardé en colonne pour que le cron ait
-- son acteur sans re-joindre `projects`.
--
-- La CADENCE est structurée, pas une expression cron : `frequency` + heure +
-- minute + jour (de semaine ou du mois) + fuseau IANA. Une expression cron
-- serait à écrire par l'utilisateur, illisible dans l'UI, et à traduire quand
-- même pour l'afficher. `next_run_at` est calculé côté TS (lib/routine-schedule.ts)
-- et sert de VERROU : le cron le compare-and-set avant de lancer, seule garde
-- contre un double départ (même doctrine que `claim_agent_run`).
--
-- RLS : lecture = membres du projet (`can_access_project`) — un membre VOIT les
-- routines et leurs exécutions —, aucune policy d'écriture : la création, la
-- modification et la suppression passent par le service client derrière une
-- garde owner en TS (`lib/server/routines.ts`), même doctrine que `agent_runs`
-- et `agent_chains`. Idempotent — safe to re-run.

create table if not exists public.agent_routines (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  -- Acteur TECHNIQUE : aujourd'hui toujours le owner du projet (lui seul peut
  -- poser une routine — c'est son budget qui part tous les lundis matin).
  owner_id         uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  -- L'instruction de la routine. C'est elle qui devient le `prompt` du run.
  prompt           text not null,
  model            text,
  reasoning_level  text not null default 'medium',
  base_branch      text,
  frequency        text not null check (frequency in ('daily','weekly','monthly')),
  hour             integer not null default 9 check (hour between 0 and 23),
  minute           integer not null default 0 check (minute between 0 and 59),
  -- 0 = dimanche … 6 = samedi (convention `Date.getUTCDay`). Renseigné pour
  -- 'weekly' seulement ; null ailleurs.
  weekday          integer check (weekday between 0 and 6),
  -- 1–31, 'monthly' seulement. Un 31 sur un mois de 30 jours retombe sur le
  -- dernier jour du mois (cf. `nextRunAt`) — pas de saut de mois.
  day_of_month     integer check (day_of_month between 1 and 31),
  -- TOUJOURS explicite : « 13 h » n'a pas de sens sans lui.
  timezone         text not null default 'UTC',
  enabled          boolean not null default true,
  -- La prochaine échéance, en UTC. Null = routine sans échéance armée
  -- (désactivée) : l'index partiel du cron ne la voit pas.
  next_run_at      timestamptz,
  last_run_at      timestamptz,
  -- Motif du dernier passage MANQUÉ : un CODE (`quota`, `noRepo`,
  -- `alreadyRunning`, `launchFailed`…), jamais une phrase — c'est l'UI qui
  -- traduit. Rendu en clair dans l'en-tête de la routine : c'est ce qui rend
  -- tenable l'absence de garde-fou de dépense propre aux routines.
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Le balayage du cron : les routines armées dont l'heure est passée.
create index if not exists idx_agent_routines_due
  on public.agent_routines(next_run_at) where enabled;

-- La liste de l'onglet Routines, par projet, la plus récente en tête.
create index if not exists idx_agent_routines_project
  on public.agent_routines(project_id, created_at desc);

alter table public.agent_routines enable row level security;

drop policy if exists agent_routines_select on public.agent_routines;
create policy agent_routines_select on public.agent_routines
  for select to authenticated
  using (public.can_access_project(project_id));

drop trigger if exists agent_routines_set_updated_at on public.agent_routines;
create trigger agent_routines_set_updated_at
  before update on public.agent_routines
  for each row execute function public.set_updated_at();

-- ── Ce que le run doit à sa routine ─────────────────────────────────────────
-- Un run de routine EST un run carnet (issue_id null, ancrage `notebook`) avec
-- cette colonne en plus. Elle porte trois conséquences : la facture le lit
-- (`routine_code` / `routine_compute`), le jeu de tools le lit (`ask_user` et
-- `create_routine` retirés), et la liste des conversations l'exclut.
alter table public.agent_runs
  add column if not exists routine_id uuid
    references public.agent_routines(id) on delete cascade;

create index if not exists idx_agent_runs_routine
  on public.agent_runs(routine_id) where routine_id is not null;

-- Une routine ne se marche pas dessus : tant qu'un passage travaille, le
-- suivant est refusé (même doctrine qu'`idx_agent_runs_active_issue`).
create unique index if not exists idx_agent_runs_active_routine
  on public.agent_runs(routine_id)
  where routine_id is not null and status in ('queued','running');

-- Le CHECK inline de `triggered_by` est auto-nommé <table>_<col>_check : on le
-- remplace en entier pour y ajouter 'routine' (même mécanique que
-- 20261004090000_agent_automations pour 'automation').
alter table public.agent_runs drop constraint if exists agent_runs_triggered_by_check;
alter table public.agent_runs add constraint agent_runs_triggered_by_check
  check (triggered_by in ('button','chat','mention','automation','routine'));

-- ── Où mène une notification de routine ─────────────────────────────────────
-- Une notification porte UNE cible, et celle d'une routine n'est ni un ticket
-- (elle n'en a pas) ni un objectif ni un retour : c'est la routine, où ses
-- exécutions se lisent. Sans cette colonne, la ligne n'aurait aucune
-- destination et `notificationTargetPath` la rendrait inerte.
-- Aucun changement au CHECK de `type` : une routine réutilise `agent_done` /
-- `agent_failed`, qui disent exactement ce qui s'est passé.
alter table public.notifications
  add column if not exists routine_id uuid
    references public.agent_routines(id) on delete cascade;
