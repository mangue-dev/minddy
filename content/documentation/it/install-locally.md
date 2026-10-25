---
{
  "id": "install-locally",
  "locale": "it",
  "title": "Istanze locali",
  "summary": "Installa un’istanza locale privata dall’app desktop o apri un clone preparato, con Node.js 24.22.1 o una 24.x successiva, pnpm 10.28.0, Git, Supabase CLI e Docker attivo.",
  "topic": "Gestire un’istanza",
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
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of install-locally-wizard on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 desktop onboarding and built-in local installer: source review of lib/desktop/local-installer.ts, desktop/src/local-installer.ts, lib/desktop/onboarding-copy.ts, desktop/src/server-picker.ts, desktop/src/main.ts and scripts/self-hosting-local.mjs; installer procedure, labels and --prepare-only documented, manual clone kept as the alternative; automatic installation of missing tools checked against lib/desktop/local-toolchain.ts and desktop/src/local-toolchain.ts (requirement states, tool steps, app-owned toolchain folder, system prompts per platform, Linux sign-out, Install manually); then the server choice moved from a separate window to a screen in the app window: wording, Cancel, leaving the screen and the Internet requirement checked against components/desktop/server-choice.tsx, app/desktop/welcome/page.tsx, lib/desktop/server-choice.ts and desktop/src/main.ts; no browser or desktop walkthrough, no installation run; no screenshot recaptured); then the server choice bundled in the desktop app (offline, first screen), checked against components/desktop/server-choice-entry.tsx and desktop/src/server-choice.ts; then the self-hosted step regrouped into three cards and one existing-installation screen, checked against components/desktop/server-choice.tsx; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, checked against desktop/src/main.ts, components/auth/auth-chrome.tsx and components/desktop/server-choice.tsx; then the installer's account managed by the app: no email, automatic sign-in on the local instance, checked against lib/desktop/local-account.ts, desktop/src/local-account.ts, desktop/src/local-installer.ts, components/desktop/server-choice.tsx and components/auth/desktop-local-sign-in.tsx; no installation run, no screenshot recaptured",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it figure update after the catalog review; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (it translation of the installer and server window rewrite with onboarding window and catalog labels, then automatic tool installation with catalog labels, register checked; equivalent meaning self-reviewed key by key; then window-to-screen wording, Cancel and Internet requirement with catalog labels; then the self-hosted step regrouped into three cards and one existing-installation screen, with catalog labels; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, with catalog labels; then the installer's account managed by the app: no email, automatic sign-in on the local instance, with catalog labels and informal register; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Avviare un’istanza locale dall’app desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/it/install-locally-flow.svg",
      "alt": "Schema: App desktop seleziona il clone. Applicazione loopback: porta 6463. Supabase minimo e dati duraturi. Uscire ferma app e backend.",
      "caption": "L’app desktop controlla avvio e arresto dell’istanza locale; i dati devono restare conservati tra un avvio e l’altro.",
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
            "title": "App desktop seleziona il clone"
          },
          {
            "title": "Applicazione loopback: porta 6463"
          },
          {
            "title": "Supabase minimo e dati duraturi"
          },
          {
            "title": "Uscire ferma app e backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/it/install-locally-wizard.png",
      "alt": "Assistente pubblico di installazione con il profilo per questo computer selezionato.",
      "caption": "Scegli l’installazione personale quando l’applicazione desktop deve gestire i servizi locali.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

## Installare minddy su questo computer {#install-locally}

Un’istanza locale esegue minddy con un Supabase minimo in Docker su un solo computer, per una valutazione o per uso personale. I suoi dati restano su quel computer e l’app desktop ne avvia e arresta i servizi. Usa Git, Node.js 24.22.1 o una versione 24.x successiva, `pnpm` 10.28.0, Supabase CLI e Docker attivo. L’app desktop installa ciò che manca; un clone che prepari tu deve averli già. Servono almeno 4 GB di RAM libera, due core e 10 GB di SSD libero; sono consigliati 8 GB, quattro core e 20 GB. Installa prima l’app desktop firmata dalla pagina download. Windows usa Microsoft Store; macOS e Linux hanno download specifici.

L’app desktop include un programma di installazione che esegue tutta la procedura per te:

1. Apri l’app desktop. Si avvia su minddy Cloud: al primo avvio si apre la sua schermata di registrazione. Fai clic su **Ospita minddy in autonomia**, in fondo alla schermata di accesso o di registrazione. Dopo l’accesso, apri la stessa schermata con **Connect to a Server…** nel menu nativo minddy (il menu nativo è in inglese; su Windows e Linux premi Alt per mostrare la barra dei menu) oppure da **Impostazioni account** → **Preferenze** → **App desktop** → **Server connesso** → **Cambia…**.
2. In **Ospita minddy in autonomia**, scegli **Installa su questo computer**.
3. In **Requisiti**, l’app verifica Git, Node.js 24, pnpm, Supabase CLI e Docker. Uno strumento mancante mostra **Non trovato; verrà installato** e un Node.js meno recente **Trovata la versione …; Node.js 24 verrà installato per minddy**. Un Docker installato ma fermo mostra **Installato ma non avviato; verrà avviato**. Non devi installare nulla prima: ci pensa **Installa**. **Verifica di nuovo** ripete il controllo.
4. Controlla la **Cartella di installazione**. Per impostazione predefinita è una cartella `minddy` nella tua cartella personale; con **Scegli…** puoi selezionarne un’altra. Se la cartella scelta contiene già altri file, l’app installa minddy in una cartella `minddy` al suo interno.
5. Fai clic su **Installa**. L’app non chiede nessuna email: una nota spiega che minddy crea il tuo account su questo computer e ti fa accedere da solo.
6. Tieni aperta la finestra mentre vengono eseguiti i passaggi. Gli strumenti mancanti vengono per primi, ognuno come passaggio a sé: **Installa Git**, **Installa Node.js 24**, **Installa pnpm**, **Installa Supabase CLI**, poi **Installa Docker** o **Avvia Docker**. **Scarica minddy**, seguito dal numero di versione, esegue un `git clone` superficiale della versione usata anche dalla guida pubblica di installazione. **Installa le dipendenze** esegue `pnpm install --frozen-lockfile`, **Configura l’istanza** rende il tuo account locale amministratore dell’istanza, **Prepara Supabase e compila l’app** esegue `pnpm self-host:local -- --no-open --prepare-only` **Avvia minddy** avvia il runtime locale e **Crea il tuo account locale** crea il tuo account sull’istanza. La prima installazione può richiedere alcuni minuti, mentre Docker scarica le immagini di Supabase e l’app viene compilata.
7. Quando minddy è in esecuzione, l’app lo apre con l’accesso già effettuato al tuo account locale.

L’account locale è un account normale, con il nome del tuo account utente del computer e l’indirizzo `owner@local.minddy.app`. Amministra l’istanza, e impostazioni e proprietà dei progetti funzionano come al solito. L’app genera la sua password e la conserva cifrata nel portachiavi del sistema: non la digiti mai e la pagina riceve solo una sessione. Ogni volta che la finestra mostra questa istanza, l’app fa accedere l’account da sola dietro una breve schermata **Apertura del tuo minddy…**. Se reinstalli in una cartella i cui dati Supabase sono stati conservati, l’app ritrova lo stesso account e gli assegna una nuova password; i tuoi dati restano. Vale solo per un’istanza installata dall’app: una cartella aperta con **Usa un’installazione esistente** › **Su questo computer** mantiene i propri account e l’accesso abituale, e i server remoti usano sempre l’accesso abituale.

Node.js, pnpm e Supabase CLI si installano senza diritti di amministratore in una cartella `toolchain` all’interno della cartella dei dati utente dell’app. Node.js proviene dall’archivio ufficiale di nodejs.org, verificato con i checksum SHA-256 pubblicati; pnpm 10.28.0 e Supabase CLI 2.115.0 si installano con npm. Questo Node.js non sostituisce quello già presente nel sistema: l’app lo mette in testa al `PATH` solo per il suo programma di installazione e il runtime locale.

Git e Docker passano dalla conferma del tuo sistema. Su macOS, conferma gli strumenti di sviluppo da riga di comando nella finestra di Apple per ottenere Git. Su Windows, l’app aggiunge MinGit, la versione portatile di Git for Windows, alla stessa cartella dopo averne verificato il digest. Su macOS e Windows, l’app scarica Docker Desktop, verifica che sia firmato da Docker Inc, lo installa e lo apre. macOS può chiedere una password di amministratore; Windows chiede il permesso tramite Controllo account utente e mostra il programma di installazione di Docker. Accetta poi la licenza e le richieste di autorizzazione di Docker Desktop. Su Linux, un’unica richiesta di password del sistema installa Git con il gestore di pacchetti della tua distribuzione e Docker Engine con lo script ufficiale `get.docker.com` di Docker, avvia il servizio Docker e ti aggiunge al gruppo `docker`. Esci e accedi di nuovo perché il tuo account possa usare Docker, poi fai clic su **Riprova**.

L’app ricorda poi la cartella e gestisce avvio e arresto dei servizi locali, come descritto in [Usare un clone preparato](#launch). Come un’installazione manuale, la nuova istanza cifra per impostazione predefinita i contenuti dello spazio di lavoro. Consulta la [crittografia dello spazio di lavoro](/it/documentazione/workspace-encryption#workspace-encryption).

![Schema: App desktop seleziona il clone. Applicazione loopback: porta 6463. Supabase minimo e dati duraturi. Uscire ferma app e backend.](/documentation/it/install-locally-flow.svg)

## Usare un clone preparato {#launch}

Prepara tu il clone se vuoi scegliere la versione o esaminare il repository prima di avviarlo. Usa un clone dedicato e seleziona al suo interno la versione da valutare prima di installare le dipendenze.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

Le nuove installazioni locali cifrano per impostazione predefinita i contenuti dello spazio di lavoro. Per registrare una scelta esplicita, esegui `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (oppure `--encryption disabled`) nel clone prima di aprirlo nell’app; gli avvii successivi mantengono la scelta salvata.

Apri il passaggio **Ospita minddy in autonomia** come nel primo passaggio qui sopra, scegli **Usa un’installazione esistente**, poi **Su questo computer**, e seleziona la radice del clone. L’app esegue `self-host:local --no-open`, prepara Supabase minimo, applica migrazioni e Storage, compila quando necessario e attende `/api/health` prima di aprire la registrazione. Ascolta solo su loopback, porta 6463, ricorda la cartella e gestisce avvio e arresto. La guida pubblica di installazione descrive la stessa installazione personale.

![Assistente pubblico di installazione con il profilo per questo computer selezionato.](/documentation/it/install-locally-wizard.png)

## Disponibilità di MCP e accesso alla rete {#mcp-network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

Questo profilo gestito dall’app desktop ascolta solo sull’interfaccia di loopback. Un client MCP compatibile sullo stesso computer può usare `http://localhost:6463/api/mcp`; `localhost` e `127.0.0.1` indicano il computer che avvia la connessione. Un altro computer o un agente ospitato nel cloud non può raggiungere direttamente questo profilo. Per l’accesso LAN/VPN, usa un’installazione server con un’origine configurata raggiungibile, per esempio `http://192.168.1.50`, e consenti l’accesso alla porta dell’applicazione tramite indirizzo di ascolto, firewall e instradamento. Fuori da quella rete, il client deve avere un’origine HTTPS raggiungibile come `https://tickets.example.com`, o un altro percorso di rete supportato. L’installazione locale non consente automaticamente l’accesso da Internet.

[Leggi la guida all’accesso di rete di MCP prima di collegare un client remoto](/docs/minddy-mcp#network-access).

## Recuperare dopo un errore {#recover}

La schermata di scelta del server è integrata nell’app desktop: si apre senza connessione a Internet, quindi puoi sempre scegliere o cambiare un’istanza locale offline.

Se un passaggio dell’installazione non riesce, la schermata di installazione lo segnala e mostra l’ultima riga stampata dal suo comando. Un passaggio di uno strumento non riuscito offre anche **Installa manualmente**, che apre la pagina di download dello strumento. Correggi la causa, per esempio accettando le richieste di Docker Desktop, installando lo strumento da te o liberando spazio su disco, poi fai clic su **Riprova**. L’installazione riprende nella stessa cartella; gli strumenti già installati e una versione già scaricata non vengono scaricati di nuovo. **Indietro** riporta al campo della cartella. **Annulla**, sotto i passaggi, interrompe un’installazione in corso, come anche uscire da questa schermata; chiudere la finestra la nasconde soltanto. Per leggere l’output completo del passaggio di preparazione, esegui `pnpm self-host:local -- --no-open --prepare-only` nella cartella di installazione: il comando prepara Supabase e compila l’app, poi termina lasciando Supabase in esecuzione.

Chiudere una finestra lascia attiva l’app desktop; usa il comando per uscire dall’applicazione per arrestare anche i servizi locali. Controlla Docker, CLI, spazio e altri processi sulla 6463.

`pnpm self-host:local` è un’alternativa diagnostica da terminale. Fermala con Ctrl+C prima di tornare all’app, che non prende processi altrui. Uscire dall’app arresta normalmente anche Supabase; `--keep-backend` cambia esplicitamente il comportamento.

Non usare `supabase db reset --local` per recuperare: distrugge i dati di valutazione. Verifica nuovo account, progetto, ticket e allegato prima di affidarti all’istanza.
