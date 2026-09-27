\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;

-- A historical snapshot cannot observe a newly committed activation marker.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Isolation fixture','ISO');
  rejected:=false;
  BEGIN
    INSERT INTO public.integrations(id,project_id,name,key_hash,key_prefix,kind)
      VALUES(gen_random_uuid(),project,'Legacy',repeat('d',64),'mdy','issues');
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Repeatable-read integration writer was accepted';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.billing_accounts(user_id,email)
      VALUES(actor,'legacy@example.test');
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Repeatable-read billing writer was accepted';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.activate_integration_content();
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Repeatable-read integration activation was accepted';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.activate_billing_identity();
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Repeatable-read billing activation was accepted';
  END IF;
END;
$test$;
ROLLBACK;

BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $test$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM public.activate_integration_content();
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Serializable integration activation was accepted';
  END IF;
  rejected:=false;
  BEGIN
    PERFORM public.activate_billing_identity();
  EXCEPTION WHEN SQLSTATE '25001' THEN rejected:=true; END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Serializable billing activation was accepted';
  END IF;
END;
$test$;
ROLLBACK;
