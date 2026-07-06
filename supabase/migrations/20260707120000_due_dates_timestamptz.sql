-- minddy — échéances avec heure : due_date / target_date passent de `date`
-- à `timestamptz` pour porter un horaire, pas seulement un jour.
-- Les valeurs existantes (jour seul) deviennent minuit dans le fuseau du serveur.
-- Idempotent — ne convertit que si la colonne est encore de type `date`.

do $$
begin
  if (
    select data_type from information_schema.columns
    where table_schema = 'public'
      and table_name = 'issues'
      and column_name = 'due_date'
  ) = 'date' then
    alter table public.issues
      alter column due_date type timestamptz using due_date::timestamptz;
  end if;

  if (
    select data_type from information_schema.columns
    where table_schema = 'public'
      and table_name = 'objectives'
      and column_name = 'target_date'
  ) = 'date' then
    alter table public.objectives
      alter column target_date type timestamptz using target_date::timestamptz;
  end if;
end $$;
