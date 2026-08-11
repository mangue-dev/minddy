-- minddy — MIN-278 : « une page qui change le fait savoir ».
--
-- Une page pouvait changer sans que rien ne se passe : pas de notification, pas
-- de ligne d'activité. Trois branchements, un seul mécanisme de chaque côté —
-- les notifications existantes, et le journal d'activité polymorphe.
--
--   • `page_mention` : on m'a cité dans une page. Le nœud de mention est monté
--     dans l'éditeur de page depuis MIN-273 ; écrire « @Clément » y était la
--     seule mention de l'app qui ne prévenait personne.
--   • `page_agent_edit` : l'agent a écrit dans une page. Le pendant de MIN-277 —
--     l'historique permet de revenir en arrière, encore faut-il SAVOIR qu'il
--     s'est passé quelque chose. Destinataire : celui qui a lancé le run, et lui
--     seul (tout le projet serait du bruit).
--
-- Aucun type « quelqu'un a modifié une page » : ça vit dans l'ACTIVITÉ, qu'on
-- consulte, pas dans les notifications, qui interrompent.
--
-- Idempotent — safe to re-run.

-- ── notifications : deux types de plus ───────────────────────────────────────
-- Le CHECK inline de notifications.type est auto-nommé <table>_<col>_check :
-- il se reprend EN ENTIER, la liste recopiée (même mécanique que
-- 20260921090000_pr_notifications et 20261115090000).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new',
                  'pr_reviewed','pr_merged','pr_opened',
                  'automation_paused','automation_stopped',
                  'routine_done',
                  'page_mention','page_agent_edit'));

-- ── Où mène une notification de page ────────────────────────────────────────
-- La PAGE, dans le wiki de son projet. Une notification porte UNE cible, et
-- sans colonne pour la dire `notificationTargetPath` rendrait la ligne inerte —
-- même raison que `routine_id` (20261113090000) et `pull_request_id`
-- (20261115090000).
alter table public.notifications
  add column if not exists page_id uuid
    references public.pages(id) on delete cascade;

-- Le BLOC, quand la mention a été posée dans un bloc identifié : c'est l'ancre
-- de `blockLink` (components/pages/block-actions.ts), un fragment d'URL. Du
-- texte nu et pas une clé étrangère — un id de bloc vit dans un document
-- ProseMirror, aucune table ne le porte, et il disparaît avec le paragraphe
-- qu'on efface. La cible retombe alors sur la page, ce qui est le bon repli.
alter table public.notifications
  add column if not exists block_id text;

-- La coalescence des écritures d'agent lit les lignes non lues d'une page
-- (`replaceUnread`, lib/server/notifications.ts) : c'est le seul accès par
-- `page_id`, d'où l'index partiel — il ne pèse que sur les lignes qui en portent.
create index if not exists notifications_page_id_idx
  on public.notifications(page_id)
  where page_id is not null;

-- ── issue_events : un QUATRIÈME parent ──────────────────────────────────────
-- Le journal d'activité est polymorphe depuis les objectifs (20260728091000) et
-- les posts de feedback (20260730090000). Une page est le parent suivant :
-- « créée / modifiée / mise à la corbeille / restaurée », avec son auteur.
-- Une table page_events parallèle aurait redemandé son API, son hydratation
-- d'acteurs et son rendu.
alter table public.issue_events
  add column if not exists page_id uuid
    references public.pages(id) on delete cascade;

create index if not exists idx_issue_events_page
  on public.issue_events(page_id, created_at)
  where page_id is not null;

-- Exactement-un-parent, maintenant sur quatre colonnes (les rows existantes en
-- portent toutes exactement une → num_nonnulls = 1 tient déjà).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'issue_events_parent_ck') then
    alter table public.issue_events drop constraint issue_events_parent_ck;
  end if;
  alter table public.issue_events
    add constraint issue_events_parent_ck
    check (num_nonnulls(issue_id, objective_id, feedback_post_id, page_id) = 1);
end $$;

-- Lecture : membre du projet de la page, comme pour les deux autres branches.
-- (La branche feedback reste absente, cf. 20260730090000 : le feedback est lu
-- en service-role, ses gardes vivent dans lib/server/feedback/*.)
drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events for select
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_events.issue_id and public.can_access_project(i.project_id)
    )
    or exists (
      select 1 from public.objectives o
      where o.id = issue_events.objective_id and public.can_access_project(o.project_id)
    )
    or exists (
      select 1 from public.pages p
      where p.id = issue_events.page_id and public.can_access_project(p.project_id)
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Un diffuseur À PART pour `issue_events`, et c'est le point délicat de cette
-- migration : `broadcast_activity_scoped` sert AUSSI la table `comments`, qui
-- n'a pas de colonne `page_id`. Lui ajouter la branche de page y ferait lever
-- `new.page_id` à chaque commentaire — et comme le corps se termine par un
-- `exception when others then return null`, la panne serait SILENCIEUSE : plus
-- aucun commentaire diffusé en temps réel, sans une ligne d'erreur nulle part.
-- D'où la copie, plutôt que la branche : `comments` garde sa fonction, et
-- `issue_events` prend celle qui connaît ses quatre parents.
create or replace function public.broadcast_event_scoped()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  elsif coalesce(new.page_id, old.page_id) is not null then
    select project_id into pid from public.pages
     where id = coalesce(new.page_id, old.page_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists issue_events_broadcast on public.issue_events;
create trigger issue_events_broadcast
  after insert or update or delete on public.issue_events
  for each row execute function public.broadcast_event_scoped();
