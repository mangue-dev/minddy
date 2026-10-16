---
{
  "id": "installation",
  "locale": "fr",
  "title": "Référence d’installation",
  "summary": "Choisissez une version et un profil d’installation vérifiés, installez le profil complet, géré ou depuis les sources et vérifiez ses limites d’exploitation.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx",
      "content/documentation/reviews/premerge-second-operations-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun); agent:/root (installation article labeled as supporting reference; primary wizard entry points verified; existing figures and procedural evidence retained); agent:/root/second_operations (managed runner blocker and key-volume recovery source review; existing helper evidence retained; no operational rerun); agent:/root/min-721 (code-runner removal checked against the edited Compose profiles, installer, doctor, scheduler and capability source; existing figures and procedural evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 fr network guidance and terminology review); agent:/root (fr installation-reference title review); agent:/root/second_operations (fr added installation and recovery safeguards, full retained meaning); agent:/root/min-721 (fr runner-removal edits and full retained meaning)",
    "date": "2026-10-16"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Choisir une version et un profil d’installation pris en charge",
    "Installer le profil serveur de référence",
    "Installer avec Supabase géré ou depuis les sources"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/fr/self-hosted-compatibility-flow.svg",
      "alt": "Schéma: Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.",
      "caption": "Lisez les étapes dans cet ordre. Tag source annoté. Assets et `SHA256SUMS`. Signature et digest OCI officiels. Profil de compatibilité choisi.",
      "revision": 8,
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
            "title": "Tag source annoté"
          },
          {
            "title": "Assets et `SHA256SUMS`"
          },
          {
            "title": "Signature et digest OCI officiels"
          },
          {
            "title": "Profil de compatibilité choisi"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/fr/install-a-server-flow.svg",
      "alt": "Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs. Validation compte, fichiers et récupération.",
      "caption": "Lisez les étapes dans cet ordre. Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs. Validation compte, fichiers et récupération.",
      "revision": 8,
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
            "title": "Release vérifiée et environnement protégé"
          },
          {
            "title": "Installateur : profil full de référence"
          },
          {
            "title": "Supabase officiel, app, jobs"
          },
          {
            "title": "Validation compte, fichiers et récupération"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/fr/install-a-server-wizard.png",
      "alt": "Assistant public d’installation avec Supabase sur le même serveur sélectionné.",
      "caption": "Le profil full conserve l’application et Supabase sur votre serveur. Dans cet exemple, leur accès par réseau privé est limité au réseau local.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        1051
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/fr/managed-or-source-installation-flow.svg",
      "alt": "Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.",
      "caption": "Un backend géré peut servir les deux modes de déploiement, avec une planification et des sauvegardes adaptées au profil choisi.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Votre projet Supabase géré"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Profil OCI OU application depuis un tag"
          },
          {
            "title": "Jobs et sauvegarde propres au profil"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Installez une instance auto-hébergée à partir d’une release vérifiée et du profil correspondant : full, Supabase géré ou sources. Vérifiez d’abord la compatibilité, puis suivez la procédure choisie et ses contrôles avant d’accueillir les utilisateurs.

## Disponibilité du MCP et accès réseau {#mcp-network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

Choisissez une origine accessible au client MCP et à son navigateur d’autorisation. Sur le même ordinateur, un client compatible peut utiliser `http://localhost:6463/api/mcp`. Depuis un autre ordinateur du LAN/VPN, utilisez l’adresse configurée du serveur, par exemple `http://192.168.1.50/api/mcp`, avec une adresse d’écoute, un port d’application, un pare-feu et un routage permettant l’accès. `localhost` et `127.0.0.1` désignent toujours l’ordinateur qui établit la connexion : l’URL localhost du serveur n’y fonctionne donc pas. Un processus limité à la boucle locale reste inaccessible directement. Hors du réseau privé, utilisez une URL HTTPS accessible comme `https://tickets.example.com/api/mcp` ou un chemin réseau pris en charge, selon les exigences du client. Un agent hébergé a lui aussi besoin de cet accès ; l’hébergement local n’expose pas automatiquement l’instance à Internet.

[Consultez les explications sur l’accès réseau au MCP avant de connecter un client distant](/docs/minddy-mcp#network-access).

## Choisir une version et un profil d’installation pris en charge {#self-hosted-compatibility}

Utilisez une version immuable du dépôt public `mangue-dev/minddy`. La ligne de compatibilité v0.11.0 prend en charge les serveurs Linux amd64 et arm64, Node.js 24, `pnpm` 10.28.0, Docker Engine à partir de 27.0.0 et le plugin Compose à partir de 2.29.0. Le profil full utilise Supabase officiel `self-hosted/v0.7.2`, au commit `549db119c44c25167461812041ba198bde2b31a4`. Conservez l’ensemble de ses images : mettre à jour un service isolément produit une variante gérée par l’opérateur.

Le profil managed se connecte à un projet Supabase sur supabase.com. Celui-ci doit fournir PostgreSQL, Auth, Storage et Realtime et réussir la vérification de la version. PostgreSQL seul ne suffit pas. La pile locale de la CLI Supabase sert au développement et à l’évaluation, pas à un service public de production.


![Schéma: Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.](/documentation/fr/self-hosted-compatibility-flow.svg)

### Vérifier la release {#verify-release}

Vérifiez le tag annoté, les fichiers de la release, `SHA256SUMS` et la signature OCI officielle avant d’installer des dépendances ou d’exécuter la version. Les commandes Bash suivantes partent du dépôt positionné sur le tag choisi et définissent `IMAGE` avec le digest vérifié. Arrêtez-vous dès qu’un contrôle échoue. Installez d’abord Cosign en suivant ses instructions officielles. Ce contrôle établit l’identité du code et de l’image, pas le bon fonctionnement du déploiement.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Préparer exploitation et mises à jour {#support}

Installez les versions publiées une par une. Les migrations vont uniquement vers l’avant ; un retour incompatible restaure ensemble la base, Storage, la configuration et l’application correspondantes. minddy maintient les outils de release et aide au diagnostic des défauts reproductibles du cœur, sans garantie de résultat. Vous gérez DNS, TLS, capacité, sauvegardes, exercices de restauration et fournisseurs optionnels. Un tag d’image mouvant ou une pile Supabase dérivée ne bénéficie pas du contrat de support de la release.

Les profils publiés en v0.11.0 démarrent aussi un service `agent-runner` qui échoue avant que l’application devienne saine. Les releases suivantes suppriment entièrement ce runner et ses sandboxes de code : Numo n’exécute pas de code et aucun service ne reçoit le socket Docker. Installez une telle release plutôt que d’adapter v0.11.0.


## Installer le profil serveur de référence {#install-a-server}

Partez d’un tag vérifié et du digest immuable de son image. Linux amd64 et arm64 sont pris en charge. Prévoyez 4 Go de RAM, deux cœurs et 20 Go de SSD avec Supabase géré ; 8 Go, quatre cœurs et 60 Go si Supabase partage le serveur. Un service public exige DNS et HTTPS sur vos propres origines. HTTP n’est accepté que sur `localhost` ou une IPv4 privée. Limitez-le à un réseau local de confiance et ne redirigez aucun port du routeur. Dans ce mode, le profil full expose l’application sur le port 80 et l’API sur 8000.


![Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs. Validation compte, fichiers et récupération.](/documentation/fr/install-a-server-flow.svg)


![Assistant public d’installation avec Supabase sur le même serveur sélectionné.](/documentation/fr/install-a-server-wizard.png)

### Configurer et lancer l’installateur {#install}

Exécutez `pnpm self-host:install` depuis le répertoire de la release. Choisissez managed ou full, l’origine de l’application et l’adresse de l’administrateur. Pour full, récupérez d’abord la version épinglée de Supabase. L’installateur crée un environnement de mode `0600`, génère les secrets distincts manquants, récupère les images, démarre le profil et lance le bootstrap idempotent. Il conserve l’image épinglée et les secrets existants. L’exemple utilise `IMAGE` [vérifié dans la section de compatibilité](#verify-release). Pour les emails Auth réels, ajoutez d’abord `--skip-start`, renseignez `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` et `SMTP_SENDER_NAME` dans le fichier protégé, puis relancez. Gardez `ENABLE_EMAIL_AUTOCONFIRM=false`. `supabase-mail` est un exemple, pas une boîte de production.


Avant le démarrage, comparez `MINDDY_RELEASE` et `MINDDY_IMAGE` du fichier protégé avec la ligne de compatibilité choisie et l’asset conteneur vérifié. Le modèle de déploiement v0.11.0 indique encore 0.10.30 ; `--image` change seulement la référence d’image et aucun argument `--release` n’existe. Pour une nouvelle installation v0.11.0 préparée avec `--skip-start`, définissez explicitement `MINDDY_RELEASE=0.11.0` et conservez le digest immuable vérifié. Ne remplacez ni les identifiants générés ni les clés de chiffrement. La version du package candidat ne prouve pas un profil 0.11.1 pris en charge : ce snapshot ne contient aucune ligne de compatibilité correspondante.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


La commande précédente crée `deploy/self-hosted/.env` dans le répertoire de la release choisie. Modifiez ce fichier protégé, puis relancez la même commande sans `--skip-start` pour démarrer le profil et exécuter le bootstrap. Les origines, l’image et les secrets existants restent dans le fichier protégé.

Si vous exécutez ce profil full sur macOS avec Docker Desktop, appliquez l’[override de volume pour Storage filesystem](/fr/documentation/storage-and-attachments#docker-desktop) avant le premier démarrage et conservez `RESTORE_OVERRIDE` pour chaque opération Compose ultérieure. Le montage de dossier sur hôte Linux et ce profil avec volume nommé nécessitent des archives d’octets différentes ; utilisez la procédure de sauvegarde et de restauration correspondante.

### Vérifier avant l’accueil des utilisateurs {#accept}

Les profils de référence incluent le planificateur ; ils ne contiennent aucun runner de code et ne montent aucun socket Docker. N’exposez jamais PostgreSQL ni les ports des services internes sur Internet. Lancez le doctor avec l’environnement installé et le Compose amont du profil full. Testez confirmation, connexion, MFA, réinitialisation, création de projet et ticket, transfert de pièce jointe et Realtime dans deux sessions. Un 200 de `/api/health` prouve seulement que l’application tourne. Après interruption, relancez l’installateur avec le même contexte Compose et le fichier d’environnement protégé, sans effacer les données. Préparez une sauvegarde hors serveur et une restauration sur cible vierge avant d’accueillir une équipe.




## Installer avec Supabase géré ou depuis les sources {#managed-or-source-installation}

Supabase géré décrit l’exploitation du backend. Il peut accompagner le profil applicatif OCI officiel ou un serveur construit depuis les sources. Distinguez ces déploiements dans les relevés d’installation et de validation. Le backend doit fournir PostgreSQL, Auth, Storage et Realtime. Pour le profil OCI managed guidé, fournissez un projet sur supabase.com, son URL publique, les clés anon et service-role et une connexion PostgreSQL accessible aux outils de bootstrap. Utilisez votre propre projet ; les identifiants minddy Cloud ne sont pas des paramètres d’installation.


![Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.](/documentation/fr/managed-or-source-installation-flow.svg)

### Configurer Supabase géré {#managed}

Depuis le répertoire de la release vérifiée, lancez la commande ci-dessous. `IMAGE` est le digest [contrôlé dans la section de compatibilité](#verify-release). Les valeurs contenant ... sont des exemples inutilisables. Récupérez les vraies valeurs en privé et évitez les secrets dans l’historique ou les journaux partagés. L’installateur conserve l’environnement protégé existant, inclut son planificateur et laisse les services optionnels inactifs tant qu’ils ne sont pas configurés. Configurez séparément SMTP Auth et les redirections exactes dans votre projet Supabase.

Le profil OCI `managed` publié en v0.11.0 contient le même runner défaillant que le profil `full` : son installateur inchangé ne peut donc pas terminer le démarrage. Utilisez une release ultérieure, sans runner. La commande ci-dessous prépare la configuration avec `--skip-start`. Relisez ce fichier protégé en conservant l’image vérifiée et les secrets générés, puis relancez la commande sans `--skip-start`. Vérifiez le profil `managed` avant d’accueillir des utilisateurs. N’exécutez pas les commandes de backend local du profil full sur un projet fournisseur.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Déployer depuis les sources {#source}

Depuis les sources, installez les dépendances figées du tag, fournissez l’environnement de l’application et de Supabase, lancez le bootstrap, construisez puis démarrez le serveur de production derrière votre proxy. Définissez `MINDDY_PUBLIC_*` avant le démarrage. Vous devez fournir un planificateur durable avec les appels authentifiés décrits dans la [section des tâches planifiées](/fr/documentation/instance-configuration#schedules) ; une compilation seule n’exécute aucun job. Vérifiez migrations et Storage, puis testez Auth, création de tickets, octets des fichiers et Realtime. Sauvegardez cette instance avec la procédure logique ou fournisseur. Ne validez pas une installation OCI en la remplaçant par un serveur issu des sources.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
