-- minddy — MIN-271 : la PRÉSENCE sur les pages d'un projet.
--
-- Un topic privé par projet, `page-presence:{projectId}`, sur lequel chaque
-- onglet ouvert déclare `{ userId, pageId }`. Un canal par projet et non par
-- page : la charge utile porte la page, donc un seul abonnement suffit à savoir
-- qui lit quoi dans tout le wiki, et changer de page n'est qu'un `track` de
-- plus. Rien n'est stocké — la présence est un état de socket, pas une table.
--
-- La présence n'est PAS du broadcast, et c'est tout l'objet de ce fichier :
-- `realtime.messages` la porte sous `extension = 'presence'`, que la policy
-- existante (`members_receive_broadcasts`, qui exige `extension = 'broadcast'`)
-- ne couvre donc pas. Il en faut deux de plus, et les deux sens comptent :
-- SELECT pour VOIR les autres, INSERT pour SE déclarer. Sans l'insert, le canal
-- se joint, l'écran reste vide, et rien ne le dit.
--
-- On AJOUTE deux policies au lieu de réécrire l'existante. Les policies
-- permissives s'additionnent (OR), et récrire celle du broadcast ici la ferait
-- diverger de la copie que porte chaque migration qui l'a touchée — c'est déjà
-- six fichiers.
--
-- `can_access_project` est la même garde que les topics de projet, et elle est
-- déjà `grant execute` à `authenticated` (20260929091000). Le rappel vaut
-- d'être écrit : une fonction non exécutable fait LEVER la branche, et une
-- branche qui lève fait tomber la policy ENTIÈRE — pas seulement la sienne.
--
-- Idempotent — safe to re-run.

-- ── Voir qui est là ────────────────────────────────────────────────────────
drop policy if exists members_receive_page_presence on realtime.messages;
create policy members_receive_page_presence on realtime.messages
for select to authenticated
using (
  extension = 'presence'
  and realtime.topic() like 'page-presence:%'
  and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
);

-- ── Se déclarer ────────────────────────────────────────────────────────────
drop policy if exists members_track_page_presence on realtime.messages;
create policy members_track_page_presence on realtime.messages
for insert to authenticated
with check (
  extension = 'presence'
  and realtime.topic() like 'page-presence:%'
  and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
);
