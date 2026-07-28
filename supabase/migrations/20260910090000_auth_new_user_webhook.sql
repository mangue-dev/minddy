-- minddy — l'alerte push « nouvel utilisateur », déclenchée à la CONFIRMATION.
--
-- Pourquoi un trigger écrit à la main plutôt qu'un Database Webhook du
-- dashboard : l'UI des webhooks ne liste que les schémas exposés, et `auth`
-- n'en fait pas partie — `auth.users` n'y est tout simplement pas
-- sélectionnable. Le webhook natif n'est de toute façon rien d'autre qu'un
-- trigger appelant `supabase_functions.http_request()` ; l'écrire ici le rend
-- versionné, relisible, et permet les deux garde-fous ci-dessous.
--
-- ── 1. Le signal est une TRANSITION, pas une création ────────────────────────
-- Un compte créé et jamais confirmé n'est pas un utilisateur : il ne doit rien
-- déclencher. Ce qu'on guette est `email_confirmed_at` qui passe de vide à
-- rempli :
--
--   INSERT sans email_confirmed_at  → rien   (inscription par mot de passe, en
--                                             attente du lien)
--   UPDATE vide → rempli            → PUSH   (le lien vient d'être ouvert)
--   INSERT avec email_confirmed_at  → PUSH   (OAuth : le provider atteste
--                                             l'adresse dès la création)
--   UPDATE rempli → rempli          → rien   (une connexion écrit
--                                             `last_sign_in_at` sur la même ligne)
--
-- La condition est dite DEUX FOIS, ici et dans la route
-- (app/api/webhooks/supabase/new-user/route.ts), et c'est volontaire : ici
-- c'est un FILTRE, qui évite une requête HTTP sortante depuis la base à chaque
-- connexion ; là-bas c'est la DÉCISION, qui reste vraie même si ce trigger est
-- un jour remplacé. `update of email_confirmed_at` réduit encore le bruit : le
-- trigger ne se réveille que si la colonne figure dans le SET.
--
-- ── 2. Le corps envoyé est MINIMAL ───────────────────────────────────────────
-- `to_jsonb(new)` — ce que fait le webhook natif — enverrait la ligne
-- `auth.users` ENTIÈRE, donc `encrypted_password`, les jetons de confirmation
-- et de récupération, à chaque alerte. On ne recopie que les quatre champs dont
-- la route a besoin. Un secret qu'on ne transporte pas est un secret qu'on ne
-- peut pas fuiter.
--
-- ── 3. Le secret n'est PAS dans ce fichier ───────────────────────────────────
-- Il vit dans le vault sous le nom `minddy_webhook_secret` et doit valoir la
-- variable Vercel `SUPABASE_WEBHOOK_SECRET`. Absent → la fonction ne fait rien
-- (elle n'échoue pas). Pour le poser ou le changer :
--   select vault.create_secret('<valeur>', 'minddy_webhook_secret');
--   select vault.update_secret(id, '<valeur>') from vault.secrets
--    where name = 'minddy_webhook_secret';
--
-- ── 4. Une alerte ratée ne casse JAMAIS une inscription ──────────────────────
-- Tout le corps est sous `exception when others`. Un trigger qui lève sur
-- `auth.users` rend la création de compte impossible — c'est le fameux
-- « Database error saving new user ». Aucune alerte d'exploitation ne vaut ça.
-- Même raison pour les GRANT à `supabase_auth_admin` plus bas : c'est ce rôle,
-- et non `postgres`, qui exécute les écritures de GoTrue.
--
-- Idempotent — safe to re-run.

-- Schéma non exposé : rien de tout ceci n'a à être joignable par PostgREST.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.on_auth_user_confirmed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  -- La transition, et rien d'autre.
  if new.email_confirmed_at is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'minddy_webhook_secret';

  -- Secret pas encore posé : on se tait plutôt que d'envoyer une requête que la
  -- route rejettera de toute façon (fail-closed côté app).
  if v_secret is null or v_secret = '' then
    return null;
  end if;

  perform net.http_post(
    url := 'https://www.minddy.app/api/webhooks/supabase/new-user',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-minddy-webhook-secret', v_secret
    ),
    -- Strictement ce que lit la route. Surtout PAS to_jsonb(new).
    body := jsonb_build_object(
      'type', tg_op,
      'schema', 'auth',
      'table', 'users',
      'record', jsonb_build_object(
        'email', new.email,
        'email_confirmed_at', new.email_confirmed_at,
        'raw_user_meta_data', new.raw_user_meta_data,
        'raw_app_meta_data', new.raw_app_meta_data
      ),
      'old_record', case
        when tg_op = 'UPDATE'
        then jsonb_build_object('email_confirmed_at', old.email_confirmed_at)
        else null
      end
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  -- Journalisé, jamais propagé : l'inscription passe quoi qu'il arrive.
  raise warning '[minddy] alerte nouvel utilisateur non envoyée : %', sqlerrm;
  return null;
end;
$$;

-- GoTrue écrit sous `supabase_auth_admin`, pas sous `postgres`.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.on_auth_user_confirmed() to supabase_auth_admin;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.on_auth_user_confirmed();
