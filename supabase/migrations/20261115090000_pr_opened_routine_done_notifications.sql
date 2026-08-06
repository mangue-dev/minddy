-- minddy — deux déclencheurs d'inbox de plus.
--
--   • `pr_opened` : une pull request vient de s'ouvrir sur un dépôt lié à un
--     projet. TOUS les membres de ce projet l'apprennent, qu'elle vienne de Numo
--     ou d'un humain. Les deux types de PR existants (`pr_reviewed`,
--     `pr_merged`) ne parlent qu'à l'auteur du run ; l'OUVERTURE, elle, n'était
--     annoncée à personne — le moment où une PR attend des yeux était le seul
--     de sa vie à ne rien déclencher.
--   • `routine_done` : un passage de routine s'est terminé sans rien pousser.
--     Jusqu'ici il ne disait rien (seuls la PR ouverte et l'échec parlaient), et
--     une routine qui tourne bien était indiscernable d'une routine morte.
--
-- Le CHECK inline de notifications.type est auto-nommé <table>_<col>_check
-- (même mécanique que 20260921090000_pr_notifications).

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new',
                  'pr_reviewed','pr_merged','pr_opened',
                  'automation_paused','automation_stopped',
                  'routine_done'));

-- ── Où mène une notification de pull request ────────────────────────────────
-- La PR elle-même, sur la page Pull requests (`/pull-requests?pr=…`) — pas le
-- ticket, qu'une PR n'a pas forcément. Même raison que `routine_id`
-- (20261113090000) : une notification porte UNE cible, et sans colonne pour la
-- dire, `notificationTargetPath` rendrait la ligne inerte.
alter table public.notifications
  add column if not exists pull_request_id uuid
    references public.pull_requests(id) on delete cascade;

-- Une seule notification d'ouverture par PR. Le producteur le vérifie avant
-- d'écrire, parce qu'une même ouverture arrive par deux chemins : Numo qui
-- ouvre la PR, puis le webhook de la forge qui la rapporte. Cette lecture est le
-- seul accès par `pull_request_id`, d'où l'index partiel — il ne pèse que sur
-- les lignes qui portent une PR.
create index if not exists notifications_pull_request_id_idx
  on public.notifications(pull_request_id)
  where pull_request_id is not null;
