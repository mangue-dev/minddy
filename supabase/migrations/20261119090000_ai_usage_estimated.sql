-- minddy — distinguer un coût FACTURÉ d'un coût ESTIMÉ dans le ledger.
--
-- Un round interrompu (« Stop »), un stream coupé en vol, un essai que la boucle
-- de reprise jette pour en relancer un autre : le fournisseur a répondu, donc il
-- a facturé — la doc OpenRouter est explicite, l'annulation arrête la
-- facturation chez les providers qui la supportent, et chez les autres « you
-- will be billed for the complete response ». Mais l'objet `usage` d'OpenRouter
-- n'arrive QU'AU DERNIER chunk du flux : un essai avorté n'a donc pas de coût
-- rapporté, et il n'écrivait aucune ligne du tout. La dépense sortait du quota
-- du compte, du plafond de run (`get_ai_run_spend`) et de la facture, sur un
-- geste que l'utilisateur peut déclencher à volonté.
--
-- La ligne s'écrit désormais quand même, au prix publié du modèle × les tokens
-- observés. C'est un MINORANT, pas une facture — d'où cette colonne : sans elle,
-- un chiffre calculé se lirait sur l'admin finance comme un chiffre rapporté, et
-- la marge du mois se comparerait à des dollars qui n'ont jamais été relevés.
-- Le défaut est `false` : toutes les lignes déjà écrites viennent bien du
-- fournisseur.
alter table public.ai_usage
  add column if not exists estimated boolean not null default false;

-- Le drill-down d'un run (admin finance) le rend, comme le reste de la ligne.
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
