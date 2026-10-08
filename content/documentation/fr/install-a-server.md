---
{
  "id": "install-a-server",
  "locale": "fr",
  "title": "Installer le profil serveur de référence",
  "summary": "Partez d’un tag vérifié et du digest immuable de son image.",
  "topic": "Exploiter une instance",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "self-hosted-compatibility",
    "authentication-and-email",
    "back-up-the-reference-instance"
  ],
  "aliases": [
    "self-hosting"
  ],
  "tags": [],
  "figures": [
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/fr/install-a-server-flow.svg",
      "alt": "Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.",
      "caption": "Lisez les étapes dans cet ordre. Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.",
      "revision": 1,
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
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-a-server-flow"
  ]
}
---

## Installer le profil serveur de référence {#install-a-server}

Partez d’un tag vérifié et du digest immuable de son image. Linux amd64 et arm64 sont pris en charge. Prévoyez 4 Go de RAM, deux cœurs et 20 Go de SSD avec Supabase géré ; 8 Go, quatre cœurs et 60 Go si Supabase partage le serveur. Un service public exige DNS et HTTPS sur vos propres origines. HTTP n’est accepté que sur localhost ou une IPv4 privée. Limitez-le à un réseau local de confiance et ne redirigez aucun port du routeur. Dans ce mode, le profil full expose l’application sur le port 80 et l’API sur 8000.


![Schéma: Release vérifiée et environnement protégé. Installateur : profil full de référence. Supabase officiel, app, jobs, runner. Validation compte, fichiers et récupération.](/documentation/fr/install-a-server-flow.svg)


![Assistant public d’installation avec Supabase sur le même serveur sélectionné.](/documentation/fr/install-a-server-wizard.png)

## Configurer et lancer l’installateur {#install}

Exécutez pnpm self-host:install depuis le répertoire de la release. Choisissez managed ou full, l’origine de l’application et l’adresse de l’administrateur. Pour full, récupérez d’abord la version épinglée de Supabase. L’installateur crée un environnement de mode 0600, génère les secrets distincts manquants, récupère les images, démarre le profil et lance le bootstrap idempotent. Il conserve l’image épinglée et les secrets existants. L’exemple utilise IMAGE vérifié dans l’article de compatibilité. Pour les emails Auth réels, ajoutez d’abord --skip-start, renseignez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL et SMTP_SENDER_NAME dans le fichier protégé, puis relancez. Gardez ENABLE_EMAIL_AUTOCONFIRM=false. supabase-mail est un exemple, pas une boîte de production.


Avant le démarrage, comparez MINDDY_RELEASE et MINDDY_IMAGE du fichier protégé avec la ligne de compatibilité choisie et l’asset conteneur vérifié. Le modèle de déploiement v0.11.0 indique encore 0.10.30 ; --image change seulement la référence d’image et aucun argument --release n’existe. Pour une nouvelle installation v0.11.0 préparée avec --skip-start, définissez explicitement MINDDY_RELEASE=0.11.0 et conservez le digest immuable vérifié. Ne remplacez ni les identifiants générés ni les clés de chiffrement. La version du package candidat ne prouve pas un profil 0.11.1 pris en charge : ce snapshot ne contient aucune ligne de compatibilité correspondante.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


