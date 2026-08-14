-- minddy — la graine de l'orbe d'un projet.
--
-- L'orbe (la pastille dégradée qui tient lieu d'icône quand le projet n'en a
-- pas importé, MIN-62) se dessinait en hachant l'IDENTIFIANT du projet : une
-- couleur juste, mais définitive. Comme l'avatar d'un compte
-- (`public.user_avatars`), elle se relance désormais — d'où cette colonne, qui
-- porte la graine du tirage.
--
-- Elle est NULLABLE, et c'est le point : `null` = « jamais relancée », et le
-- lecteur retombe alors sur l'identifiant du projet (`projectOrbSeed`,
-- lib/project-orb-colors.ts). Les projets existants gardent donc EXACTEMENT la
-- couleur qu'ils ont aujourd'hui, sans passe de rattrapage — un défaut à
-- `gen_random_uuid()` aurait repeint tout le monde d'un coup.
--
-- L'écriture passe par la clé de service, dans une route qui vérifie déjà que
-- l'appelant est owner (comme l'icône) : aucune policy à ajouter. Idempotent.

alter table public.projects add column if not exists orb_seed text;

comment on column public.projects.orb_seed is
  'Graine de l''orbe générée. Null = jamais relancée, le lecteur retombe sur projects.id.';
