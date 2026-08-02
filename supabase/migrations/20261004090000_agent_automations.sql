-- minddy — MIN-147 : la boucle Numo s'enchaîne toute seule.
--
-- Les quatre étapes (plan → vérif du plan → implémentation → vérif de
-- l'implémentation) existaient déjà, chacune derrière son propre clic. Ce qui
-- manquait n'était pas un bouton « lance la boucle » mais des AUTOMATISATIONS de
-- projet — `quand … si … alors …` — et de quoi les tenir : une chaîne durable,
-- qui porte l'étape courante, la dépense cumulée, le plafond et l'arrêt.
--
--   • `projects.automations`         = les règles (jsonb éditable, préréglages) ;
--   • `issues.automation_override`   = forcer/désactiver un mode sur UN ticket ;
--   • `agent_chains`                 = la chaîne vivante d'un ticket ;
--   • `agent_runs.chain_id/intent/…` = ce que chaque run doit à sa chaîne.
--
-- `intent` n'était PAS persisté (le lancement le lisait puis le jetait) : sans
-- lui, la chaîne ne peut pas savoir ce que le run qui vient de finir FAISAIT.
-- `verdict` (jsonb) est l'homonyme SANS RAPPORT du `verdict text` de
-- `pr_review_runs` : ici c'est `{ok, summary, blockers}`, ce que l'agent répond
-- au tool `report_verdict` d'une étape de vérification.
--
-- RLS : lecture = membres du projet (`can_access_project`), aucune policy
-- d'écriture — la chaîne est serveur de bout en bout (service client), même
-- doctrine que `agent_runs`. Aucun `grant` à écrire : les révocations de
-- 20260926090000_security_grants ne visent que les six tables à secrets.
-- Idempotent — safe to re-run.

-- ── Les règles, au projet ───────────────────────────────────────────────────
-- Au PROJET et non au compte : toute la configuration voisine l'est déjà
-- (smart_assign, revue du feedback, dépôt lié, récurrences), le dépôt lié aussi,
-- et l'usage IA d'une automatisation s'impute au owner du projet. Un réglage de
-- compte piloterait des tickets dont il ne paye pas le dépôt.
alter table public.projects
  add column if not exists automations_enabled boolean not null default false;
alter table public.projects
  add column if not exists automations jsonb not null default '[]'::jsonb;

-- Forçage par ticket : null = suit le projet ; `{"disabled": true}` = ce ticket
-- reste manuel ; `{"preset": "<id>"}` = ce préréglage-là, quel que soit l'effort.
alter table public.issues
  add column if not exists automation_override jsonb;

-- ── La chaîne ───────────────────────────────────────────────────────────────
create table if not exists public.agent_chains (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  issue_id         uuid not null references public.issues(id) on delete cascade,
  -- Acteur TECHNIQUE de la chaîne : c'est de lui que viennent la clé BYOK, le
  -- quota, la langue et les notifications. L'acteur AFFICHÉ, lui, est
  -- l'automatisation (`via_automation`).
  owner_id         uuid not null references auth.users(id) on delete cascade,
  preset           text,
  status           text not null default 'running'
                     check (status in ('running','awaiting_human','stopped','completed','failed')),
  -- Compteur d'étapes JOUÉES : c'est lui que le CAS d'`advanceChain` garde, et
  -- lui que `MAX_CHAIN_STEPS` borne (garde-fou anti-runaway).
  step             integer not null default 0,
  -- Règles déjà jouées sur cette chaîne : une règle ne se rejoue pas. C'est ce
  -- qui coupe la boucle quand l'action `set_status` redéclenche le crochet de
  -- changement de statut qui l'a produite.
  played_rule_ids  jsonb not null default '[]'::jsonb,
  retries          integer not null default 0,
  spent_usd        numeric(12,6) not null default 0,
  -- Plafond de la chaîne, en USD. Jamais affiché tel quel : l'UI en montre la
  -- part du budget mensuel du plan (« jamais de dollars dans l'UI »).
  budget_usd       numeric(12,6),
  -- Motif d'arrêt : un CODE (`budget`, `quota`, `verification_failed`,
  -- `interrupted`, `noRepo`…), jamais une phrase — c'est le rapport qui traduit.
  stop_reason      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Une seule chaîne VIVANTE par ticket, même doctrine que
-- `idx_agent_runs_active_issue` : `openChain` traite la violation d'unicité
-- (23505) comme « une chaîne existe déjà », sans pré-check à gagner.
create unique index if not exists idx_agent_chains_active_issue
  on public.agent_chains(issue_id) where status in ('running','awaiting_human');

-- L'historique d'un projet, en tête (page réglages, estimation).
create index if not exists idx_agent_chains_project
  on public.agent_chains(project_id, created_at desc);

alter table public.agent_chains enable row level security;

drop policy if exists agent_chains_select on public.agent_chains;
create policy agent_chains_select on public.agent_chains
  for select to authenticated
  using (public.can_access_project(project_id));

drop trigger if exists agent_chains_set_updated_at on public.agent_chains;
create trigger agent_chains_set_updated_at
  before update on public.agent_chains
  for each row execute function public.set_updated_at();

-- ── Ce que le run doit à sa chaîne ──────────────────────────────────────────
alter table public.agent_runs
  add column if not exists chain_id uuid
    references public.agent_chains(id) on delete set null;
-- Plafond de CE run — la part de la chaîne qu'il a le droit de dépenser. Rendu
-- exécutoire dans la boucle (min(quota, run, chaîne)), pas seulement affiché.
alter table public.agent_runs
  add column if not exists budget_usd numeric(12,6);
alter table public.agent_runs
  add column if not exists intent text;
alter table public.agent_runs
  add column if not exists verdict jsonb;

alter table public.agent_runs drop constraint if exists agent_runs_intent_check;
alter table public.agent_runs add constraint agent_runs_intent_check
  check (intent is null or intent in ('implement','plan','verify','custom'));

-- Le CHECK inline de `triggered_by` est auto-nommé <table>_<col>_check : on le
-- remplace en entier pour y ajouter 'automation' (même mécanique que
-- 20260921090000_pr_notifications sur notifications.type).
alter table public.agent_runs drop constraint if exists agent_runs_triggered_by_check;
alter table public.agent_runs add constraint agent_runs_triggered_by_check
  check (triggered_by in ('button','chat','mention','automation'));

create index if not exists idx_agent_runs_chain
  on public.agent_runs(chain_id) where chain_id is not null;

-- ── L'acteur affiché d'un geste automatique ─────────────────────────────────
-- Même vocabulaire que `via_smart_assign` (20260911090000) : sans ce drapeau,
-- l'inbox lit un acteur nul et affiche « Quelqu'un », et la timeline ne sait pas
-- nommer l'automatisation qui a bougé le ticket.
alter table public.issue_events
  add column if not exists via_automation boolean not null default false;
alter table public.notifications
  add column if not exists via_automation boolean not null default false;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new',
                  'pr_reviewed','pr_merged',
                  'automation_paused','automation_stopped'));

