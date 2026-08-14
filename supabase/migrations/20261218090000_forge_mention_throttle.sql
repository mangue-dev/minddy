-- minddy — la limite de débit des mentions `@numo` écrites DEPUIS la forge (MIN-330).
--
-- Un commentaire de pull request qui dit `@numo` déclenche une relecture payée
-- par le propriétaire du projet. Le compteur qui borne ce déclenchement ne peut
-- pas vivre en mémoire : le récepteur de webhook est réparti (Fluid Compute
-- réutilise des instances, mais rien ne garantit qu'une rafale tombe sur la
-- même), et un compteur par instance ne borne alors rien du tout. Il vit donc
-- ici, dans la seule chose que toutes les instances partagent.
--
-- Une ligne = une clé (dépôt, ou dépôt+auteur) et sa fenêtre courante. La
-- fenêtre est GLISSANTE PAR PALIER : le premier coup après son expiration
-- rouvre une fenêtre neuve. C'est plus grossier qu'un vrai sliding window, et
-- suffisant : ce qu'on borne, c'est un abus à coût nul, pas une facturation.
create table if not exists public.forge_mention_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Aucune policy : la table n'est jamais lue ni écrite par un client. Seul le
-- récepteur de webhook y touche, en clé service (qui contourne RLS). RLS activée
-- quand même, pour qu'un accès `anon`/`authenticated` accidentel ne rende rien.
alter table public.forge_mention_throttle enable row level security;

revoke all on table public.forge_mention_throttle from anon, authenticated;

-- Compte ce déclenchement et rend le rang qu'il occupe dans sa fenêtre.
--
-- Le comptage et la lecture sont le MÊME ordre : deux commentaires simultanés
-- sur le même dépôt ne peuvent pas lire tous les deux « c'est mon premier ».
-- C'est tout l'intérêt de le faire en SQL plutôt qu'en `select` puis `update`.
--
-- Rend le compte, pas un booléen : l'appelant en a besoin pour répondre au
-- commentaire UNE seule fois (au franchissement), au lieu de poster un refus par
-- mention — ce qui ferait de la garde elle-même un amplificateur.
create or replace function public.claim_forge_mention(
  p_key text,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.forge_mention_throttle as t (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when t.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else t.count + 1
        end,
        window_start = case
          when t.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else t.window_start
        end,
        updated_at = now()
  returning t.count into v_count;

  -- Ménage opportuniste : la cardinalité de la table est celle des logins de
  -- forge croisés, qu'un attaquant peut faire grossir à volonté. Une chance sur
  -- cent par appel suffit à la tenir, et ne coûte rien au chemin normal.
  if random() < 0.01 then
    delete from public.forge_mention_throttle
    where window_start < now() - interval '7 days';
  end if;

  return v_count;
end;
$$;

revoke all on function public.claim_forge_mention(text, integer) from public, anon, authenticated;
grant execute on function public.claim_forge_mention(text, integer) to service_role;
