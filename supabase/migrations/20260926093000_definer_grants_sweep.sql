-- minddy — MIN-118 (suite) : verrouillage de TOUTES les fonctions SECURITY DEFINER.
--
-- 20260926090000 n'a fermé qu'une fonction (`reconcile_objective_status`), sur
-- la foi d'un audit qui la disait « seule sans la paire revoke/grant ». C'était
-- faux : neuf autres definers ne révoquaient que `from public`, ce qui ne suffit
-- PAS chez Supabase.
--
-- Pourquoi : le bootstrap Supabase pose
--   alter default privileges in schema public grant all on functions
--     to postgres, anon, authenticated, service_role;
-- Toute fonction créée dans `public` reçoit donc un EXECUTE **explicite** pour
-- `anon` et `authenticated`, EN PLUS du grant implicite à PUBLIC. Révoquer
-- « from public » ne retire que le second : les deux premiers restent.
--
-- Constaté EN PROD avant cette migration, avec la seule clé anon publique et
-- aucune session (POST /rest/v1/rpc/…) :
--   get_admin_users_overview → 200, la liste des comptes AVEC LES EMAILS
--   get_ai_usage_stats       → 200, le coût IA total de l'app
--   get_ai_cost_daily        → 200, le coût quotidien en EUR/USD
--   get_agent_quota_usage    → 200, user_id + dépense du mois par compte
--   get_user_usage_since / get_user_usage_history → 200, l'usage de N'IMPORTE
--                              QUEL user_id passé en paramètre
--   get_ai_run_calls         → 200, le détail d'appels de n'importe quel run
--   claim_agent_run          → 200, une ÉCRITURE : réserver le run d'un autre
--
-- La boucle ci-dessous est la garde structurelle : elle vaut pour les fonctions
-- d'aujourd'hui ET pour celles de demain (la prochaine `revoke … from public`
-- écrite de bonne foi sera rattrapée au prochain passage de cette migration).
--
-- L'allowlist tient en cinq noms, et ce sont les seuls definers que
-- `authenticated` DOIT pouvoir exécuter :
--   - can_access_project / is_project_member / is_project_owner : appelées
--     depuis les policies RLS elles-mêmes — le contrôle de privilège d'une
--     expression de policy se fait au nom de l'appelant, les révoquer casserait
--     toutes les lectures RLS ;
--   - can_watch_agent_run / can_watch_numo_comment : idem pour les policies de
--     `realtime.messages`.
-- Toutes les cinq ne répondent que sur l'accès de l'APPELANT (`auth.uid()`) :
-- les exposer ne révèle rien qu'il ne sache déjà.
--
-- Les fonctions trigger sont hors sujet (non appelables via PostgREST, et le
-- privilège d'un trigger se vérifie à la création, pas au déclenchement).
--
-- Idempotent — safe to re-run.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef                            -- SECURITY DEFINER
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and p.proname not in (
        'can_access_project',
        'is_project_member',
        'is_project_owner',
        'can_watch_agent_run',
        'can_watch_numo_comment'
      )
      -- Jamais une fonction appartenant à une extension : ses grants sont
      -- l'affaire de l'extension, pas la nôtre.
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
