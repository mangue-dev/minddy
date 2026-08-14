-- minddy — Secret de webhook PAR DÉPÔT + anti-rejeu des livraisons (MIN-333)
--
-- Deux défauts d'un même récepteur.
--
-- 1. `GITLAB_WEBHOOK_SECRET` était UN secret, écrit dans le hook de CHAQUE
--    locataire. Un mainteneur d'un dépôt lié pouvait le lire dans les réglages
--    de son propre dépôt (GitLab affiche le token du hook à qui peut l'éditer)
--    et forger des événements pour les dépôts des AUTRES. Le secret devient donc
--    propre au dépôt, chiffré au repos comme les tokens de forge
--    (`lib/server/git/token-crypto.ts`), porté par la liaison.
--
--    Par DÉPÔT et pas par liaison : chez GitLab le hook vit sur le dépôt, et
--    deux projets qui lient le même dépôt partagent physiquement ce hook — donc
--    son token. Les lignes d'un même (provider, external_repo_id) portent la
--    même valeur ; `ensureRepoWebhookSecret` s'en charge.
--
-- 2. Le fan-out de la synchro d'issues cherchait la liaison sur le NOM du dépôt
--    porté par la charge utile. Un nom se libère et se réattribue chez la forge :
--    l'index ci-dessous ouvre la recherche sur l'identifiant numérique, qui, lui,
--    ne se réattribue jamais.
--
-- Idempotent, RLS inchangée (les colonnes suivent les policies de leur table).

-- ── Secret du hook, chiffré ─────────────────────────────────────────────────
-- Enveloppe AES-256-GCM sérialisée, comme les tokens de forge. Colonne
-- service-role uniquement : `getProjectLink` et les autres lectures nomment
-- leurs colonnes, aucune ne la renvoie.
alter table public.project_git_links
  add column if not exists webhook_secret_encrypted text;

-- ── Résolution du dépôt par son identifiant ─────────────────────────────────
-- Sert les DEUX chemins du récepteur : la vérification du secret (toutes les
-- liaisons du dépôt, synchro active ou non — le hook GitLab porte aussi les
-- merge requests de l'agent) et le fan-out de la synchro d'issues.
create index if not exists idx_project_git_links_repo_id
  on public.project_git_links(provider, external_repo_id);

-- ── Anti-rejeu des livraisons de webhook ────────────────────────────────────
-- Les deux forges numérotent leurs livraisons (`X-GitHub-Delivery`,
-- `X-Gitlab-Event-UUID`) et re-livrent en cas d'échec. La clé primaire FAIT la
-- garde : un doublon viole 23505 et le récepteur acquitte sans retraiter — même
-- mécanique que `stripe_webhook_events`. Sans elle, une charge capturée pouvait
-- être rejouée telle quelle autant de fois que voulu.
create table if not exists public.forge_webhook_deliveries (
  provider    text not null,
  delivery_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, delivery_id)
);

-- Le balayage de conservation (lib/server/retention.ts) purge par cette borne.
create index if not exists idx_forge_webhook_deliveries_received
  on public.forge_webhook_deliveries(received_at);

-- Deny-all : service client uniquement (les deux récepteurs).
alter table public.forge_webhook_deliveries enable row level security;
