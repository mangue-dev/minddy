-- minddy — MIN-72 (retours v3) : usage du header en temps réel.
--
-- Même mécanique que 20260713090000_realtime_broadcast : un trigger par table
-- pousse l'écriture sur le topic privé `user:{user_id}` via
-- realtime.broadcast_changes ; le RealtimeProvider (seul abonné) invalide les
-- caches React Query `["billing", …]`. Pas de postgres_changes — la RLS
-- deny-all d'`ai_usage` reste intacte, l'autorisation est celle du topic.
--
-- ai_usage est un ledger append-only → INSERT seul ; les lignes de fond sans
-- user_id (board public) ne notifient personne. billing_accounts notifie
-- aussi les UPDATE (sync Stripe, override admin).

create or replace function public.broadcast_billing_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  if uid is not null then
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists ai_usage_broadcast on public.ai_usage;
create trigger ai_usage_broadcast
  after insert on public.ai_usage
  for each row execute function public.broadcast_billing_row();

drop trigger if exists billing_accounts_broadcast on public.billing_accounts;
create trigger billing_accounts_broadcast
  after insert or update on public.billing_accounts
  for each row execute function public.broadcast_billing_row();