La commande précédente crée deploy/self-hosted/.env dans le répertoire de la release choisie. Modifiez ce fichier protégé avant le démarrage. Pour la variante technique v0.11.0 décrite ici, arrêtez l’installateur automatique à cette étape de configuration : suivez [la procédure épinglée du runner et des workers](#runner-workaround), puis [le démarrage explicite du profil full](#adapted-start). Ne relancez pas l’installateur historique sans --skip-start : il omet l’overlay nécessaire et ne peut pas terminer cette variante. Les origines, l’image et les secrets existants restent dans le fichier protégé.


## Vérifier avant l’accueil des utilisateurs {#accept}

Les profils de référence incluent le planificateur et le runner de sandbox de confiance. N’exposez jamais son port 6464 ou PostgreSQL sur Internet. Lancez le doctor avec l’environnement installé et le Compose amont du profil full. Testez confirmation, connexion, MFA, réinitialisation, création de projet et ticket, transfert de pièce jointe et Realtime dans deux sessions. Un 200 de /api/health prouve seulement que l’application tourne. Après interruption, reprenez la séquence explicite adaptée avec le même contexte Compose et le fichier d’environnement protégé, sans effacer les données. Préparez une sauvegarde hors serveur et une restauration sur cible vierge avant d’accueillir une équipe.

## Limites du runner dans la version publiée {#known-runner-limits}

Le runner publié dans v0.11.0 présente d’autres blocages de l’exécution de code : il refuse les noms de sandbox contenant le suffixe d’allocation, écrit des fragments base64 trop grands pour une seule valeur d’environnement Linux et initialise en root un stockage temporaire appartenant à UID 10001, de mode 0700, après suppression de toutes les capacités. Cette dernière commande peut échouer sans que son résultat soit contrôlé, laissant le répertoire de travail absent. Un endpoint runner sain ne valide donc ni le clonage ni l’exécution de code. Le candidat courant corrige ces chemins ; la répétition jetable a utilisé le runner et son helper de stockage actuels par des montages explicites en lecture seule sur l’image v0.11.0. Cela ne crée ni image publiée corrigée ni nouvelle ligne de compatibilité prise en charge. Obtenez une combinaison de release et d’outils corrigée, puis vérifiez le parcours de travail sur le code avant d’activer ces agents pour une équipe.

## Appliquer le contournement technique épinglé {#runner-workaround}

Pour l’image publiée v0.11.0, cette variante explicite des outils fournit aussi le challenge Basic requis par les clients Git HTTP. Elle est épinglée au commit source 89ab340cb10ec729948fc6e596fb7ab0326fc470 : ce n’est ni une nouvelle image publiée ni une nouvelle ligne de compatibilité. Préparez d’abord la configuration de base ; appliquez cette variante avant de démarrer la pile full. Les deux fichiers doivent rester ensemble, avec les empreintes vérifiées, sur un stockage persistant. Ces commandes ne publient aucun port du runner.

Définissez d’abord le contexte de l’instance dans [la procédure de sauvegarde du profil de référence](/fr/documentation/back-up-the-reference-instance#context). Sa fonction Compose doit inclure RUNNER_FIX_OVERRIDE. Téléchargez ensuite les deux fichiers publics ci-dessous et vérifiez-les. Arrêtez la procédure si une empreinte diffère.

Cette procédure construit aussi une image séparée pour les workers de code. L’image de base est épinglée, mais les paquets Debian sont résolus lors de la construction : relevez l’ID de l’image Docker obtenue et conservez cette image exacte avec la sauvegarde. Ne la remplacez jamais par l’image de l’application après une restauration. La construction demande l’accès au registre de base et aux dépôts Debian ; un nouveau bootstrap OpenCode demande aussi le registre npm. La recette fournit les outils du bootstrap, pas toutes les dépendances des projets. Les outils de compilation supplémentaires nécessitent une variante explicitement maintenue. L’overlay Compose ci-dessous définit directement la variable d’image du service runner, car le fichier Compose historique ignore une valeur AGENT_RUNNER_SANDBOX_IMAGE isolée dans le fichier protégé.

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

L’image publiée de l’application inclut Node.js et Git, mais retire volontairement npm, npx et Corepack. Le profil Compose de référence choisit aussi cette image pour les workers via AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Cela ne suffit pas pour un nouveau worker de code : le bootstrap OpenCode utilise npm pour installer son runtime et son plugin épinglés, même dans un dépôt sans dépendances de projet. Sans npm, l’exécution s’arrête au bootstrap ; la conversation ne permet pas de conclure qu’un fichier du projet a été modifié ou qu’un test a réussi. Utilisez une image dédiée aux workers, construite et vérifiée par l’opérateur, avec Node.js 24, npm, Git et les outils nécessaires au projet, en surchargeant AGENT_RUNNER_SANDBOX_IMAGE dans le service runner. Conservez les contraintes d’isolation du runner. Vérifiez le bootstrap, le clonage, les véritables tests et le diff obtenu avant d’autoriser la délégation de code. Corriger les fichiers du runner ne fournit pas cette chaîne d’outils au worker.

## Démarrer le profil full explicitement adapté {#adapted-start}

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

Le helper de stockage épinglé rend aussi l’espace de travail de la sandbox exécutable. Docker monte sinon ce tmpfs avec noexec, ce qui empêche le démarrage du binaire natif OpenCode et peut faire apparaître une erreur trompeuse de repli vers un paquet musl. La correction conserve nosuid, nodev, les UID/GID 10001, le mode 0700, la racine en lecture seule, les capabilities retirées et le stockage jetable propre à chaque sandbox. Elle ne rend pas les données de l’hôte exécutables et ne transforme pas l’image de l’application en image worker adaptée.
