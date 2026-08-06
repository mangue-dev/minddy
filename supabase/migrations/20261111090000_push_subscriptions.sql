-- minddy — abonnements Web Push, un par APPAREIL (MIN-183).
--
-- Ce qui tombe dans l'inbox doit pouvoir sonner ailleurs que dans l'onglet
-- ouvert : notification système sur la PWA installée, notification web sur le
-- bureau. Le standard, c'est Web Push + VAPID, et son objet de base est un
-- `PushSubscription` — une URL opaque (`endpoint`) chez le service de push du
-- navigateur (FCM pour Chrome, Mozilla pour Firefox, Apple pour Safari), plus
-- deux clés qui chiffrent la charge utile de bout en bout.
--
-- Une ligne = un appareil, et non un compte : un abonnement appartient à un
-- couple (navigateur, profil), pas à une personne. Quelqu'un qui travaille sur
-- un portable et un téléphone en a deux, et doit pouvoir couper l'un sans
-- toucher l'autre, ou retirer l'ancien quand il change de téléphone. D'où
-- `enabled` (couper sans désinscrire — la permission navigateur reste acquise,
-- l'appareil se rallume d'un clic) EN PLUS de la suppression franche.
--
--   • `endpoint`     = l'identité de l'abonnement, et donc la CLÉ MÉTIER. Unique :
--                      un navigateur qui se ré-abonne, ou qu'on repartage entre
--                      deux comptes, DÉPLACE sa ligne au lieu d'en créer une
--                      seconde qui recevrait les notifications de quelqu'un
--                      d'autre. L'upsert de la route s'appuie dessus.
--   • `p256dh`/`auth`= les clés du chiffrement RFC 8291. Des SECRETS d'appareil :
--                      ils ne ressortent ni de l'API, ni de l'export RGPD.
--   • `locale`       = la langue AU MOMENT de l'abonnement, par appareil. Le
--                      choix de langue de minddy est un cookie (`NEXT_LOCALE`),
--                      illisible depuis un job de fond qui pousse pour le compte
--                      de quelqu'un d'autre. Et c'est le bon grain : le téléphone
--                      en français et le portable de travail en anglais sont deux
--                      appareils, pas un compte indécis.
--   • `failure_count`= les échecs transitoires (429, 5xx) s'accumulent ici ; un
--                      404/410 (appareil désinstallé ou abonnement révoqué), lui,
--                      supprime la ligne à la volée côté envoi.
--
-- RLS : self-manage strict — chacun ne voit et n'écrit que ses appareils. Les
-- routes de gestion passent par le client AUTHENTIFIÉ (c'est la RLS qui garantit
-- la propriété, pas un `eq("user_id", …)` qu'on peut oublier) ; seul l'envoi,
-- qui écrit pour le compte d'un autre, prend le client service.
-- Idempotent — safe to re-run.

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  device_label  text,
  user_agent    text,
  locale        text not null default 'en',
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  last_push_at  timestamptz,
  failure_count int not null default 0
);

-- Les deux seules lectures : la liste des appareils d'un compte (réglages, du
-- plus récent au plus ancien) et la cible d'un envoi (les mêmes, filtrés sur
-- `enabled`).
create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id, created_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));
