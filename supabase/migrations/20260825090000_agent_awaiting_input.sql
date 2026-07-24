-- MIN-86 : l'agent de code pose des questions structurées (ask_user) et son tour
-- se termine en ATTENTE de la réponse de l'utilisateur. Ce repos particulier est
-- stampé sur le run : les surfaces (page Agents, sidebar, sélecteur de sessions)
-- affichent alors un point JAUNE « en attente d'une réponse » au lieu du point
-- bleu « terminé, non lu ». Remis à false à chaque autre entrée au repos.
alter table public.agent_runs
  add column if not exists awaiting_input boolean not null default false;
