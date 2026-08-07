-- minddy — le PLAFOND DE DÉPENSE d'un passage de routine.
--
-- Une routine était bornée par le seul quota du compte : un passage pouvait
-- donc légitimement manger 100 % du budget du mois. C'est arrivé. Sur des plans
-- dont le budget mensuel vaut 5 $ (Go) ou 15 $ (Pro), il ne restait plus rien
-- pour le travail à la main — et l'utilisateur ne l'apprenait qu'en lançant son
-- propre run. La décision d'origine (« pas de garde-fou de dépense propre aux
-- routines », cf. l'en-tête de app/api/cron/routines/route.ts) tenait tant que
-- personne n'avait vu un passage tout prendre.
--
-- En POURCENTAGE du budget mensuel du plan, jamais en dollars : c'est l'unité
-- dans laquelle l'usage se dit à l'utilisateur partout dans l'app (les USD de
-- coût brut ne sortent que sur le tableau de bord admin), et c'est la seule qui
-- SUIVE le plan — un passage à 25 % vaut 1,25 $ sur Go et 3,75 $ sur Pro, sans
-- rien à recalculer le jour d'un changement d'abonnement.
--
-- PAR PASSAGE et non par mois : c'est le réglage qui se raisonne. « Cette revue
-- de sécurité a droit au quart de mon budget à chaque fois » se décide en
-- regardant la routine ; « les routines ont droit à la moitié du mois » se
-- décide en regardant les six autres, et ne se répartit plus quand on en pose
-- une septième.
--
-- 90 par défaut : le garde-fou est celui du passage qui DÉRAPE, pas une
-- restriction posée sur ceux qui se comportent bien. Il laisse 10 % au reste du
-- compte, et se descend routine par routine quand on sait ce que la sienne coûte.
-- Idempotent — safe to re-run.

alter table public.agent_routines
  add column if not exists max_spend_percent integer not null default 90;

-- Le CHECK à part : `add column if not exists` ne rejoue pas sa contrainte
-- inline sur une colonne déjà là. 1 = un passage quasi symbolique, 100 = pas de
-- plafond propre (seul le quota du compte borne, l'ancien comportement).
alter table public.agent_routines
  drop constraint if exists agent_routines_max_spend_percent_check;
alter table public.agent_routines
  add constraint agent_routines_max_spend_percent_check
  check (max_spend_percent between 1 and 100);
