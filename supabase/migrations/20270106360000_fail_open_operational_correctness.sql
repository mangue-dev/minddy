-- MIN-464: serialize Stripe entitlement writes by the event's source ordering.
-- Stripe retries and delivers events out of order, so arrival time cannot be
-- allowed to move a billing account back to an older subscription state.

create or replace function public.apply_stripe_billing_event(
  p_user_id uuid,
  p_event_id text,
  p_event_created timestamptz,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.billing_accounts%rowtype;
  v_unknown_keys text[];
begin
  if p_user_id is null
     or nullif(pg_catalog.btrim(p_event_id), '') is null
     or p_event_created is null
     or p_patch is null
     or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid Stripe billing event payload' using errcode = '22023';
  end if;

  select pg_catalog.array_agg(key order by key)
  into v_unknown_keys
  from pg_catalog.jsonb_object_keys(p_patch) as patch_key(key)
  where not (key = any (array[
    'stripe_customer_id',
    'stripe_subscription_id',
    'stripe_price_id',
    'stripe_plan_id',
    'stripe_subscription_status',
    'stripe_current_period_start',
    'stripe_current_period_end',
    'stripe_cancel_at_period_end',
    'stripe_checkout_session_id'
  ]::text[]));

  if v_unknown_keys is not null then
    raise exception 'Unsupported Stripe billing patch keys: %', v_unknown_keys
      using errcode = '22023';
  end if;

  insert into public.billing_accounts (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_plan_id,
    stripe_subscription_status,
    stripe_current_period_start,
    stripe_current_period_end,
    stripe_cancel_at_period_end,
    stripe_checkout_session_id,
    stripe_last_event_id,
    stripe_last_event_created
  ) values (
    p_user_id,
    p_patch->>'stripe_customer_id',
    p_patch->>'stripe_subscription_id',
    p_patch->>'stripe_price_id',
    p_patch->>'stripe_plan_id',
    p_patch->>'stripe_subscription_status',
    (p_patch->>'stripe_current_period_start')::timestamptz,
    (p_patch->>'stripe_current_period_end')::timestamptz,
    coalesce((p_patch->>'stripe_cancel_at_period_end')::boolean, false),
    p_patch->>'stripe_checkout_session_id',
    p_event_id,
    p_event_created
  )
  on conflict (user_id) do update
  set
    stripe_customer_id = case
      when p_patch ? 'stripe_customer_id' then excluded.stripe_customer_id
      else billing_accounts.stripe_customer_id
    end,
    stripe_subscription_id = case
      when p_patch ? 'stripe_subscription_id' then excluded.stripe_subscription_id
      else billing_accounts.stripe_subscription_id
    end,
    stripe_price_id = case
      when p_patch ? 'stripe_price_id' then excluded.stripe_price_id
      else billing_accounts.stripe_price_id
    end,
    stripe_plan_id = case
      when p_patch ? 'stripe_plan_id' then excluded.stripe_plan_id
      else billing_accounts.stripe_plan_id
    end,
    stripe_subscription_status = case
      when p_patch ? 'stripe_subscription_status' then excluded.stripe_subscription_status
      else billing_accounts.stripe_subscription_status
    end,
    stripe_current_period_start = case
      when p_patch ? 'stripe_current_period_start' then excluded.stripe_current_period_start
      else billing_accounts.stripe_current_period_start
    end,
    stripe_current_period_end = case
      when p_patch ? 'stripe_current_period_end' then excluded.stripe_current_period_end
      else billing_accounts.stripe_current_period_end
    end,
    stripe_cancel_at_period_end = case
      when p_patch ? 'stripe_cancel_at_period_end' then excluded.stripe_cancel_at_period_end
      else billing_accounts.stripe_cancel_at_period_end
    end,
    stripe_checkout_session_id = case
      when p_patch ? 'stripe_checkout_session_id' then excluded.stripe_checkout_session_id
      else billing_accounts.stripe_checkout_session_id
    end,
    stripe_last_event_id = excluded.stripe_last_event_id,
    stripe_last_event_created = excluded.stripe_last_event_created,
    updated_at = pg_catalog.now()
  where
    billing_accounts.stripe_last_event_created is null
    or billing_accounts.stripe_last_event_created < excluded.stripe_last_event_created
    or (
      billing_accounts.stripe_last_event_created = excluded.stripe_last_event_created
      and coalesce(billing_accounts.stripe_last_event_id, '') <= excluded.stripe_last_event_id
    )
  returning * into v_account;

  -- A stale event intentionally updates nothing. Return the winning row so the
  -- caller has the same result shape as an applied event.
  if v_account.user_id is null then
    select *
    into v_account
    from public.billing_accounts
    where user_id = p_user_id;
  end if;

  return pg_catalog.to_jsonb(v_account);
end;
$$;

revoke all on function public.apply_stripe_billing_event(uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_billing_event(uuid, text, timestamptz, jsonb)
  to service_role;
