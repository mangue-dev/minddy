-- minddy — distinguer les deux modes de Smart Assign dans l'activité (MIN-31)
--
-- `via_smart_assign` dit QUI a agi (l'acteur affiché est « Smart Assign »).
-- Il ne dit pas COMMENT : un projet solo, ou une équipe sans aucune règle
-- écrite, sont affectés au propriétaire sans jamais consulter le modèle — et la
-- timeline rendait ce geste-là exactement comme un vrai choix du modèle.
--
-- Ce drapeau dit donc « le modèle a choisi cette personne », et rien d'autre :
-- un appel qui échoue et retombe sur le propriétaire reste une affectation
-- automatique, parce que c'est ce qu'elle est.
--
-- Les lignes existantes passent à false : elles se liront « automatique ». Une
-- seule ligne de tout l'historique venait réellement du modèle (le 2026-07-28
-- à 17:28 sur MIN) ; le suivi de coût `ai_usage` n'a pas de clé vers le ticket,
-- donc on ne la retrouve que par rapprochement d'horodatage — trop fragile pour
-- une migration, et un seul geste de tout l'historique est en jeu.
-- Idempotent — safe to re-run.

alter table public.issue_events
  add column if not exists smart_assign_ai boolean not null default false;
