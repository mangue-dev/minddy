-- MIN-138 — notifications de pull request.
-- L'auteur d'un run apprenait qu'on avait approuvé ou fusionné SA PR seulement
-- en ouvrant la page. Deux déclencheurs de plus, émis par les webhooks des deux
-- forges. Le CHECK inline de notifications.type est auto-nommé
-- <table>_<col>_check (même mécanique que 20260827090000_notifications_v2).
--
-- Rien à migrer côté issue_events : sa colonne `type` est du texte libre, sans
-- contrainte — les événements `pr_approved` & co y passent déjà.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new',
                  'pr_reviewed','pr_merged'));
