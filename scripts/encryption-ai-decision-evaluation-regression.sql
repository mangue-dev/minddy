\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":2,"data":"opaque"}';
  rejected boolean;
BEGIN
  INSERT INTO public.ai_decision_evaluations(id,use_case,subject_id,
    jev_answers,llm_answers,agree,jev_latency_ms,llm_latency_ms)
  VALUES(first_id,'smart_fill','private-issue',
    '{"answer":"private-je v"}'::jsonb,NULL,NULL,100,200);
  IF public.activate_ai_decision_evaluation_content() THEN
    RAISE EXCEPTION 'Legacy evaluation activated';
  END IF;
  UPDATE public.ai_decision_evaluations SET subject_id=NULL,
    jev_answers=NULL,llm_answers=NULL,encrypted_content=cipher,
    encryption_version=2,replay_succeeded=false WHERE id=first_id;
  IF EXISTS(SELECT 1 FROM public.ai_decision_evaluations WHERE id=first_id
      AND (subject_id IS NOT NULL OR jev_answers IS NOT NULL OR
        llm_answers IS NOT NULL OR encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Evaluation source retained clear content';
  END IF;
  INSERT INTO public.ai_decision_evaluations(id,use_case,
    subject_id,jev_answers,llm_answers,agree,encrypted_content,
    encryption_version,replay_succeeded)
  VALUES(second_id,'smart_fill',NULL,NULL,NULL,true,cipher,2,true);
  IF (SELECT replay_failed FROM public.ai_decision_evaluations_weekly
      WHERE use_case='smart_fill')<>1 THEN
    RAISE EXCEPTION 'Weekly projection lost encrypted replay status';
  END IF;
  IF NOT public.activate_ai_decision_evaluation_content() THEN
    RAISE EXCEPTION 'Protected evaluation refused activation';
  END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.ai_decision_evaluations(use_case,jev_answers)
      VALUES('smart_fill','{"answer":"old"}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old evaluation insert accepted'; END IF;
  rejected:=false;
  BEGIN
    UPDATE public.ai_decision_evaluations SET subject_id='private-again'
      WHERE id=first_id;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old evaluation update accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.activate_ai_decision_evaluation_content()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate evaluation protection';
  END IF;
END;
$test$;
ROLLBACK;
