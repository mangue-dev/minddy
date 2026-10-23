---
{
  "id": "update-an-instance",
  "locale": "fr",
  "title": "Mises à jour d’instance",
  "summary": "Mettez à jour une version publiée à la fois.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Mettre à jour une instance en conservant la récupération"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/fr/update-an-instance-flow.svg",
      "alt": "Schéma: Arrêter écritures et jobs. Sceller la sauvegarde complète avant update. Migrations cibles, puis application cible. Vérifier récupération et rouvrir.",
      "caption": "Lisez les étapes dans cet ordre. Arrêter écritures et jobs. Sceller la sauvegarde complète avant update. Migrations cibles, puis application cible. Vérifier récupération et rouvrir.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Arrêter écritures et jobs"
          },
          {
            "title": "Sceller la sauvegarde complète avant update"
          },
          {
            "title": "Migrations cibles, puis application cible"
          },
          {
            "title": "Vérifier récupération et rouvrir"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Mettre à jour une instance en conservant la récupération {#update-an-instance}

Mettez à jour une version publiée à la fois. Examinez notes, différences de migrations et lignes de compatibilité. Ne combinez pas une mise à jour minddy avec un changement majeur de PostgreSQL ni avec le changement d’images Supabase isolées. Quand la ligne cible épingle une nouvelle version officielle de Supabase, [déplacez la copie amont](#supabase-release) pendant la même interruption. Vérifiez code cible, sommes des assets et digest OCI, puis préparez un autre répertoire de release avec dépendances figées. Annoncez l’interruption et l’heure limite d’abandon. Confirmez sauvegarde hors serveur utilisable et restauration récente. Conservez application actuelle et environnement protégés redémarrables.

Certaines migrations suppriment définitivement les données de fonctionnalités retirées. La mise à jour de v0.11.0 vers v0.20.0 supprime les enregistrements de domaines personnalisés, les exécutions et conversations de l’agent de code avec leur historique et leurs connexions, ainsi que les vues enregistrées de la palette de commandes (favoris personnels ; les vues de tableau restent). Après ces migrations, seule la sauvegarde complète d’avant la mise à jour peut les restaurer.


![Schéma: Arrêter écritures et jobs. Sceller la sauvegarde complète avant update. Migrations cibles, puis application cible. Vérifier récupération et rouvrir.](/documentation/fr/update-an-instance-flow.svg)

## Mettre à jour le profil full {#full}

Reprenez le [contexte Compose full installé](/fr/documentation/backups-and-restoration#context). Arrêtez entrée publique, écritures, workers et planificateur, puis réalisez la sauvegarde complète scellée. Copiez l’environnement actuel en mode `0600` vers `TARGET_ENV_FILE` et changez uniquement `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` et `MINDDY_ENV_FILE` pour la cible vérifiée. Gardez URLs, identifiants, clés et choix de fonctionnalités. Supprimez `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` ainsi que les variables Vercel Sandbox `VERCEL_TOKEN`, `VERCEL_TEAM_ID` et `VERCEL_PROJECT_ID` si une release antérieure les a laissés : l’application ne les lit plus, et `--remove-orphans` retire l’ancien conteneur `agent-runner`. Exécutez la séquence ci-dessous dans le contexte installé. Elle démarre uniquement les dépendances backend, applique les migrations cibles et vérifie l’application pendant que Caddy et le planificateur restent arrêtés.

Pour la mise à niveau de v0.10.30 vers v0.11.0, la cible introduit `MINDDY_DATA_ROOT_KEY`. Ajoutez cette clé uniquement si la configuration existante ne contient aucune racine et conservez tous les secrets existants de chiffrement des identifiants. La commande ci-dessous écrit directement une nouvelle racine de 32 octets dans le fichier cible protégé, sans l’afficher, et refuse de remplacer une valeur enregistrée invalide. Si la source est v0.11.0 ou plus récente, la racine existe normalement et la commande la vérifie seulement. La racine seule n’active pas le chiffrement du contenu : un environnement sans `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` le laisse désactivé.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access api-gw auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnvironment} from './scripts/self-hosting-install.mjs';
const file = process.env.TARGET_ENV_FILE;
const text = readFileSync(file, 'utf8');
const values = parseEnvironment(text);
if (Object.hasOwn(values, 'MINDDY_DATA_ROOT_KEY')) {
  if (!/^[a-f0-9]{64}$/i.test(values.MINDDY_DATA_ROOT_KEY)) {
    throw new Error('Recover the valid existing root key; do not replace it.');
  }
} else {
  writeFileSync(file, text + '\nMINDDY_DATA_ROOT_KEY=' + randomBytes(32).toString('hex') + '\n', {mode: 0o600});
  chmodSync(file, 0o600);
}
NODE
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node -- scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node -- scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy
compose up -d --wait --remove-orphans minddy
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Passer à une nouvelle version épinglée de Supabase {#supabase-release}

La v0.20.1 épingle Supabase officiel `self-hosted/v0.8.3` au lieu de `self-hosted/v0.7.2`, ce qui corrige les avis de sécurité Storage et Realtime d’octobre 2026. Quand la ligne cible épingle une autre version de Supabase, exécutez les commandes ci-dessous dans le profil full, après la sauvegarde scellée et avant la séquence de mise à jour ci-dessus. N’extrayez jamais le nouveau commit dans le répertoire amont existant, qui contient les fichiers de la base et de Storage. Récupérez-le dans un nouveau répertoire avec l’outillage cible, puis déplacez les données pendant que tous les services sont arrêtés. Depuis `self-hosted/v0.8.3`, Envoy remplace Kong et le service de passerelle s’appelle `api-gw` : la séquence supprime donc le conteneur arrêté `supabase-kong`. L’environnement protégé ne demande aucune nouvelle variable.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_SUPABASE_DIR=/srv/minddy/supabase-vX.Y.NEXT
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node scripts/fetch-official-supabase.mjs --destination "$TARGET_SUPABASE_DIR"
compose stop
SOURCE_VOLUMES="$SUPABASE_DIR/docker/volumes"
TARGET_VOLUMES="$TARGET_SUPABASE_DIR/docker/volumes"
test ! -e "$TARGET_VOLUMES/db/data"
sudo mv "$SOURCE_VOLUMES/db/data" "$TARGET_VOLUMES/db/data"
if [ -d "$SOURCE_VOLUMES/storage" ]; then
  sudo find "$SOURCE_VOLUMES/storage" -mindepth 1 -maxdepth 1 ! -name .gitkeep \
    -exec mv -t "$TARGET_VOLUMES/storage" {} +
fi
if [ -d "$SOURCE_VOLUMES/snippets" ]; then
  sudo mv "$SOURCE_VOLUMES/snippets" "$TARGET_VOLUMES/snippets"
fi
docker rm supabase-kong 2>/dev/null || true
export SUPABASE_DIR="$TARGET_SUPABASE_DIR"
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
```

Exécutez ensuite la séquence de mise à jour du profil full. Conservez l’ancien répertoire amont jusqu’à ce que l’instance rouverte passe ses vérifications. Pour revenir en arrière, restaurez la sauvegarde scellée avec la version précédente et son commit amont enregistré.

## Distinguer les opérations managed et source {#managed-source}

OCI managed suit la même succession d’environnement cible protégé et d’image, avec accès sauvegarde/migration base et Storage contrôlé par le fournisseur plutôt que des services backend locaux. Depuis les sources, construisez le tag cible, bloquez les écritures API publiques, réalisez une sauvegarde logique/fournisseur, appliquez bootstrap avec le code cible et démarrez la production derrière la maintenance. Ne remplacez pas un serveur OCI par un processus source pour le valider. Ne démarrez pas l’ancien code sur un schéma changé sans garantie explicite de compatibilité.


Les commandes Compose locales de la procédure source suivante concernent uniquement un backend contrôlé par l’opérateur. Avec Supabase géré, remplacez arrêt/démarrage du backend et accès aux migrations par les opérations prises en charge du fournisseur ; conservez l’environnement minddy protégé et le backup fournisseur complet, puis démarrez l’application cible vérifiée.


Pour la procédure source, définissez `MINDDY_REPO` sur le dépôt source versionné, `SUPABASE_COMPOSE_DIR` sur le backend contrôlé décrit dans [le contexte de backup logique](/fr/documentation/backups-and-restoration#outage), `TO_TAG` sur le prochain tag réellement publié et vérifié, et `TARGET_RELEASE_DIR` sur son checkout distinct déjà compilé. Fournissez en privé les variables de base et API publique correspondantes. Après bootstrap et vérification, démarrez la cible avec `pnpm start` ou votre superviseur existant derrière la maintenance ; ne rouvrez qu’après les contrôles suivants.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
```

## Vérifier le résultat {#verify}

Exécutez doctor en maintenance avant entrée publique/jobs, puis normalement après réouverture. Connectez-vous, vérifiez identifiants de projets/tickets conservés, créez et modifiez des données de démonstration, transférez une pièce jointe et comparez son SHA-256, puis testez Realtime et un job inoffensif. Une clé d’intégration révoquée doit toujours échouer. Relevez digest d’image et historique de migrations. En cas d’échec, gardez la pile fautive arrêtée ; un rollback incompatible restaure l’ensemble antérieur sur cible vierge. Aucune migration inverse n’est générée.
