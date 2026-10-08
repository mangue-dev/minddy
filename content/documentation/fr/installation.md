---
{
  "id": "installation",
  "locale": "fr",
  "title": "Installation auto-hébergée",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "caption": "Lisez les étapes dans cet ordre. Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/fr/install-a-server-flow.svg",
      "alt": "Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.",
      "caption": "Lisez les étapes dans cet ordre. Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/fr/install-a-server-wizard.png",
      "alt": "Assistant public d’installation avec Supabase sur le même serveur sélectionné.",
      "caption": "Le profil full conserve l’application et Supabase sur votre serveur. Dans cet exemple, leur accès par réseau privé est limité au réseau local.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/fr/managed-or-source-installation-flow.svg",
      "alt": "Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.",
      "caption": "Ces composants ont des responsabilités distinctes. Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Installez une instance auto-hébergée à partir d’une release vérifiée et du profil correspondant : full, Supabase géré ou sources. Vérifiez d’abord la compatibilité et les limites du runner publié, puis suivez la procédure choisie et ses contrôles avant d’accueillir les utilisateurs. Le contournement technique v0.11.0 documenté constitue une variante explicite des outils, pas une release publiée corrigée.

## Choisir une version et un profil d’installation pris en charge {#self-hosted-compatibility}

Utilisez une version immuable du dépôt public mangue-dev/minddy. La ligne de compatibilité v0.11.0 prend en charge les serveurs Linux amd64 et arm64, Node.js 24, pnpm 10.28.0, Docker Engine à partir de 27.0.0 et le plugin Compose à partir de 2.29.0. Le profil full utilise Supabase officiel self-hosted/v0.7.2, au commit 549db119c44c25167461812041ba198bde2b31a4. Conservez l’ensemble de ses images : mettre à jour un service isolément produit une variante gérée par l’opérateur.

Le profil managed se connecte à un projet Supabase sur supabase.com. Celui-ci doit fournir PostgreSQL, Auth, Storage et Realtime et réussir la vérification de la version. PostgreSQL seul ne suffit pas. La pile locale de la CLI Supabase sert au développement et à l’évaluation, pas à un service public de production.


![Schéma: Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.](/documentation/fr/self-hosted-compatibility-flow.svg)

### Vérifier la release {#verify-release}

Vérifiez le tag annoté, les fichiers de la release, SHA256SUMS et la signature OCI officielle avant d’installer des dépendances ou d’exécuter la version. Les commandes Bash suivantes partent du dépôt positionné sur le tag choisi et définissent IMAGE avec le digest vérifié. Arrêtez-vous dès qu’un contrôle échoue. Installez d’abord Cosign en suivant ses instructions officielles. Ce contrôle établit l’identité du code et de l’image, pas le bon fonctionnement du déploiement.

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

### Limites du runner dans la version publiée {#known-runner-limits}

Le runner publié dans v0.11.0 présente d’autres blocages de l’exécution de code : il refuse les noms de sandbox contenant le suffixe d’allocation, écrit des fragments base64 trop grands pour une seule valeur d’environnement Linux et initialise en root un stockage temporaire appartenant à UID 10001, de mode 0700, après suppression de toutes les capacités. Cette dernière commande peut échouer sans que son résultat soit contrôlé, laissant le répertoire de travail absent. Un endpoint runner sain ne valide donc ni le clonage ni l’exécution de code. Le candidat courant corrige ces chemins ; la répétition jetable a utilisé le runner et son helper de stockage actuels par des montages explicites en lecture seule sur l’image v0.11.0. Cela ne crée ni image publiée corrigée ni nouvelle ligne de compatibilité prise en charge. Obtenez une combinaison de release et d’outils corrigée, puis vérifiez le parcours de travail sur le code avant d’activer ces agents pour une équipe.

Le relais Git de v0.11.0 omet aussi le challenge HTTP Basic, ce qui empêche un client Git ordinaire d’envoyer ses identifiants. Le [contournement technique épinglé](/fr/documentation/installation#runner-workaround) fournit les fichiers correspondants du runner et leurs empreintes ; il ne modifie pas l’image publiée et ne crée pas de version prise en charge.

L’image publiée de l’application inclut Node.js et Git, mais retire volontairement npm, npx et Corepack. Le profil Compose de référence choisit aussi cette image pour les workers via AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Cela ne suffit pas pour un nouveau worker de code : le bootstrap OpenCode utilise npm pour installer son runtime et son plugin épinglés, même dans un dépôt sans dépendances de projet. Sans npm, l’exécution s’arrête au bootstrap ; la conversation ne permet pas de conclure qu’un fichier du projet a été modifié ou qu’un test a réussi. Utilisez une image dédiée aux workers, construite et vérifiée par l’opérateur, avec Node.js 24, npm, Git et les outils nécessaires au projet, en surchargeant AGENT_RUNNER_SANDBOX_IMAGE dans le service runner. Conservez les contraintes d’isolation du runner. Vérifiez le bootstrap, le clonage, les véritables tests et le diff obtenu avant d’autoriser la délégation de code. Corriger les fichiers du runner ne fournit pas cette chaîne d’outils au worker.

Le helper de stockage épinglé rend aussi l’espace de travail de la sandbox exécutable. Docker monte sinon ce tmpfs avec noexec, ce qui empêche le démarrage du binaire natif OpenCode et peut faire apparaître une erreur trompeuse de repli vers un paquet musl. La correction conserve nosuid, nodev, les UID/GID 10001, le mode 0700, la racine en lecture seule, les capabilities retirées et le stockage jetable propre à chaque sandbox. Elle ne rend pas les données de l’hôte exécutables et ne transforme pas l’image de l’application en image worker adaptée.

## Installer le profil serveur de référence {#install-a-server}

Partez d’un tag vérifié et du digest immuable de son image. Linux amd64 et arm64 sont pris en charge. Prévoyez 4 Go de RAM, deux cœurs et 20 Go de SSD avec Supabase géré ; 8 Go, quatre cœurs et 60 Go si Supabase partage le serveur. Un service public exige DNS et HTTPS sur vos propres origines. HTTP n’est accepté que sur localhost ou une IPv4 privée. Limitez-le à un réseau local de confiance et ne redirigez aucun port du routeur. Dans ce mode, le profil full expose l’application sur le port 80 et l’API sur 8000.


![Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.](/documentation/fr/install-a-server-flow.svg)


![Assistant public d’installation avec Supabase sur le même serveur sélectionné.](/documentation/fr/install-a-server-wizard.png)

### Configurer et lancer l’installateur {#install}

Exécutez pnpm self-host:install depuis le répertoire de la release. Choisissez managed ou full, l’origine de l’application et l’adresse de l’administrateur. Pour full, récupérez d’abord la version épinglée de Supabase. L’installateur crée un environnement de mode 0600, génère les secrets distincts manquants, récupère les images, démarre le profil et lance le bootstrap idempotent. Il conserve l’image épinglée et les secrets existants. L’exemple utilise IMAGE [vérifié dans la section de compatibilité](#verify-release). Pour les emails Auth réels, ajoutez d’abord --skip-start, renseignez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL et SMTP_SENDER_NAME dans le fichier protégé, puis relancez. Gardez ENABLE_EMAIL_AUTOCONFIRM=false. supabase-mail est un exemple, pas une boîte de production.


Avant le démarrage, comparez MINDDY_RELEASE et MINDDY_IMAGE du fichier protégé avec la ligne de compatibilité choisie et l’asset conteneur vérifié. Le modèle de déploiement v0.11.0 indique encore 0.10.30 ; --image change seulement la référence d’image et aucun argument --release n’existe. Pour une nouvelle installation v0.11.0 préparée avec --skip-start, définissez explicitement MINDDY_RELEASE=0.11.0 et conservez le digest immuable vérifié. Ne remplacez ni les identifiants générés ni les clés de chiffrement. La version du package candidat ne prouve pas un profil 0.11.1 pris en charge : ce snapshot ne contient aucune ligne de compatibilité correspondante.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


La commande précédente crée deploy/self-hosted/.env dans le répertoire de la release choisie. Modifiez ce fichier protégé avant le démarrage. Pour la variante technique v0.11.0 décrite ici, arrêtez l’installateur automatique à cette étape de configuration : suivez [la procédure épinglée du runner et des workers](/fr/documentation/installation#runner-workaround), puis [le démarrage explicite du profil full](/fr/documentation/installation#adapted-start). Ne relancez pas l’installateur historique sans --skip-start : il omet l’overlay nécessaire et ne peut pas terminer cette variante. Les origines, l’image et les secrets existants restent dans le fichier protégé.

### Vérifier avant l’accueil des utilisateurs {#accept}

Les profils de référence incluent le planificateur et le runner de sandbox de confiance. N’exposez jamais son port 6464 ou PostgreSQL sur Internet. Lancez le doctor avec l’environnement installé et le Compose amont du profil full. Testez confirmation, connexion, MFA, réinitialisation, création de projet et ticket, transfert de pièce jointe et Realtime dans deux sessions. Un 200 de /api/health prouve seulement que l’application tourne. Après interruption, reprenez la séquence explicite adaptée avec le même contexte Compose et le fichier d’environnement protégé, sans effacer les données. Préparez une sauvegarde hors serveur et une restauration sur cible vierge avant d’accueillir une équipe.

### Prérequis du runner pour le profil serveur {#install-a-server-known-runner-limits}

Les [limites du runner publié](#known-runner-limits) affectent le clonage et l’exécution de code même si les contrôles de santé réussissent. Pour la variante v0.11.0 documentée, appliquez les fichiers épinglés du runner et l’image dédiée aux workers ci-dessous avant d’activer les agents de code ; cette variante ne crée pas une nouvelle release prise en charge.

### Appliquer le contournement technique épinglé {#runner-workaround}

Pour l’image publiée v0.11.0, cette variante explicite des outils fournit aussi le challenge Basic requis par les clients Git HTTP. Elle est épinglée au commit source 89ab340cb10ec729948fc6e596fb7ab0326fc470 : ce n’est ni une nouvelle image publiée ni une nouvelle ligne de compatibilité. Préparez d’abord la configuration de base ; appliquez cette variante avant de démarrer la pile full. Les deux fichiers doivent rester ensemble, avec les empreintes vérifiées, sur un stockage persistant. Ces commandes ne publient aucun port du runner.

Définissez d’abord le contexte de l’instance dans [la procédure de sauvegarde du profil de référence](/fr/documentation/backups-and-restoration#context). Sa fonction Compose doit inclure RUNNER_FIX_OVERRIDE. Téléchargez ensuite les deux fichiers publics ci-dessous et vérifiez-les. Arrêtez la procédure si une empreinte diffère.

Cette procédure construit aussi une image séparée pour les workers de code. L’image de l’application ne contient pas npm et ne peut pas initialiser un nouveau worker de code ; cette image séparée est nécessaire.  L’image de base est épinglée, mais les paquets Debian sont résolus lors de la construction : relevez l’ID de l’image Docker obtenue et conservez cette image exacte avec la sauvegarde. Ne la remplacez jamais par l’image de l’application après une restauration. La construction demande l’accès au registre de base et aux dépôts Debian ; un nouveau bootstrap OpenCode demande aussi le registre npm. La recette fournit les outils du bootstrap, pas toutes les dépendances des projets. Les outils de compilation supplémentaires nécessitent une variante explicitement maintenue. L’overlay Compose ci-dessous définit directement la variable d’image du service runner, car le fichier Compose historique ignore une valeur AGENT_RUNNER_SANDBOX_IMAGE isolée dans le fichier protégé.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

La commande compose up recrée uniquement le runner. Sa réponse de santé ne suffit toujours pas : vérifiez un nouveau sandbox, le clonage du dépôt, un fichier de plus de 1 Mio, les tests et le diff obtenu avant d’autoriser les agents de code. Conservez RUNNER_FIX_OVERRIDE et RUNNER_FIX_DIR dans chaque session d’exploitation. L’installateur historique et l’outil de mise à niveau ne prennent pas cet override shell en compte : après toute modification ou recréation du runner par l’un d’eux, réappliquez cette commande Compose. Incluez les deux fichiers et l’override dans la sauvegarde chiffrée, puis rétablissez leurs chemins absolus avant de redémarrer le runner.

Conservez l’image dédiée aux workers configurée ci-dessus. L’image de l’application ne peut pas initialiser un nouveau worker car npm y manque ; consultez les [prérequis de sa chaîne d’outils](#known-runner-limits) avant de remplacer une image.

### Démarrer le profil full explicitement adapté {#adapted-start}

L’installateur v0.11.0 inchangé ne peut pas terminer cette variante technique : son image omet le helper, son pin de fonction diffère de la dépendance figée et il n’accepte pas l’overlay du runner ci-dessus. Pour cette variante, préparez la configuration avec --skip-start et appliquez les outils épinglés avant le premier démarrage. Utilisez la séquence full suivante au lieu de relancer l’installateur historique sans --skip-start. Le remplacement du pin est une modification explicite de l’outillage de déploiement, pas du tag publié. Conservez le pin d’origine avec les preuves de la release.

Si vous exécutez ce profil full sur macOS avec Docker Desktop, appliquez l’[override de volume pour Storage filesystem](/fr/documentation/storage-and-attachments#docker-desktop) avant le premier démarrage et conservez RESTORE_OVERRIDE avec l’override du runner. Le montage de dossier sur hôte Linux et ce profil avec volume nommé nécessitent des archives d’octets différentes ; utilisez la procédure de sauvegarde et de restauration correspondante.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

Le wrapper lit le fichier protégé comme des données, calcule les URL privées de maintenance avec les mêmes helpers exportés que l’installateur et lance le bootstrap d’origine avec les prérequis du scheduler. Son journal de diagnostic reste en mode 0600 ; ne le joignez pas à un rapport public sans l’avoir inspecté et expurgé. Toute phase en échec doit arrêter la procédure. Le doctor doit utiliser le même contexte adapté ; il vérifie les services, pas l’acceptation du worker de code ni la livraison par des fournisseurs externes.

La [correction du helper de stockage](#known-runner-limits) reste nécessaire pour exécuter OpenCode dans la sandbox. Conservez ce helper avec les fichiers du runner et l’image dédiée aux workers lors de la sauvegarde ou de la restauration de cette variante.

## Installer avec Supabase géré ou depuis les sources {#managed-or-source-installation}

Supabase géré décrit l’exploitation du backend. Il peut accompagner le profil applicatif OCI officiel ou un serveur construit depuis les sources. Distinguez ces déploiements dans les relevés d’installation et de validation. Le backend doit fournir PostgreSQL, Auth, Storage et Realtime. Pour le profil OCI managed guidé, fournissez un projet sur supabase.com, son URL publique, les clés anon et service-role et une connexion PostgreSQL accessible aux outils de bootstrap. Utilisez votre propre projet ; les identifiants minddy Cloud ne sont pas des paramètres d’installation.


![Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.](/documentation/fr/managed-or-source-installation-flow.svg)

### Configurer Supabase géré {#managed}

Depuis le répertoire de la release vérifiée, lancez la commande ci-dessous. IMAGE est le digest [contrôlé dans la section de compatibilité](#verify-release). Les valeurs contenant ... sont des exemples inutilisables. Récupérez les vraies valeurs en privé et évitez les secrets dans l’historique ou les journaux partagés. L’installateur conserve l’environnement protégé existant, inclut son planificateur et son runner et laisse les services optionnels inactifs tant qu’ils ne sont pas configurés. Configurez séparément SMTP Auth et les redirections exactes dans votre projet Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

### Déployer depuis les sources {#source}

Depuis les sources, installez les dépendances figées du tag, fournissez l’environnement de l’application et de Supabase, lancez le bootstrap, construisez puis démarrez le serveur de production derrière votre proxy. Définissez MINDDY_PUBLIC_* avant le démarrage. Vous devez fournir un planificateur durable avec les appels authentifiés décrits dans la [section des tâches planifiées](/fr/documentation/instance-configuration#schedules) ; une compilation seule n’exécute aucun job. Vérifiez migrations et Storage, puis testez Auth, création de tickets, octets des fichiers et Realtime. Sauvegardez cette instance avec la procédure logique ou fournisseur. Ne validez pas une installation OCI en la remplaçant par un serveur issu des sources.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
