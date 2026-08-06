-- minddy — MIN-185 : une routine tourne sur PLUSIEURS jours.
--
-- « Tous les lundis » n'est qu'un cas de « les jours où je veux » : une revue
-- de dépendances le lundi ET le jeudi, un état des lieux le 1er ET le 15. La
-- cadence portait UN jour de semaine et UN jour du mois ; elle en porte
-- maintenant une liste — un seul élément retrouve exactement le comportement
-- d'avant, ce qui est la raison pour laquelle le changement se fait ici plutôt
-- que par une deuxième cadence à côté.
--
-- Les scalaires sont REPRIS puis retirés : la table est neuve (livrée le même
-- jour), mais la reprise coûte deux lignes et vaut mieux qu'un pari sur son
-- contenu. Idempotent — safe to re-run.

alter table public.agent_routines
  add column if not exists weekdays smallint[] not null default '{}',
  add column if not exists days_of_month smallint[] not null default '{}';

-- Reprise des colonnes d'origine, tant qu'elles existent.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'agent_routines'
       and column_name = 'weekday'
  ) then
    update public.agent_routines
       set weekdays = array[weekday]::smallint[]
     where weekday is not null and cardinality(weekdays) = 0;
    alter table public.agent_routines drop column weekday;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'agent_routines'
       and column_name = 'day_of_month'
  ) then
    update public.agent_routines
       set days_of_month = array[day_of_month]::smallint[]
     where day_of_month is not null and cardinality(days_of_month) = 0;
    alter table public.agent_routines drop column day_of_month;
  end if;
end $$;

-- Les bornes, portées par la liste entière. Une cadence hebdomadaire SANS jour
-- n'aurait aucune occurrence : c'est refusé côté TS (`assertSchedule`), et le
-- CHECK ne fait ici que garder les valeurs dans leur intervalle — la cohérence
-- « quels champs pour quelle fréquence » reste une règle applicative, comme
-- pour `intent` sur `agent_runs`.
alter table public.agent_routines drop constraint if exists agent_routines_weekdays_check;
alter table public.agent_routines add constraint agent_routines_weekdays_check
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);

-- Les 31 valeurs en toutes lettres : un CHECK ne peut pas porter de
-- sous-requête (`array(select generate_series(...))` est refusé, SQLSTATE
-- 0A000), et la borne est fixe de toute façon.
alter table public.agent_routines drop constraint if exists agent_routines_days_of_month_check;
alter table public.agent_routines add constraint agent_routines_days_of_month_check
  check (days_of_month <@ array[
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,
    17,18,19,20,21,22,23,24,25,26,27,28,29,30,31
  ]::smallint[]);
