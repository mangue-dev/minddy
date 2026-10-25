---
{
  "id": "install-locally",
  "locale": "fr",
  "title": "Instances locales",
  "summary": "Installez une instance locale privée depuis l’application desktop, ou ouvrez un clone préparé, avec Node.js 24.22.1 ou une version 24.x ultérieure, pnpm 10.28.0, Git, la CLI Supabase et un daemon Docker actif.",
  "topic": "Exploiter une instance",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.1 (release documentation gate)",
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
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/desktop/local-installer.ts",
      "desktop/src/local-installer.ts",
      "lib/desktop/local-toolchain.ts",
      "desktop/src/local-toolchain.ts",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/main.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx",
      "lib/desktop/local-account.ts",
      "desktop/src/local-account.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 desktop onboarding and built-in local installer: source review of lib/desktop/local-installer.ts, desktop/src/local-installer.ts, lib/desktop/onboarding-copy.ts, desktop/src/server-picker.ts, desktop/src/main.ts and scripts/self-hosting-local.mjs; installer procedure, labels and --prepare-only documented, manual clone kept as the alternative; automatic installation of missing tools checked against lib/desktop/local-toolchain.ts and desktop/src/local-toolchain.ts (requirement states, tool steps, app-owned toolchain folder, system prompts per platform, Linux sign-out, Install manually); then the server choice moved from a separate window to a screen in the app window: wording, Cancel, leaving the screen and the Internet requirement checked against components/desktop/server-choice.tsx, app/desktop/welcome/page.tsx, lib/desktop/server-choice.ts and desktop/src/main.ts; no browser or desktop walkthrough, no installation run; no screenshot recaptured); then the server choice bundled in the desktop app (offline, first screen), checked against components/desktop/server-choice-entry.tsx and desktop/src/server-choice.ts; then the self-hosted step regrouped into three cards and one existing-installation screen, checked against components/desktop/server-choice.tsx; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, checked against desktop/src/main.ts, components/auth/auth-chrome.tsx and components/desktop/server-choice.tsx; then the installer's account managed by the app: no email, automatic sign-in on the local instance, checked against lib/desktop/local-account.ts, desktop/src/local-account.ts, desktop/src/local-installer.ts, components/desktop/server-choice.tsx and components/auth/desktop-local-sign-in.tsx; no installation run, no screenshot recaptured",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (fr translation of the installer and server window rewrite with onboarding window and catalog labels, then automatic tool installation with catalog labels, register checked; equivalent meaning self-reviewed key by key; then window-to-screen wording, Cancel and Internet requirement with catalog labels; then the self-hosted step regrouped into three cards and one existing-installation screen, with catalog labels; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, with catalog labels; then the installer's account managed by the app: no email, automatic sign-in on the local instance, with catalog labels and formal register; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Lancer une instance locale depuis l’application desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/fr/install-locally-flow.svg",
      "alt": "Schéma: L’app desktop sélectionne le clone. Application locale : port 6463. Supabase minimal et données durables. Quitter arrête app et backend.",
      "caption": "L’application desktop gère le démarrage et l’arrêt des services locaux, tout en conservant leurs données.",
      "revision": 10,
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
            "title": "L’app desktop sélectionne le clone"
          },
          {
            "title": "Application locale : port 6463"
          },
          {
            "title": "Supabase minimal et données durables"
          },
          {
            "title": "Quitter arrête app et backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/fr/install-locally-wizard.png",
      "alt": "Assistant public d’installation avec le profil sur cet ordinateur sélectionné.",
      "caption": "Choisissez l’installation personnelle lorsque l’application de bureau doit gérer les services locaux.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        745
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Installer minddy sur cet ordinateur {#install-locally}

Une instance locale fait tourner minddy avec un Supabase minimal dans Docker sur un seul ordinateur, pour une évaluation ou un usage personnel. Ses données restent sur cet ordinateur, et l’application desktop démarre et arrête ses services. Elle utilise Git, Node.js 24.22.1 ou une version 24.x ultérieure, `pnpm` 10.28.0, la CLI Supabase et un daemon Docker actif. L’application desktop installe ceux qui manquent ; un clone que vous préparez vous-même en a besoin au préalable. Prévoyez au moins 4 Go de RAM libre, deux cœurs CPU et 10 Go de SSD libre ; 8 Go, quatre cœurs et 20 Go sont recommandés. Installez d’abord l’application desktop signée depuis la page de téléchargement. Windows passe par Microsoft Store ; macOS et Linux disposent de leurs téléchargements.

L’application desktop intègre un installeur qui exécute toute la procédure pour vous :

1. Ouvrez l’application desktop. Elle démarre sur minddy Cloud : le premier lancement ouvre son écran d’inscription. Cliquez sur **Auto-héberger minddy**, en bas de l’écran de connexion ou d’inscription. Une fois connecté, ouvrez le même écran avec **Connect to a Server…** dans le menu natif minddy (ce menu natif est en anglais ; sous Windows et Linux, appuyez sur Alt pour afficher la barre de menus), ou avec **Paramètres du compte** → **Préférences** → **Application de bureau** → **Serveur connecté** → **Changer…**.
2. Dans **Auto-héberger minddy**, choisissez **Installer sur cet ordinateur**.
3. Sous **Prérequis**, l’application vérifie Git, Node.js 24, pnpm, la CLI Supabase et Docker. Un outil manquant affiche **Introuvable ; sera installé**, et un Node.js plus ancien **Version … trouvée ; Node.js 24 sera installé pour minddy**. Un Docker installé mais arrêté affiche **Installé mais arrêté ; sera démarré**. Vous n’avez rien à installer au préalable : **Installer** s’en charge. **Vérifier à nouveau** relance la vérification.
4. Vérifiez le **Dossier d’installation**. Par défaut, il s’agit d’un dossier `minddy` dans votre dossier personnel ; **Choisir…** permet d’en sélectionner un autre. Si le dossier choisi contient déjà d’autres fichiers, l’application installe minddy dans un dossier `minddy` à l’intérieur.
5. Cliquez sur **Installer**. L’application ne demande aucun e-mail : une note indique que minddy crée votre compte sur cet ordinateur et vous connecte tout seul.
6. Gardez la fenêtre ouverte pendant les étapes. Les outils manquants passent en premier, chacun dans sa propre étape : **Installer Git**, **Installer Node.js 24**, **Installer pnpm**, **Installer Supabase CLI**, puis **Installer Docker** ou **Démarrer Docker**. **Télécharger minddy**, suivi du numéro de version, effectue un `git clone` superficiel de la version qu’utilise aussi le guide public d’installation. **Installer les dépendances** exécute `pnpm install --frozen-lockfile`, **Configurer l’instance** fait de votre compte local l’administrateur de l’instance, **Préparer Supabase et compiler l’app** exécute `pnpm self-host:local -- --no-open --prepare-only`, **Démarrer minddy** lance le runtime local, et **Créer votre compte local** crée votre compte sur l’instance. La première installation peut prendre plusieurs minutes, le temps que Docker télécharge les images Supabase et que l’application soit compilée.
7. Une fois minddy démarré, l’application l’ouvre avec votre compte local déjà connecté.

Le compte local est un compte ordinaire, nommé d’après votre compte utilisateur de l’ordinateur, avec l’adresse `owner@local.minddy.app`. Il administre l’instance, et les paramètres comme la propriété des projets fonctionnent normalement. L’application génère son mot de passe et le conserve chiffré dans le trousseau du système : vous ne le saisissez jamais, et la page ne reçoit qu’une session. Chaque fois que la fenêtre affiche cette instance, l’application connecte le compte d’elle-même derrière un bref écran **Ouverture de votre minddy…**. Si vous réinstallez dans un dossier dont les données Supabase ont été conservées, l’application retrouve le même compte et lui attribue un nouveau mot de passe ; vos données restent en place. Seule une instance installée par l’application fonctionne ainsi : un dossier ouvert avec **Utiliser une installation existante** › **Sur cet ordinateur** garde ses propres comptes et la connexion habituelle, et les serveurs distants utilisent toujours la connexion habituelle.

Node.js, pnpm et la CLI Supabase s’installent sans droits d’administrateur dans un dossier `toolchain`, situé dans le dossier des données utilisateur de l’application. Node.js provient de l’archive officielle de nodejs.org, vérifiée avec les sommes de contrôle SHA-256 publiées ; pnpm 10.28.0 et la CLI Supabase 2.115.0 s’installent avec npm. Ce Node.js ne remplace pas celui déjà présent sur le système : l’application le place en tête du `PATH` uniquement pour son installeur et son runtime local.

Git et Docker passent par la confirmation de votre système. Sur macOS, confirmez les outils de développement en ligne de commande dans la fenêtre d’Apple pour obtenir Git. Sur Windows, l’application ajoute MinGit, la version portable de Git for Windows, au même dossier après avoir vérifié son empreinte. Sur macOS et Windows, l’application télécharge Docker Desktop, vérifie qu’il est signé par Docker Inc, l’installe puis l’ouvre. macOS peut demander un mot de passe administrateur ; Windows demande l’autorisation par le Contrôle de compte d’utilisateur et affiche l’installeur de Docker. Acceptez ensuite la licence et les demandes d’autorisation de Docker Desktop. Sur Linux, une seule demande de mot de passe système installe Git avec le gestionnaire de paquets de votre distribution et Docker Engine avec le script officiel `get.docker.com` de Docker, démarre le service Docker et vous ajoute au groupe `docker`. Déconnectez-vous puis reconnectez-vous pour que votre compte puisse utiliser Docker, puis cliquez sur **Réessayer**.

L’application mémorise ensuite le dossier et gère le démarrage comme l’arrêt des services locaux, comme décrit dans [Utiliser un clone préparé](#launch). Comme une installation manuelle, la nouvelle instance chiffre le contenu de l’espace de travail par défaut. Consultez le [chiffrement de l’espace de travail](/fr/documentation/workspace-encryption#workspace-encryption).

![Schéma: L’app desktop sélectionne le clone. Application locale : port 6463. Supabase minimal et données durables. Quitter arrête app et backend.](/documentation/fr/install-locally-flow.svg)

## Utiliser un clone préparé {#launch}

Préparez le clone vous-même si vous voulez choisir la version ou examiner le dépôt avant de le lancer. Utilisez un clone dédié et positionnez-le sur la version à évaluer avant d’installer ses dépendances.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

Les nouvelles installations locales chiffrent le contenu de l’espace de travail par défaut. Pour enregistrer un choix explicite, lancez `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (ou `--encryption disabled`) dans le clone avant de l’ouvrir dans l’application ; les démarrages suivants conservent le choix enregistré.

Ouvrez l’étape **Auto-héberger minddy** comme à la première étape ci-dessus, choisissez **Utiliser une installation existante**, puis **Sur cet ordinateur**, et sélectionnez la racine du clone. L’application lance `self-host:local --no-open`, prépare Supabase minimal, applique les migrations et la configuration Storage, construit l’application si nécessaire et attend `/api/health` avant d’ouvrir l’inscription. Elle écoute uniquement sur la boucle locale, au port 6463, mémorise le dossier et gère le démarrage comme l’arrêt. Le guide public d’installation décrit la même installation personnelle.

![Assistant public d’installation avec le profil sur cet ordinateur sélectionné.](/documentation/fr/install-locally-wizard.png)

## Disponibilité du MCP et accès réseau {#mcp-network-access}

Le MCP est inclus dans minddy auto-hébergé et démarre avec l’application. Il fonctionne directement sur `/api/mcp`, à l’origine de l’instance configurée par `MINDDY_PUBLIC_APP_URL`. La découverte OAuth et l’enregistrement dynamique des clients sont inclus : aucun serveur MCP séparé, aucune application OAuth dédiée ni aucun proxy minddy Cloud n’est nécessaire. Connectez votre client MCP au point d’accès de votre instance, puis connectez-vous et accordez l’accès dans le navigateur.

La disponibilité du service ne garantit pas son accessibilité réseau. Le client MCP et le navigateur utilisé pour l’autorisation doivent tous deux pouvoir atteindre les URL MCP et OAuth annoncées. Si vous définissez explicitement `OAUTH_ISSUER`, cette origine doit aussi être accessible. Le client doit prendre en charge la connexion, le parcours OAuth et le chemin réseau choisi ; certains clients exigent HTTPS même sur un réseau privé.

Ce profil géré par l’application desktop écoute uniquement sur l’interface de boucle locale. Un client MCP compatible sur le même ordinateur peut utiliser `http://localhost:6463/api/mcp` ; `localhost` et `127.0.0.1` désignent l’ordinateur qui établit la connexion. Un autre ordinateur ou un agent hébergé dans le cloud ne peut pas accéder directement à ce profil. Pour un accès LAN/VPN, utilisez une installation serveur avec une origine configurée accessible, par exemple `http://192.168.1.50`, et autorisez son port d’application au niveau de l’adresse d’écoute, du pare-feu et du routage. Hors de ce réseau, le client doit disposer d’une origine HTTPS accessible comme `https://tickets.example.com`, ou d’un autre chemin réseau pris en charge. Une installation locale ne fournit pas automatiquement un accès depuis Internet.

[Consultez les explications sur l’accès réseau au MCP avant de connecter un client distant](/docs/minddy-mcp#network-access).

## Résoudre un échec de démarrage {#recover}

L’écran de choix du serveur est intégré à l’app de bureau : il s’ouvre sans connexion Internet, si bien qu’une instance locale peut toujours être choisie ou changée hors ligne.

Si une étape d’installation échoue, l’écran d’installation la signale et affiche la dernière ligne écrite par sa commande. Une étape d’outil en échec propose aussi **Installer manuellement**, qui ouvre la page de téléchargement de cet outil. Corrigez la cause, par exemple en acceptant les demandes de Docker Desktop, en installant l’outil vous-même ou en libérant de l’espace disque, puis cliquez sur **Réessayer**. L’installation reprend dans le même dossier ; les outils déjà installés et une version déjà téléchargée ne sont pas récupérés de nouveau. **Retour** ramène au champ du dossier. **Annuler**, sous les étapes, arrête une installation en cours, tout comme quitter cet écran ; fermer la fenêtre se contente de la masquer. Pour lire la sortie complète de l’étape de préparation, lancez `pnpm self-host:local -- --no-open --prepare-only` dans le dossier d’installation : la commande prépare Supabase et compile l’application, puis s’arrête en laissant Supabase actif.

Fermer une fenêtre laisse l’application desktop active ; utilisez la commande Quitter de l’application pour l’arrêter avec les services locaux. Vérifiez Docker, la CLI, l’espace libre et un éventuel autre processus sur le port 6463. `pnpm self-host:local` est une solution de diagnostic en terminal. Arrêtez-la avec Ctrl+C avant de rendre la main à l’application, qui refuse de prendre le contrôle d’un autre processus. Quitter l’application arrête normalement Supabase aussi ; `--keep-backend` modifie explicitement ce comportement. N’utilisez jamais `supabase db reset --local` pour récupérer des données : cette commande détruit les données d’évaluation. Vérifiez compte, projet, ticket et pièce jointe avant de vous fier à l’instance.
