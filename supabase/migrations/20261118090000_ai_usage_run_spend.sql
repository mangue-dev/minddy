-- minddy — ce qu'un run a VRAIMENT dépensé, lu au ledger.
--
-- `agent_runs.cost_usd` n'est écrit que par les chemins de sortie SAINS du chunk.
-- Un chunk qui lève au milieu (un `commitAndPush` qui échoue), ou dont
-- l'invocation Vercel est tuée à la limite de durée, n'écrit rien du tout — alors
-- que ses appels modèle, eux, sont bien au ledger `ai_usage`. Le plafond de
-- dépense d'un passage (`budget_usd − cost_usd`) se recharge donc d'autant : un
-- run à 0,75 $ dont le deuxième chunk meurt après 0,40 $ repart au troisième avec
-- 0,40 $ de restant qui n'existent plus, et finit au-dessus de son plafond.
--
-- La colonne ne peut pas être la source : elle dépend d'une écriture que
-- justement l'accident empêche. Le ledger, lui, est écrit APPEL PAR APPEL, avant
-- l'accident — c'est déjà la doctrine du quota du compte (`get_user_usage_since`,
-- relu à chaque chunk). Cette fonction l'applique au plafond du run.
--
-- La somme porte TOUTES les lignes du run_id, `sandbox_compute` comprise : les
-- minutes de microVM sont de la dépense au même titre que les tokens, elles
-- entrent dans le budget de l'utilisateur, et un plafond qui les ignore ne borne
-- que la moitié de la facture.
--
-- En SQL et pas en JS : PostgREST plafonne une lecture de lignes (1 000 par
-- défaut), et un run bavard en aligne plus que ça — la somme serait alors
-- silencieusement basse, c'est-à-dire exactement le défaut qu'on corrige.
create or replace function public.get_ai_run_spend(p_run_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(cost, 0)), 0)
  from public.ai_usage
  where run_id = p_run_id;
$$;

-- Réservé au service_role, comme les deux autres agrégats du ledger : seul du
-- code serveur l'appelle (la boucle d'exécution de l'agent), jamais un client.
revoke all on function public.get_ai_run_spend(uuid) from public;
grant execute on function public.get_ai_run_spend(uuid) to service_role;
