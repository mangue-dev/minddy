-- minddy — MIN-260 : Smart-fill se voit dans l'activité du ticket.
--
-- Smart-fill remplit AVANT l'insert : la ligne naît avec sa priorité, son
-- effort, ses catégories et son objectif, sans qu'aucun changement n'ait eu
-- lieu. Rien à raconter, donc — et c'est exactement le problème. Le ticket
-- s'ouvrait avec quatre propriétés que personne n'avait posées et dont rien ne
-- disait d'où elles venaient : ni l'auteur (« ce n'est pas moi »), ni un lecteur
-- six mois plus tard (« qui a décidé que c'était urgent ? »). Une automatisation
-- qui écrit sans laisser de trace est une automatisation qu'on finit par ne plus
-- croire.
--
-- Ce drapeau est le jumeau de `via_smart_assign` (20260719090000) : il dit QUI a
-- agi, et la timeline montre « Smart-fill » comme acteur au lieu du créateur du
-- ticket — qui n'a rien fait de ces quatre champs-là.
--
-- UN seul événement, pas quatre. Smart Assign en pose un pour son unique champ ;
-- ici les quatre sont posés d'un même geste, au même instant, par le même appel.
-- Quatre lignes diraient quatre décisions là où il n'y en a eu qu'une, et
-- noieraient le « a créé le ticket » juste au-dessus. L'événement porte donc la
-- LISTE des champs remplis dans `to_value` (« priority,effort,category_ids »),
-- et la phrase se compose à l'affichage — dans la langue du lecteur, ce qu'un
-- texte figé en base ne saurait pas faire.
--
-- Idempotent — safe to re-run.

alter table public.issue_events
  add column if not exists via_smart_fill boolean not null default false;
