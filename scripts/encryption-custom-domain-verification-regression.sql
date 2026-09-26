\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
SET LOCAL session_replication_role=replica;
INSERT INTO public.feedback_boards(id,project_id,token)
  VALUES('11000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002','board-test'),
    ('11000000-0000-4000-8000-000000000005',
    '11000000-0000-4000-8000-000000000006','board-old');
INSERT INTO public.view_shares(id,view_id,level,token)
  VALUES('11000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000004','public','share-test');
SET LOCAL session_replication_role=origin;
DO $test$
DECLARE board_domain uuid:=gen_random_uuid();
  share_domain uuid:=gen_random_uuid();
  cipher jsonb:=to_jsonb('mdye3:{"format":3,"keyVersion":2,"data":"opaque"}'::text);
  rejected boolean;
BEGIN
  INSERT INTO public.custom_domains(id,domain,board_id,status,verification)
  VALUES(board_domain,'board.example.test',
    '11000000-0000-4000-8000-000000000001','pending',
    '[{"type":"TXT","domain":"board.example.test", "value":"private-board"}]'::jsonb);
  INSERT INTO public.custom_domains(id,domain,share_id,status,verification)
  VALUES(share_domain,'share.example.test',
    '11000000-0000-4000-8000-000000000003','pending',
    '[{"type":"TXT","domain":"share.example.test", "value":"private-share"}]'::jsonb);
  IF public.activate_custom_domain_verification() THEN
    RAISE EXCEPTION 'Legacy domain verification activated';
  END IF;
  UPDATE public.custom_domains SET verification=cipher
    WHERE id IN (board_domain,share_domain);
  IF EXISTS(SELECT 1 FROM public.custom_domains WHERE
      id IN (board_domain,share_domain) AND
      (verification::text LIKE '%private-%' OR
        verification_encryption_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Domain verification source retained clear content';
  END IF;
  IF NOT public.activate_custom_domain_verification() THEN
    RAISE EXCEPTION 'Protected domain verification refused activation';
  END IF;
  rejected:=false;
  BEGIN
    UPDATE public.custom_domains SET
      verification='[{"type":"TXT","domain":"board.example.test","value":"old"}]'::jsonb
      WHERE id=board_domain;
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old domain update accepted'; END IF;
  rejected:=false;
  BEGIN
    INSERT INTO public.custom_domains(domain,board_id,status,verification)
      VALUES('old.example.test',
        '11000000-0000-4000-8000-000000000005','pending',
        '[{"type":"TXT","value":"old"}]'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old domain insert accepted'; END IF;
  UPDATE public.custom_domains SET status='verified' WHERE id=share_domain;
  IF NOT EXISTS(SELECT 1 FROM public.custom_domains WHERE id=share_domain
      AND status='verified' AND
        public.custom_domain_verification_version(verification)=2) THEN
    RAISE EXCEPTION 'Status edit damaged protected verification';
  END IF;
  IF has_function_privilege('authenticated',
      'public.activate_custom_domain_verification()','EXECUTE') THEN
    RAISE EXCEPTION 'Client can activate domain verification';
  END IF;
END;
$test$;
ROLLBACK;
