-- Agent de code conversationnel (shift MIN-46).
--
-- L'agent devient une VRAIE session conversationnelle persistante (façon Claude
-- Code / Codex), jamais fermée : elle repose au statut `needs_input` entre les
-- tours (fin de tour, ask_user, ou interruption utilisateur), toujours reprennable
-- — y compris pour revenir demander des changements sur une PR bien plus tard.
--
-- Colonnes ajoutées :
--   • last_activity_at    — horloge d'inactivité (heartbeat client tant que la modal
--                           est ouverte + steer + entrée au repos). Pilote le reaping
--                           de la sandbox idle : on coupe la microVM après ~5 min
--                           d'inactivité, MAIS jamais tant que l'utilisateur écrit /
--                           attend une réponse (le heartbeat la garde fraîche).
--   • interrupt_requested — « Interrompre la réponse en cours » : posé par la route
--                           stop, lu par le chunk en cours (frontière de round ET
--                           pendant le stream LLM) qui suspend proprement au repos.
--   • sandbox_stopped_at  — microVM coupée par le reaper (null = vivante/inconnue).
--                           Évite de la re-couper en boucle ; remise à null quand
--                           l'exécuteur la réveille (snapshot persistant) ou re-clone.

alter table public.agent_runs
  add column if not exists last_activity_at   timestamptz not null default now(),
  add column if not exists interrupt_requested boolean     not null default false,
  add column if not exists sandbox_stopped_at  timestamptz;

-- File du reaper : sessions au repos dont la microVM est encore vivante et inactives.
create index if not exists idx_agent_runs_idle_sandbox
  on public.agent_runs (last_activity_at)
  where status = 'needs_input'
    and sandbox_id is not null
    and sandbox_stopped_at is null;
