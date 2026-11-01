-- MIN-875: which of my Realtime topics received a data change in the last
-- moments.
--
-- When a page loads, its first reads start before its private channels join.
-- A write committed between a read and the join is never delivered, so the
-- client used to re-read every query of every scope once its channels joined:
-- ~20-25 requests on each cold load, almost always for nothing. With this
-- function it asks first, and re-reads only the scopes whose topic received a
-- change during the load.
--
-- It returns topic names only, never a message: the payloads stay on the
-- channel, under the members_receive_broadcasts policy. A topic is answered
-- only under that policy's own conditions (project access or the user's own
-- topic, at the current generation), so it reveals nothing the caller could
-- not receive by joining the channel. The window is a duration measured by the
-- client, applied to the database clock: device clock skew does not move it.

CREATE OR REPLACE FUNCTION public.realtime_topics_changed_since(
  p_topics text[],
  p_window_ms integer
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  topic text;
  readable text[] := '{}';
  changed text[];
BEGIN
  IF NOT public.mfa_aal_ok()
     OR NOT public.auth_session_is_current() THEN
    RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
  END IF;
  IF p_topics IS NULL OR cardinality(p_topics) > 64
     OR p_window_ms IS NULL OR p_window_ms < 0 OR p_window_ms > 600000 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Realtime change window';
  END IF;

  FOREACH topic IN ARRAY p_topics LOOP
    IF (topic LIKE 'project:%'
          AND public.can_access_project(public.topic_uuid(topic))
          AND public.realtime_topic_is_current(topic))
       OR (topic LIKE 'user:%'
          AND split_part(topic, ':', 2) = (SELECT auth.uid()::text)
          AND public.realtime_topic_is_current(topic)) THEN
      readable := readable || topic;
    ELSE
      RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT message.topic), '{}')
    INTO changed
    FROM realtime.messages AS message
   WHERE message.inserted_at >= now() - make_interval(secs => p_window_ms / 1000.0)
     AND message.extension = 'broadcast'
     AND message.event IN ('INSERT', 'UPDATE', 'DELETE')
     AND message.topic = ANY (readable);
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.realtime_topics_changed_since(text[], integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.realtime_topics_changed_since(text[], integer)
  TO authenticated, service_role;
