---
{
  "id": "install-locally",
  "locale": "en",
  "title": "Local instances",
  "summary": "Install a private local instance from the desktop app, or open a clone you prepared, with Node.js 24.22.1 or a later 24.x, pnpm 10.28.0, Git, Supabase CLI and a running Docker daemon.",
  "topic": "Operate an instance",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
    "revision": 11,
    "fact": "agent:claude-code (MIN-847 desktop configuration step checked against scripts/self-hosting-install.mjs and lib/desktop/local-installer.ts); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 self-hosting from the desktop app and built-in local installer: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, components/auth/desktop-local-sign-in.tsx, desktop/src/main.ts, desktop/src/local-installer.ts, desktop/src/local-toolchain.ts, desktop/src/local-account.ts and the matching lib/desktop modules; no installation run, no screenshot recaptured)",
    "language": "agent:claude-code (en MIN-847 sentence; self-reviewed; agent review, not human acceptance); agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (en Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-781 changed passages on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Run a local instance from the desktop app"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/en/install-locally-flow.svg",
      "alt": "Diagram: Desktop app selects the clone. Loopback application: port 6463. Minimal Supabase and durable data. Quitting stops app and backend.",
      "caption": "The desktop app manages startup and shutdown of local services while preserving their stored data.",
      "revision": 11,
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
            "title": "Desktop app selects the clone"
          },
          {
            "title": "Loopback application: port 6463"
          },
          {
            "title": "Minimal Supabase and durable data"
          },
          {
            "title": "Quitting stops app and backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/en/install-locally-wizard.png",
      "alt": "Public installation wizard with the local computer profile selected.",
      "caption": "Choose the personal installation when the desktop app will manage the local services.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        692
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

## Install minddy on this computer {#install-locally}

A local instance runs minddy with a minimal Supabase stack in Docker on one computer, for evaluation or personal use. Its data stays on that computer, and the desktop app starts and stops its services. It uses Git, Node.js 24.22.1 or a later 24.x, `pnpm` 10.28.0, Supabase CLI and a running Docker daemon. The desktop app installs any of them that is missing; a clone you prepare yourself needs them beforehand. Allow at least 4 GB free RAM, two CPU cores and 10 GB free SSD; 8 GB, four cores and 20 GB are recommended. Install the signed desktop app from the download page first. Windows uses Microsoft Store; macOS and Linux use their platform downloads.

The desktop app includes an installer that runs the whole procedure for you:

1. Open the desktop app. It starts on minddy Cloud: the first launch opens its sign-up screen. Click **Self-host minddy** at the bottom of the sign-in or sign-up screen. Once signed in, open the same screen with **Connect to a Server…** in the native minddy menu (press Alt on Windows and Linux to show the menu bar), or with **Account settings** → **Preferences** → **Desktop app** → **Connected server** → **Change…**.
2. In **Self-host minddy**, choose **Install on this computer**.
3. Under **Requirements**, the app checks Git, Node.js 24, pnpm, Supabase CLI and Docker. A missing tool reads **Not found; will be installed**, and an older Node.js reads **Version … found; Node.js 24 will be installed for minddy**. A Docker that is installed but stopped reads **Installed but not running; will be started**. You do not need to install anything first: **Install** takes care of it. **Check again** repeats the check.
4. Check the **Installation folder**. It defaults to a `minddy` folder in your home folder; **Choose…** selects another one. If the folder you choose already contains other files, the app installs into a `minddy` folder inside it.
5. Click **Install**. The app asks for no email: a note explains that minddy creates your account on this computer and signs you in by itself.
6. Keep the window open while the steps run. Missing tools come first, each as its own step: **Install Git**, **Install Node.js 24**, **Install pnpm**, **Install Supabase CLI**, then **Install Docker** or **Start Docker**. **Download minddy**, followed by the release number, makes a shallow `git clone` of the release that the public installation guide also uses. **Install dependencies** runs `pnpm install --frozen-lockfile`, **Configure the instance** makes your local account the instance administrator, **Prepare Supabase and build the app** runs `pnpm self-host:local -- --no-open --prepare-only`, **Start minddy** starts the local runtime, and **Create your local account** creates your account on the instance. The first installation can take several minutes while Docker pulls the Supabase images and the app builds.
7. When minddy is running, the app opens it already signed in to your local account.

The local account is an ordinary account named after your user account on the computer, with the address `owner@local.minddy.app`. It administers the instance, and settings and project ownership work as usual. The app generates its password and keeps it encrypted in the system keychain: you never type it, and the page receives only a session. Whenever the window shows this instance, the app signs the account in by itself behind a short **Opening your minddy…** screen. If you reinstall into a folder whose Supabase data was kept, the app finds the same account again and gives it a new password; your data stays. This applies only to an instance the app installed: a folder opened with **Use an existing installation** › **On this computer** keeps its own accounts and the usual sign-in, and remote servers always use the usual sign-in. The app also writes `MINDDY_CONFIG_OVERRIDES=1` to the folder’s `.env.local`, so the **Instance** tab of the admin dashboard edits the instance variables; see [edit the instance variables](/docs/instance-administration#instance-variables).

Node.js, pnpm and Supabase CLI install without administrator rights into a `toolchain` folder inside the app’s user data folder. Node.js comes from the official nodejs.org archive, checked against its published SHA-256 checksums; pnpm 10.28.0 and Supabase CLI 2.115.0 install with npm. This Node.js does not replace one already on the system: the app puts it first on `PATH` only for its installer and local runtime.

Git and Docker go through your system’s own confirmation. On macOS, confirm the command line developer tools in Apple’s dialog to get Git. On Windows, the app adds the portable MinGit from Git for Windows, after checking its digest, to the same app folder. On macOS and Windows, the app downloads Docker Desktop, checks that Docker Inc signed it, installs it and opens it. macOS may ask for an administrator password; Windows asks through User Account Control and shows Docker’s own installer. Then accept Docker Desktop’s license and permission prompts. On Linux, one system password prompt installs Git with your distribution’s package manager and Docker Engine with Docker’s official `get.docker.com` script, starts the Docker service and adds you to the `docker` group. Sign out and back in so your account can use Docker, then click **Try again**.

The app then remembers the folder and owns startup and shutdown of the local services, as described in [Use a clone you prepared](#launch). Like a manual installation, the new instance encrypts workspace content by default. See [workspace encryption](/docs/workspace-encryption#workspace-encryption).

![Diagram: Desktop app selects the clone. Loopback application: port 6463. Minimal Supabase and durable data. Quitting stops app and backend.](/documentation/en/install-locally-flow.svg)

## Use a clone you prepared {#launch}

Prepare the clone yourself when you want to choose the release or inspect the checkout before running it. Use a dedicated clone and pin it to the release you intend to evaluate before installing its dependencies.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

New local installations encrypt workspace content by default. To record an explicit choice, run `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (or `--encryption disabled`) in the clone before opening it in the app; later starts keep the saved choice.

Open the **Self-host minddy** step as in the first step above, choose **Use an existing installation**, then **On this computer**, and select the clone root. The app invokes `self-host:local --no-open`, prepares minimal Supabase, applies migrations and Storage configuration, builds when needed and waits for `/api/health` before opening sign-up. The app binds to loopback port 6463, remembers the folder and owns both startup and shutdown. The public installation guide describes the same personal installation.

![Public installation wizard with the local computer profile selected.](/documentation/en/install-locally-wizard.png)

## MCP availability and network access {#mcp-network-access}

MCP is included in self-hosted minddy and starts with the application. It works out of the box at `/api/mcp` on the instance origin configured with `MINDDY_PUBLIC_APP_URL`. OAuth discovery and dynamic client registration are included: you do not need a separate MCP server, a dedicated OAuth application or a minddy Cloud proxy. Connect your MCP client to your instance endpoint, then sign in and grant access through the browser consent flow.

Availability does not guarantee network reachability. Both the MCP client and the browser used for authorization must be able to reach the advertised MCP and OAuth URLs. If you configure an explicit `OAUTH_ISSUER` override, that origin must also be reachable. The client must support the connection, OAuth flow and chosen network path; some clients require HTTPS even on private networks.

This desktop-managed profile listens only on loopback. A compatible MCP client on the same computer can use `http://localhost:6463/api/mcp`; `localhost` and `127.0.0.1` refer to the computer making the connection. Another computer or a hosted/cloud agent cannot reach this profile directly. For LAN/VPN access, use a server installation with a reachable configured origin, for example `http://192.168.1.50`, and allow its application port through the listening address, firewall and routing. Outside that network, the client needs a reachable HTTPS origin such as `https://tickets.example.com`, or another supported network path. Local installation does not automatically provide Internet access.

[Read the MCP network guidance before connecting a remote client](/docs/minddy-mcp#network-access).

## Recover a failed launch {#recover}

The server choice screen is built into the desktop app: it opens without an Internet connection, so a local instance can always be chosen or changed offline.

If an installation step fails, the installation screen marks it and shows the last line its command printed. A failed tool step also offers **Install manually**, which opens that tool’s download page. Fix the cause, for example by accepting Docker Desktop’s prompts, installing the tool yourself or freeing disk space, then click **Try again**. The installation resumes in the same folder; tools already installed and a release already downloaded are not fetched again. **Back** returns to the folder field. **Cancel** under the steps stops a running installation, and so does leaving this screen; closing the window only hides it. To read the complete output of the preparation step, run `pnpm self-host:local -- --no-open --prepare-only` in the installation folder: it prepares Supabase and builds the app, then exits and leaves Supabase running.

Closing a window leaves the desktop application running; use the application’s Quit command to stop it and the local services. Check Docker, CLI availability, free space and whether port 6463 belongs to another process. `pnpm self-host:local` is a terminal troubleshooting fallback. Stop it with Ctrl+C before returning control to the app; the app refuses to claim another process. Quitting the app normally stops Supabase too. The `--keep-backend` option deliberately changes that behavior. Never use `supabase db reset --local` as recovery: it destroys evaluation data. Verify a new account, project, issue and attachment before relying on the instance.
