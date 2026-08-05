-- minddy — Traduction automatique des retours dans la langue de l'équipe.
--
-- Un board public reçoit des retours dans la langue de qui écrit. Une équipe
-- française qui reçoit du portugais ne peut ni le trier, ni le dédoublonner, ni
-- y répondre — et se met à demander une traduction à un onglet voisin, une fois
-- par retour.
--
-- Numo la fait donc dans la MÊME passe que la modération et la catégorisation :
-- il détecte la langue du retour, et le traduit si elle n'est pas celle de
-- l'équipe. Une seule passe, un seul appel, pas de coût supplémentaire quand il
-- n'y a rien à traduire.
--
-- La traduction vit À CÔTÉ du texte, jamais à sa place :
--
--   submitted_title / submitted_body   le brut, tel qu'écrit           (intact)
--   title / body                       la couche canonique d'équipe    (intact)
--   translated_title / translated_body  ← la traduction, vue équipe seule
--
-- Le board public continue donc d'afficher le retour dans la langue où il a été
-- écrit : son auteur doit pouvoir s'y relire, et les autres visiteurs de sa
-- langue aussi. La bascule « version traduite / version originale » n'existe
-- que du côté de l'équipe.
--
-- Idempotent — safe to re-run.

-- ── Réglages du projet ───────────────────────────────────────────────────────
-- Sur `projects`, à côté de feedback_review_enabled : la traduction fait partie
-- de la revue, et s'applique aux TROIS canaux (board public, API, saisie
-- interne). Un projet qui n'utilise que l'API n'a pas de ligne `feedback_boards`
-- où les poser.
alter table public.projects
  -- Activée par défaut : recevoir un retour qu'on ne sait pas lire est un
  -- problème qu'on n'a pas à découvrir avant de pouvoir le régler.
  add column if not exists feedback_translate_enabled boolean not null default true,
  -- La langue de l'équipe (code ISO 639-1). NULL = jamais renseignée : les
  -- projets d'avant cette migration, et ceux créés hors du wizard. La revue
  -- retombe alors sur la locale par défaut de l'app. Un backfill peut la poser
  -- après coup (scripts/backfill-feedback-team-language.mjs).
  add column if not exists feedback_team_language text,
  -- Les langues qu'on lit sans aide : une équipe française n'a pas besoin qu'on
  -- lui traduise l'anglais. Vide = tout ce qui n'est pas la langue de l'équipe
  -- est traduit.
  add column if not exists feedback_no_translate_languages text[] not null default '{}';

-- ── Le retour ────────────────────────────────────────────────────────────────
alter table public.feedback_posts
  -- Langue du retour PRIS DANS SON ENSEMBLE, telle que la revue l'a lue. Un
  -- texte français truffé de termes techniques anglais reste du français : ce
  -- n'est pas la langue des mots empruntés qui compte, c'est celle de la phrase.
  add column if not exists source_language text,
  add column if not exists translated_title text,
  add column if not exists translated_body text,
  -- Vers quelle langue. Elle est stockée parce que la langue de l'équipe peut
  -- changer : sans elle, une traduction française s'afficherait comme si elle
  -- avait été faite pour une équipe passée à l'anglais.
  add column if not exists translated_language text;
