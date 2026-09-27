-- Run only against an isolated database after the push content migration.
BEGIN;
DO $$
DECLARE owner uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid();
  digest text:=repeat('a',64); second_digest text:=repeat('b',64);
  native_digest text:=repeat('c',64);
  cipher text:='mdye3:{"format":3,"keyVersion":1,"iv":"YWJj","tag":"YWJj","data":"YWJj"}';
  registered public.push_subscriptions%ROWTYPE;
BEGIN
  IF has_table_privilege('authenticated','public.push_subscriptions','SELECT')
      OR has_table_privilege('authenticated','public.push_subscriptions','INSERT')
      OR has_function_privilege('authenticated',
        'public.register_protected_push(uuid,text,text,text,text,text,text,text,text,text,boolean)',
        'EXECUTE') THEN
    RAISE EXCEPTION 'Push table or registration RPC remains directly accessible';
  END IF;
  INSERT INTO auth.users(id) VALUES(owner),(other_owner);
  INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth,transport)
    VALUES(owner,'https://old.example/push','private-key','private-auth','web');
  INSERT INTO public.push_subscriptions(user_id,endpoint,transport,
    native_installation_id) VALUES(owner,'apns:0123456789abcdef0123456789abcdef',
    'apns','installation-1');
  IF public.activate_push_content() THEN
    RAISE EXCEPTION 'Push activation accepted plaintext';
  END IF;
  registered:=public.register_protected_push(owner,'https://old.example/push',
    digest,NULL,NULL,NULL,NULL,cipher,'web','en',false);
  IF registered.endpoint IS NOT NULL OR registered.p256dh IS NOT NULL OR
      registered.auth IS NOT NULL OR registered.endpoint_digest<>digest OR
      registered.content_revision<>1 OR
      registered.encryption_checked_at IS NULL THEN
    RAISE EXCEPTION 'Push registration retained clear content';
  END IF;
  registered:=public.register_protected_push(owner,
    'apns:0123456789abcdef0123456789abcdef',repeat('d',64),
    NULL,NULL,'installation-1',native_digest,cipher,'apns','en',false);
  IF registered.native_installation_id IS NOT NULL OR
      registered.installation_digest<>native_digest THEN
    RAISE EXCEPTION 'Legacy native installation retained clear content';
  END IF;
  IF NOT public.activate_push_content() THEN
    RAISE EXCEPTION 'Push activation refused sealed rows';
  END IF;
  BEGIN
    INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth,transport)
      VALUES(owner,'https://obsolete.example/push','key','auth','web');
    RAISE EXCEPTION 'obsolete push insert accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.push_subscriptions SET endpoint='https://clear.example/push',
      encrypted_content=NULL WHERE id=registered.id;
    RAISE EXCEPTION 'obsolete push update accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  registered:=public.register_protected_push(other_owner,
    'https://old.example/push',digest,NULL,NULL,NULL,NULL,cipher,'web','fr',false);
  IF registered.user_id<>other_owner OR registered.endpoint IS NOT NULL OR
      (SELECT count(*) FROM public.push_subscriptions WHERE endpoint_digest=digest)<>1
    THEN RAISE EXCEPTION 'Global endpoint transfer failed'; END IF;
  registered:=public.register_protected_push(other_owner,
    'https://new.example/push',second_digest,
    'https://old.example/push',digest,NULL,NULL,cipher,'web','',true);
  IF registered.endpoint_digest<>second_digest OR NOT registered.enabled OR
      registered.locale<>'fr' OR
      (SELECT count(*) FROM public.push_subscriptions WHERE user_id=other_owner)<>1
    THEN RAISE EXCEPTION 'Atomic endpoint rotation failed'; END IF;
  registered:=public.register_protected_push(owner,
    'apns:fedcba9876543210fedcba9876543210',repeat('e',64),
    NULL,NULL,'installation-1',native_digest,cipher,'apns','',true);
  IF registered.endpoint_digest<>repeat('e',64) OR
      registered.locale<>'en' OR
      (SELECT count(*) FROM public.push_subscriptions
        WHERE user_id=owner AND transport='apns')<>1 THEN
    RAISE EXCEPTION 'Atomic native endpoint rotation failed';
  END IF;
  UPDATE public.push_subscriptions SET failure_count=3 WHERE id=registered.id;
  IF (SELECT content_revision FROM public.push_subscriptions
      WHERE id=registered.id)<>0 THEN
    RAISE EXCEPTION 'Delivery metadata changed content revision';
  END IF;
END;
$$;
ROLLBACK;
