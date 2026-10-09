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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "revision": 2,
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

Mettez à jour une version publiée à la fois. Examinez notes, différences de migrations et lignes de compatibilité. Ne combinez pas mise à jour minddy, changement majeur PostgreSQL ou images Supabase. Vérifiez code cible, sommes des assets et digest OCI, puis préparez un autre répertoire de release avec dépendances figées. Annoncez l’interruption et l’heure limite d’abandon. Confirmez sauvegarde hors serveur utilisable et restauration récente. Conservez application actuelle et environnement protégés redémarrables.


![Schéma: Arrêter écritures et jobs. Sceller la sauvegarde complète avant update. Migrations cibles, puis application cible. Vérifier récupération et rouvrir.](/documentation/fr/update-an-instance-flow.svg)

## Mettre à jour le profil full {#full}

Reprenez le [contexte Compose full installé](/fr/documentation/backups-and-restoration#context). Arrêtez entrée publique, écritures, workers et planificateur, puis réalisez la sauvegarde complète scellée. Copiez l’environnement actuel en mode 0600 vers TARGET_ENV_FILE et changez uniquement MINDDY_RELEASE, MINDDY_IMAGE, MINDDY_DEPLOY_DIR et MINDDY_ENV_FILE pour la cible vérifiée. Gardez URLs, identifiants, clés et choix de fonctionnalités. Exécutez la séquence ci-dessous dans le contexte installé. Elle démarre uniquement les dépendances backend, applique les migrations cibles et vérifie application/runner pendant que Caddy et le planificateur restent arrêtés.

Pour la mise à niveau de v0.10.30 vers v0.11.0, la cible introduit MINDDY_DATA_ROOT_KEY. Ajoutez cette clé uniquement si la configuration existante ne contient aucune racine et conservez tous les secrets existants de chiffrement des identifiants. La commande ci-dessous écrit directement une nouvelle racine de 32 octets dans le fichier cible protégé, sans l’afficher, et refuse de remplacer une valeur enregistrée invalide. La racine seule n’active pas le chiffrement du contenu. Avant de démarrer cette cible, appliquez les [adaptations épinglées du runner et des fonctions hors ligne](/fr/documentation/installation#runner-workaround) et conservez RUNNER_FIX_OVERRIDE dans chaque opération Compose. Ce profil est explicitement adapté ; il ne constitue pas une installation réussie du tag historique inchangé.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
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
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy agent-runner
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Distinguer les opérations managed et source {#managed-source}

OCI managed suit la même succession d’environnement cible protégé et d’image, avec accès sauvegarde/migration base et Storage contrôlé par le fournisseur plutôt que des services backend locaux. Depuis les sources, construisez le tag cible, bloquez les écritures API publiques, réalisez une sauvegarde logique/fournisseur, appliquez bootstrap avec le code cible et démarrez la production derrière la maintenance. Ne remplacez pas un serveur OCI par un processus source pour le valider. Ne démarrez pas l’ancien code sur un schéma changé sans garantie explicite de compatibilité.


Les commandes Compose locales de la procédure source suivante concernent uniquement un backend contrôlé par l’opérateur. Avec Supabase géré, remplacez arrêt/démarrage du backend et accès aux migrations par les opérations prises en charge du fournisseur ; conservez l’environnement minddy protégé et le backup fournisseur complet, puis démarrez l’application cible vérifiée.


Pour la procédure source, définissez MINDDY_REPO sur le dépôt source versionné, SUPABASE_COMPOSE_DIR sur le backend contrôlé décrit dans [le contexte de backup logique](/fr/documentation/backups-and-restoration#outage), TO_TAG sur le prochain tag réellement publié et vérifié, et TARGET_RELEASE_DIR sur son checkout distinct déjà compilé. Fournissez en privé les variables de base et API publique correspondantes. Après bootstrap et vérification, démarrez la cible avec pnpm start ou votre superviseur existant derrière la maintenance ; ne rouvrez qu’après les contrôles suivants.

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
