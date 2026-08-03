-- minddy — MIN-168 : retrait de l'ancienne passe de review.
--
-- `pr_review_runs` / `pr_review_events` étaient le stockage d'une passe à un
-- tour : un appel modèle à sortie forcée, son flux d'étapes maison, son direct
-- maison. Depuis que la relecture est un RUN de l'agent
-- (20261006090000_agent_run_pull_request), tout ça a un équivalent qui existait
-- déjà : `agent_runs` porte la session, `agent_run_events` son déroulé, et le
-- topic `agent-run:{id}` son direct. Garder les deux tables ne laisserait qu'un
-- schéma que plus rien n'écrit et un topic que plus rien ne diffuse.
--
-- L'HISTORIQUE est perdu, et c'est assumé : ces lignes ne portent qu'un verdict
-- et un compte de commentaires. Ce que la passe a réellement écrit est SUR la
-- pull request — les commentaires de ligne et la synthèse y sont, chez la forge,
-- et ils y restent. `agent_runs`, lui, n'est pas touché.
--
-- ORDRE IMPORTANT. La policy de réception broadcast appelle
-- `can_watch_pr_review` dans une de ses branches ; supprimer la fonction avant
-- de réécrire la policy ferait LEVER l'évaluation, et une branche qui lève fait
-- tomber la policy ENTIÈRE — c'est-à-dire tout le temps réel, pas seulement le
-- direct des reviews. On remplace donc la policy d'abord, la fonction ensuite,
-- les tables en dernier.
--
-- `user_agent_preferences.pr_review_model` RESTE : le dernier modèle de review
-- choisi par un compte sert toujours, il est simplement lu depuis
-- `lib/server/agent/model.ts`.
--
-- Idempotent — safe to re-run.

-- ── 1. La policy, sans la branche `pr-review:` ─────────────────────────────
-- Reprise à l'identique de 20260929090000, moins cette branche-là.
drop policy if exists members_receive_broadcasts on realtime.messages;
create policy members_receive_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast' and (
    (
      realtime.topic() like 'project:%'
      and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'user:%'
      and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
    )
    or (
      -- Couvre désormais les sessions de RELECTURE : elles sont des runs, et
      -- cette fonction ne regarde que le projet du run.
      realtime.topic() like 'agent-run:%'
      and public.can_watch_agent_run(realtime.topic())
    )
    or (
      realtime.topic() like 'numo-comment:%'
      and public.can_watch_numo_comment(realtime.topic())
    )
    or (
      realtime.topic() like 'pull-request:%'
      and public.can_watch_pull_request(realtime.topic())
    )
  )
);

-- ── 2. La fonction du topic disparu ────────────────────────────────────────
drop function if exists public.can_watch_pr_review(text);

-- ── 3. Les tables ──────────────────────────────────────────────────────────
-- Les events d'abord (ils référencent la passe), puis la passe.
drop table if exists public.pr_review_events;
drop table if exists public.pr_review_runs;
