ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_credentials_check,
  DROP CONSTRAINT push_subscriptions_transport_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_credentials_check CHECK (
    (transport = 'web' AND p256dh IS NOT NULL AND auth IS NOT NULL AND native_installation_id IS NULL)
    OR
    (transport IN ('apns', 'wns') AND p256dh IS NULL AND auth IS NULL AND native_installation_id IS NOT NULL)
  ),
  ADD CONSTRAINT push_subscriptions_transport_check CHECK (
    transport IN ('web', 'apns', 'wns')
  );

COMMENT ON COLUMN public.push_subscriptions.native_installation_id IS
  'Stable installation identifier used to rotate native APNs tokens and WNS channel URIs without changing user preference.';
