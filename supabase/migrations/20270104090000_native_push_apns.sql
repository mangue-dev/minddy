-- minddy — APNs pour l'app macOS (MIN-356).
--
-- `push_subscriptions` portait jusqu'ici uniquement le triplet Web Push
-- endpoint/p256dh/auth. L'app Electron n'embarque aucun service Web Push : son
-- adresse est un token APNs, sans clés RFC 8291. Une seule table garde le bon
-- modèle produit (un appareil activable par ligne), tandis que `transport`
-- choisit l'émetteur serveur.

alter table public.push_subscriptions
  add column if not exists transport text not null default 'web';

alter table public.push_subscriptions
  add column if not exists native_installation_id text;

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_transport_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_transport_check
  check (transport in ('web', 'apns'));

-- Un abonnement Web reste complet. Un token APNs ne doit jamais se retrouver
-- avec des clés RFC 8291 résiduelles : cela rendrait le choix de transport
-- ambigu et risquerait d'envoyer un secret au mauvais fournisseur.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_credentials_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_credentials_check
  check (
    (transport = 'web' and p256dh is not null and auth is not null
      and native_installation_id is null)
    or
    (transport = 'apns' and p256dh is null and auth is null
      and native_installation_id is not null)
  );

create index if not exists push_subscriptions_native_installation_idx
  on public.push_subscriptions(native_installation_id)
  where native_installation_id is not null;

create index if not exists idx_push_subscriptions_active_transport
  on public.push_subscriptions(user_id, transport)
  where enabled = true;
