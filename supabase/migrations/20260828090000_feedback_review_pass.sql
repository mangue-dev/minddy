-- minddy — MIN-87 : une SEULE passe de revue du feedback.
--
-- Jusqu'ici deux passes indépendantes tournaient à la suite sur le même cron :
-- le dédoublonnage (MIN-37, `analyzed_at`) puis la classification (MIN-54,
-- `classified_at`). Deux appels LLM par post, et surtout le MAUVAIS ORDRE : un
-- post fusionné sort de la file de classification (le claim exclut
-- `merged_into_id`), donc un junk pouvait être absorbé par un vrai post — sa
-- voix gonflant le canonique — et un rapport de sécurité pouvait être fusionné
-- AVANT d'être détecté sensible, donc ne jamais être signalé à l'équipe.
--
-- On unifie : un seul claim, une seule décision (modérer → catégoriser →
-- dédoublonner). Le bookkeeping vit désormais entièrement sur les colonnes
-- `analysis_*` (lease + compteur d'échecs) ; `analyzed_at` et `classified_at`
-- restent deux marqueurs de complétion distincts (un post d'avant la migration
-- peut avoir l'un sans l'autre — il repasse alors une fois par la passe unifiée).
-- Idempotent — safe to re-run.

-- ── Claim unifié (miroir de _for_analysis : skip locked + lease 15 min
--    auto-guérissant, abandon après 3 échecs) ─────────────────────────────────
create or replace function public.claim_feedback_posts_for_review(p_limit integer)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id in (
     select id from public.feedback_posts
      where (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_posts_for_review(integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_posts_for_review(integer) to service_role;

-- Même claim, ciblé sur UN post : la revue immédiate déclenchée à la soumission
-- (`after()`) doit prendre exactement les mêmes garanties que le cron, sinon les
-- deux pourraient traiter le même post en parallèle.
create or replace function public.claim_feedback_post_for_review(p_post uuid)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id = (
     select id from public.feedback_posts
      where id = p_post
        and (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_post_for_review(uuid) from public, anon, authenticated;
grant execute on function public.claim_feedback_post_for_review(uuid) to service_role;

-- Scan de la passe unifiée (remplace les deux index de scan par passe).
create index if not exists feedback_posts_to_review
  on public.feedback_posts (created_at)
  where (analyzed_at is null or classified_at is null) and merged_into_id is null;

drop index if exists public.feedback_posts_to_analyze;
drop index if exists public.feedback_posts_to_classify;

-- ── Nettoyage de l'ancienne passe de classification ──────────────────────────
drop function if exists public.claim_feedback_posts_for_classification(integer);

alter table public.feedback_posts
  drop column if exists classification_claimed_at,
  drop column if exists classification_failures;

-- Le claim de dédoublonnage seul n'a plus d'appelant (la passe unifiée le
-- remplace) ; celui des facettes est déjà mort depuis le retrait des facettes.
drop function if exists public.claim_feedback_posts_for_analysis(integer);

-- ── Purge du junk (« supprimer les feedbacks farce ») ────────────────────────
-- Durée de rétention d'un post rejeté avant suppression définitive par le cron.
-- 0 désactive la purge. La suppression est un vrai DELETE : toutes les
-- dépendances (votes, commentaires, événements, notifications, pièces jointes)
-- sont en `on delete cascade`.
insert into public.app_config (key, value) values
  ('feedback_junk_purge_days', '30')
on conflict (key) do nothing;
