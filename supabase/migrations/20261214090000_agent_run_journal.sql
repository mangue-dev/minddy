-- MIN-286 — LE JOURNAL D'OPENCODE SORT DE LA LIGNE DU RUN.
--
-- La mémoire d'une session menée par opencode est un journal d'événements
-- (`/sync/history` → `/sync/replay`). Il vivait dans `agent_runs.checkpoint`, et
-- ça ne pouvait pas tenir, pour deux raisons mesurées le 2026-08-13 :
--
--   1. **il porte la sortie COMPLÈTE de chaque tool** — une lecture de fichier de
--      260 lignes pèse 22 Ko dans le journal, republiée deux à trois fois par
--      opencode (`pending`, `running`, `completed`). Le plafond de 3,2 Mo du
--      corps du plan de contrôle tombait donc au bout d'une quinzaine de
--      lectures : un tour de 31 minutes perdait TOUTE sa conversation, et le tour
--      suivant repartait du ticket comme s'il n'avait jamais travaillé ;
--   2. **la ligne du run est relue à chaque appel du plan de contrôle** (un
--      `getRun` par tool, par event, par ligne de ledger). Un journal de 333 Ko
--      s'y payait des centaines de fois par tour, pour rien.
--
-- D'où cette table : le journal s'ÉCRIT en append (un lot par sauvegarde, jamais
-- de relecture-réécriture), la ligne du run n'en garde qu'un pointeur minuscule
-- (`checkpoint.opencode = {sessionId, seq}`), et le tour suivant le rassemble
-- côté fonction avant de le passer à la microVM.

create table if not exists public.agent_run_journal (
  id          bigserial primary key,
  run_id      uuid not null references public.agent_runs(id) on delete cascade,
  -- La session opencode à laquelle ce lot appartient. Une remise à blanc de
  -- session (reprise impossible) écrit sous un id neuf, et le rassemblage ne
  -- prend que les lots de la session courante.
  session_id  text not null,
  -- Les events d'UN export incrémental, dans l'ordre rendu par `/sync/history`.
  events      jsonb not null,
  created_at  timestamptz not null default now()
);

comment on table public.agent_run_journal is
  'MIN-286 — journal d''événements d''une session opencode, en append. Réassemblé dans l''ordre de `id` pour rejouer la session sur une microVM neuve. Le pointeur (session courante + curseur de seq) vit dans agent_runs.checkpoint.opencode.';

-- Le seul accès : par run, dans l'ordre d'écriture.
create index if not exists idx_agent_run_journal_run
  on public.agent_run_journal(run_id, id);

alter table public.agent_run_journal enable row level security;

-- Aucune policy de lecture : ce journal n'est JAMAIS servi à un client. Il ne
-- sort de la base que côté serveur (clé de service), pour être remis à la
-- microVM qui reprend la session. Le fil, lui, se lit dans `agent_run_events`.
