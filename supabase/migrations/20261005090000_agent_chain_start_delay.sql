-- minddy — MIN-147 : le SURSIS avant l'amorçage d'une chaîne.
--
-- Faire glisser une carte vers « à faire » est un geste FAIBLE : on le fait en
-- triant, parfois par erreur, et on change d'avis dans la minute. Cliquer
-- « lancer Numo » est un geste fort. L'automatisation transformait le geste
-- faible en dépense immédiate — c'est cette disproportion que le sursis corrige.
--
-- Sémantique reprise du `for:` des règles d'alerte Prometheus : la condition doit
-- tenir EN CONTINU pendant le délai. Quand le minuteur sonne, le ticket doit
-- toujours être dans le statut qui a ouvert la chaîne, sinon elle est annulée —
-- et c'est ce qui, sans rien tracker de plus, couvre « j'ai copié le prompt pour
-- le faire moi-même » (la copie déplace le ticket en `in_progress`), « je l'ai
-- remis en backlog », « je l'ai classé », « je l'ai assigné à quelqu'un ».
--
-- Le sursis ne vaut QUE pour l'amorçage. Une fois la chaîne partie, ses étapes
-- s'enchaînent sans attendre : on est déjà engagé.
--
-- Idempotent — safe to re-run.

-- ── Le statut « en sursis » ─────────────────────────────────────────────────
alter table public.agent_chains drop constraint if exists agent_chains_status_check;
alter table public.agent_chains add constraint agent_chains_status_check
  check (status in ('pending','running','awaiting_human','stopped','completed','failed'));

-- Quand la chaîne a le droit de démarrer. Null = tout de suite (délai à zéro).
alter table public.agent_chains
  add column if not exists not_before timestamptz;

-- L'événement qui l'a ouverte, mis de côté pour être REJOUÉ au réveil : `{to,
-- source}`. `to` sert aussi de condition de survie — le ticket doit toujours y
-- être. Le garder ici plutôt que de le redéduire évite de deviner, au réveil,
-- pourquoi la chaîne avait été ouverte.
alter table public.agent_chains
  add column if not exists pending_event jsonb;

-- ── Une seule chaîne vivante par ticket, sursis COMPRIS ─────────────────────
-- Sans ça, un ticket en sursis accepterait une deuxième chaîne — et les deux
-- démarreraient. `pending` occupe donc le ticket, exactement comme `running`.
drop index if exists idx_agent_chains_active_issue;
create unique index if not exists idx_agent_chains_active_issue
  on public.agent_chains(issue_id)
  where status in ('pending','running','awaiting_human');

-- La file du balayeur : les chaînes dues, les plus anciennes d'abord.
create index if not exists idx_agent_chains_pending_due
  on public.agent_chains(not_before)
  where status = 'pending';

-- ── Diffusion ───────────────────────────────────────────────────────────────
-- La barre affiche un compte à rebours : `not_before` est donc une colonne
-- VISIBLE au même titre que le statut ou l'étape. (`pending` → `running` change
-- déjà le statut, donc diffuse ; c'est la pose du sursis qu'il faut ajouter.)
drop trigger if exists agent_chains_broadcast_update on public.agent_chains;
create trigger agent_chains_broadcast_update
  after update on public.agent_chains
  for each row
  when (old.status is distinct from new.status
     or old.step is distinct from new.step
     or old.spent_usd is distinct from new.spent_usd
     or old.not_before is distinct from new.not_before
     or old.stop_reason is distinct from new.stop_reason)
  execute function public.broadcast_agent_chain_row();
