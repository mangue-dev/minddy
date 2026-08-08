-- minddy — lire le prompt caching au ledger (MIN-242).
--
-- Le prompt caching était la seule optimisation du harness dont le prix soit
-- chiffré (27,85 $ au lieu de 3,35 $ sur un run type), et la seule qu'on ne
-- savait pas OBSERVER : `ai_usage` porte les tokens de prompt, jamais la part
-- que le fournisseur a relue dans son cache. Répondre à « le cache mord-il ? »
-- demandait de ressortir chaque `generation_id` et d'interroger l'API
-- `generation` d'OpenRouter, un appel réseau par ligne — ce qui, en pratique,
-- veut dire que la question ne se posait jamais.
--
-- OpenRouter rend pourtant les deux nombres dans l'`usage` de CHAQUE réponse,
-- streamée comprise (`prompt_tokens_details`). Il suffisait de les écrire.
--
--   cached_tokens       ce que le fournisseur a RELU (facturé une fraction du
--                       prix d'entrée : le taux de hit se lit `cached_tokens /
--                       prompt_tokens`)
--   cache_write_tokens  ce qu'il vient d'y ÉCRIRE (facturé une prime — 1,25× chez
--                       Anthropic) : sans lui, un breakpoint mal placé qui
--                       réécrit le cache à chaque round se lirait comme un gain.
--
-- NULLABLES, sans défaut, et c'est le point : `null` dit « ce fournisseur ne
-- parle pas de cache », `0` dit « le cache n'a pas mordu ». Un défaut à 0
-- confondrait les deux, et toutes les lignes déjà écrites — qui ne savent rien —
-- se liraient comme des ratés du cache.
alter table public.ai_usage
  add column if not exists cached_tokens integer,
  add column if not exists cache_write_tokens integer;

-- Le drill-down d'un run (admin finance) les rend, comme le reste de la ligne :
-- c'est round par round que le décrochage se voit — les tokens cachés qui
-- restent FIGÉS pendant que le prompt grossit sont la signature d'un breakpoint
-- posé en tête et de rien à la fin.
create or replace function public.get_ai_run_calls(p_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'seq', seq, 'feature', feature, 'model', model,
        'generation_id', generation_id, 'prompt_tokens', prompt_tokens,
        'completion_tokens', completion_tokens, 'total_tokens', total_tokens,
        'cached_tokens', cached_tokens, 'cache_write_tokens', cache_write_tokens,
        'cost', cost, 'estimated', estimated, 'created_at', created_at
      ) order by seq asc, created_at asc
    ),
    '[]'::jsonb
  )
  from public.ai_usage
  where run_id = p_run_id;
$$;

-- Mêmes grants qu'à sa création (20260803090000) : `create or replace` conserve
-- les droits, on les réaffirme pour que la migration se relise seule.
revoke all on function public.get_ai_run_calls(uuid) from public;
grant execute on function public.get_ai_run_calls(uuid) to service_role;
