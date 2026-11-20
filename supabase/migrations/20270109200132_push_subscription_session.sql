-- MIN-1025: a device stops receiving an account's pushes when the session that
-- registered it ends.
--
-- GoTrue deletes the `auth.sessions` row when that session signs out, when
-- another device uses "Sign out other devices", and when the session is
-- revoked. With this reference, the device's push row goes with it, whether or
-- not the client got to clean up: a phone that switched account or server no
-- longer shows the old account's notifications.
--
-- Additive and nullable: the deployed release keeps registering devices
-- without it, and rows registered before this change keep a NULL link until
-- the device reloads the app, which registers it again with its session.
BEGIN;
ALTER TABLE public.push_subscriptions
  ADD COLUMN auth_session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE;

-- The cascade looks rows up by session on every session delete.
CREATE INDEX push_subscriptions_auth_session_idx
  ON public.push_subscriptions (auth_session_id)
  WHERE auth_session_id IS NOT NULL;
COMMIT;
