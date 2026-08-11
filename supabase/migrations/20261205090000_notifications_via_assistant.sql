-- minddy — MIN-278 : une citation posée PAR L'AGENT porte le nom de l'agent.
--
-- Une notification savait déjà dire que son acteur n'est pas la personne dont
-- elle porte l'`actor_id` : `via_mcp` + `api_key_id` nomment l'agent derrière
-- une clé, `via_smart_assign` et `via_automation` nomment la fonctionnalité
-- (20260911090000, 20261004090000). Il manquait le cas de NOTRE agent quand il
-- n'agit pas par le MCP — le chat Numo et l'agent de code —, et il ne se posait
-- pas tant que seuls les commentaires en produisaient : là, le drapeau se lit
-- sur la ligne de commentaire (`comments.via_assistant`).
--
-- Une page n'a pas cet abri. Numo écrit « @Clément peux-tu trancher ça » dans
-- une page, la ligne part sous l'`actor_id` du compte qui l'a permis, et Clément
-- lit « Untel vous a mentionné » d'une phrase qu'Untel n'a pas écrite — la
-- fausse attribution que la règle d'identité interdit, et que l'en-tête de la
-- page (« Écrit par minddy ») comme sa ligne d'activité évitent déjà.
--
-- Même vocabulaire que `issue_events` et `comments`, plutôt qu'un mot à nous :
-- une notification et un événement décrivent la même action, ils doivent la
-- décrire pareil. Colonne additive à valeur par défaut — les lignes existantes
-- restent exactement ce qu'elles étaient. Idempotent.

alter table public.notifications
  add column if not exists via_assistant boolean not null default false;
