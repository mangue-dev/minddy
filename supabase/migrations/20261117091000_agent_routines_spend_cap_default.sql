-- minddy — le plafond de dépense d'un passage passe de 90 % à 15 %.
--
-- Correction du défaut posé quelques minutes plus tôt par
-- 20261117090000_agent_routines_spend_cap.sql. 90 % bornait le passage qui
-- DÉRAPE ; il ne bornait pas le MOIS : une routine hebdomadaire à 90 % vide le
-- budget en un passage, et le garde-fou n'aurait servi qu'une fois.
--
-- Ce que le défaut doit protéger, c'est la répétition. Une routine part toute
-- seule, plusieurs fois par mois, sans que personne ne regarde sa barre
-- d'usage : à 15 %, six passages tiennent dans le budget et l'essentiel reste
-- au travail à la main. Un plafond bas se RELÈVE routine par routine, sur
-- décision ; un plafond haut ne se baisse qu'après la facture.
--
-- Les routines DÉJÀ posées suivent : leur 90 n'est le choix de personne, c'est
-- l'ancien défaut, écrit par la migration précédente sur des lignes qui
-- n'avaient jamais eu ce champ. Un plafond réglé à la main, lui, ne vaut
-- jamais exactement 90 — et s'il le vaut, c'est qu'il a été posé entre les deux
-- migrations, dans une fenêtre où le réglage n'était encore servi par aucune
-- surface. Idempotent — safe to re-run.

alter table public.agent_routines
  alter column max_spend_percent set default 15;

update public.agent_routines
  set max_spend_percent = 15
  where max_spend_percent = 90;
