-- minddy — MIN-272 : se souvenir que la page AVAIT un bloc chez son parent.
--
-- Le bloc sous-page dans le corps du parent est une VUE de `parent_id`, pas son
-- support : une page créée depuis la sidebar n'en a aucun, et c'est normal.
-- Mettre une page à la corbeille retire donc son bloc du corps du parent — mais
-- la restaurer ne peut pas le remettre à l'aveugle, sinon restaurer une page
-- née dans la sidebar ferait APPARAÎTRE dans le corps du parent un lien qui n'y
-- a jamais été.
--
-- D'où cette colonne, et elle ne porte que ça : « au moment où cette page est
-- partie à la corbeille, un bloc pointant vers elle a été retiré du corps de
-- son parent ». Posée par `trashPage`, lue et remise à `false` par
-- `restorePage` (lib/server/pages.ts).
--
-- Idempotent — safe à re-run.

alter table public.pages
  add column if not exists parent_block_removed boolean not null default false;

comment on column public.pages.parent_block_removed is
  'MIN-272 — un bloc sous-page a été retiré du corps du parent en corbeillant cette page ; la restauration le remet.';
