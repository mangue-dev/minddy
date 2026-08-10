-- minddy — retrait de `issue_autocomplete` : une feature qui n'existe plus.
--
-- L'autocomplétion de ticket a été essayée le 2026-08-09 puis abandonnée (pas
-- concluante). Son SQL avait été appliqué à la main sur la base, donc aucune
-- migration de ce dépôt ne l'a jamais portée — c'est pour ça qu'elle est
-- apparue dans la contrainte VIVANTE sans être nulle part dans le code, et que
-- la migration d'avant (20261124090000, Smart-fill) a dû la reprendre pour
-- pouvoir réécrire le CHECK. Elle n'a plus lieu d'être reprise.
--
-- ON SUPPRIME AUSSI SES LIGNES, et il faut le dire : ce sont des lignes de
-- FACTURATION. Quinze, toutes du 2026-08-09 entre 15h34 et 16h10, toutes sur le
-- compte qui menait l'essai, pour 0,001237 $ au total sur trois modèles
-- (gemini-3.1-flash-lite, gpt-oss-20b, ministral-8b). De l'usage d'essai sur son
-- propre compte, pas la dépense d'un client — sinon on aurait gardé les lignes
-- et laissé la valeur dans le CHECK, quitte à ce qu'elle n'ait plus de code
-- derrière : on ne réécrit pas une facture parce qu'on a changé d'avis.
--
-- L'ordre compte, et c'est tout l'intérêt de les mettre dans la MÊME migration :
-- le CHECK ne peut pas se resserrer tant qu'une ligne le viole, et la
-- transaction rend les deux inséparables — pas d'état intermédiaire où les
-- lignes seraient parties sans que la contrainte ait suivi, ni l'inverse.

delete from public.ai_usage where feature = 'issue_autocomplete';

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'smart_fill', 'feedback_classify', 'feedback_analyze',
    'embedding', 'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split', 'feedback_voice',
    'routine_code', 'routine_compute'));
