-- Retire le réglage `feedback_classify_model`, devenu sans lecteur.
--
-- MIN-87 a fusionné les deux passes du feedback (dédoublonnage puis
-- classification) en UNE seule, qui lit `feedback_analysis_model`. La clé de
-- classification est restée semée par 20260802090000_feedback_classification.sql
-- et affichée dans /admin : un réglage qu'un admin pouvait changer sans que rien
-- ne bouge — le pire des cas pour un knob. Le champ disparaît du registre
-- (lib/ai-model-config.ts) ; on efface la ligne pour que la base dise la même
-- chose que le code.
delete from app_config where key = 'feedback_classify_model';
