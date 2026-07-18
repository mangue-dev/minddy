-- minddy — Scratchpad : synchronisation concurrente (UI ↔ MCP)
--
-- Deux écrivains sur la note perso UNIQUE : l'éditeur WYSIWYG (autosave, client
-- RLS) et l'agent de l'utilisateur via le MCP (client service). Sans garde, le
-- dernier qui écrit écrase l'autre → retours de version, perte de modifs. On
-- ajoute :
--   1. `rev` — un compteur de version pour l'écriture conditionnelle
--      (compare-and-swap côté serveur, cf. lib/server/scratchpad.ts). Le client
--      fusionne 3-way (lib/scratchpad.ts) et réessaie sur conflit.
--   2. un trigger de broadcast realtime sur le topic privé `user:{user_id}`
--      (même mécanique que 20260713090000_realtime_broadcast / billing_realtime)
--      pour que l'éditeur ouvert se rafraîchisse quand l'agent écrit.
-- Idempotent — safe to re-run.

alter table public.user_scratchpad
  add column if not exists rev bigint not null default 0;

-- Realtime : chaque écriture pousse sur le topic perso ; le RealtimeProvider
-- (seul abonné, lib/realtime-provider.tsx) invalide le cache React Query
-- ["me","scratchpad"]. Wrapped pour qu'un échec realtime ne casse jamais l'écriture.
create or replace function public.broadcast_scratchpad_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists user_scratchpad_broadcast on public.user_scratchpad;
create trigger user_scratchpad_broadcast
  after insert or update or delete on public.user_scratchpad
  for each row execute function public.broadcast_scratchpad_row();