-- ── Diffusion de la chaîne ──────────────────────────────────────────────────
-- Une chaîne vit plusieurs minutes sans que personne ne touche à rien : sa barre
-- d'état est périmée dès la seconde qui suit son ouverture. C'est la seule
-- surface du produit où la péremption est CERTAINE — d'où le trigger, décalqué
-- de `broadcast_agent_run_row` (20260907090000) : même forme de message
-- (operation/table/schema/record/old_record), même topic `project:{id}`, seul
-- pont de lib/realtime-provider.tsx, et l'autorisation de réception est déjà
-- couverte par `members_receive_broadcasts`.
create or replace function public.broadcast_agent_chain_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  rec jsonb := null;
  old_rec jsonb := null;
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old);
  end if;

  if pid is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      'project:' || pid,
      true
    );
  end if;
  return null;
exception when others then
  -- Un échec de diffusion ne doit JAMAIS faire échouer l'avancement d'une chaîne.
  return null;
end;
$$;

drop trigger if exists agent_chains_broadcast_insert on public.agent_chains;
create trigger agent_chains_broadcast_insert
  after insert on public.agent_chains
  for each row execute function public.broadcast_agent_chain_row();

-- UPDATE filtré, comme les runs : la dépense se cumule à chaque fin d'étape, et
-- rediffuser une ligne dont rien de visible n'a bougé ne dirait rien à l'écran.
-- `spent_usd` EST visible ici (c'est la jauge de la barre), `updated_at` non.
drop trigger if exists agent_chains_broadcast_update on public.agent_chains;
create trigger agent_chains_broadcast_update
  after update on public.agent_chains
  for each row
  when (old.status is distinct from new.status
     or old.step is distinct from new.step
     or old.spent_usd is distinct from new.spent_usd
     or old.stop_reason is distinct from new.stop_reason)
  execute function public.broadcast_agent_chain_row();
