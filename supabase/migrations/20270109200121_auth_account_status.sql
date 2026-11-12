-- The single sign-in and sign-up screen (MIN-907) asks, once an address is
-- typed, whether to ask for the account's password or to create one. This
-- answers it without paging through the Auth admin API: `new` when no account
-- holds the address, `password` when one signs in with a password, `oauth`
-- when one exists but only signs in through a provider.
--
-- Only the service role may call it: `/api/auth/lookup` rate-limits the
-- question per address and per client before asking.
create or replace function public.auth_account_status(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.id is null then 'new'
    when u.encrypted_password is not null and u.encrypted_password <> '' then 'password'
    else 'oauth'
  end
  from (select 1) as anchor
  left join auth.users as u
    on lower(u.email) = lower(trim(p_email))
   and u.deleted_at is null
  order by u.created_at nulls last
  limit 1;
$$;

revoke all on function public.auth_account_status(text) from public, anon, authenticated;
grant execute on function public.auth_account_status(text) to service_role;
