-- minddy — de quoi RÉVOQUER la clé LLM émise pour un run (MIN-223).
--
-- La microVM ne détient plus la clé : le firewall de Vercel Sandbox la pose
-- lui-même sur la requête de complétion, après la sortie de la VM. Reste ce que
-- la politique réseau ne borne pas — un modèle hostile peut appeler la route
-- créditée EN DEHORS de la boucle (un `curl` suffit) : pas de l'exfiltration, de
-- la dépense, et elle échappe au ledger.
--
-- Le garde-fou est une clé OpenRouter émise POUR CE RUN, à plafond dur, tenue par
-- le fournisseur — hors de la VM et hors de notre code. Une clé émise doit
-- pouvoir être révoquée quand la microVM est mise au repos, y compris par un
-- process qui n'a pas lancé le run (le reaper d'inactivité, le chien de garde) :
-- l'identifiant de révocation doit donc vivre sur la LIGNE du run, pas dans la
-- mémoire de la fonction qui l'a mintée.
--
-- C'est le `hash` d'OpenRouter, pas le secret : le secret n'est rendu qu'à la
-- création et n'est jamais persisté nulle part.
alter table public.agent_runs
  add column if not exists provider_key_id text;

comment on column public.agent_runs.provider_key_id is
  'Identifiant de révocation de la clé LLM émise pour ce run (hash OpenRouter). Jamais le secret. Null = pas de clé par run (BYOK, ou provisioning non configuré).';
