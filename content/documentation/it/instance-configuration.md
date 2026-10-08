---
{
  "id": "instance-configuration",
  "locale": "it",
  "title": "Configurazione dell’istanza",
  "summary": "Configura origini, segreti e provider opzionali, esponi gli endpoint di rete previsti e mantieni in esecuzione i processi pianificati.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Configurare origini, segreti e funzionalità dell’istanza",
    "Abilitare esplicitamente i provider opzionali",
    "Esporre origini e gestire i job pianificati"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/it/optional-providers-flow.svg",
      "alt": "Schema: Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.",
      "caption": "Questi componenti hanno responsabilità distinte. Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.",
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
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/it/proxy-network-and-jobs-flow.svg",
      "alt": "Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.",
      "caption": "Questi componenti hanno responsabilità distinte. Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.",
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
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

La configurazione dell’istanza definisce origini, segreti, provider opzionali e job pianificati. Questa guida è rivolta all’operatore: conserva i segreti fuori da Git, esponi soltanto gli endpoint previsti e verifica separatamente ogni servizio attivato. Le procedure di manutenzione richiedono di fermare anche job e ingressi che possono scrivere dati.

## Configurare origini, segreti e funzionalità dell’istanza {#instance-configuration}

MINDDY_PUBLIC_APP_URL è un’unica origine assoluta senza percorso o slash finale. In pubblico serve HTTPS; localhost e IPv4 privata affidabile possono usare HTTP. MINDDY_PUBLIC_SUPABASE_URL e MINDDY_PUBLIC_SUPABASE_ANON_KEY devono appartenere allo stesso stack; arrivano al browser. SUPABASE_SERVICE_ROLE_KEY resta solo server ed è obbligatoria in produzione, mai in variabili pubbliche o bundle client. URL database serve agli strumenti, non sostituisce configurazione API.

### Conservare i segreti {#secrets}

L’installer integra GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET e AGENT_RUNNER_SECRET mancanti. La radice ha esattamente 64 caratteri esadecimali. Mantienila fuori PostgreSQL con copia di recupero protetta. Tutto l’ambiente resta 0600 e fuori Git. Non eseguirlo come shell e non stamparlo. Ripetere installazione non ruota segreti; perderli può rendere dati illeggibili. La rotazione deliberata richiede procedura corretta.

### Applicare e controllare una modifica {#capabilities}

MINDDY_PUBLIC_SITE_NAME e MINDDY_PUBLIC_CONTACT_EMAIL identificano l’istanza. ADMIN_EMAILS elenca amministratori separati da virgole, con MFA obbligatoria. OAUTH_ISSUER normalmente resta vuoto salvo OAuth pubblicato intenzionalmente su altra origine stabile. Disattiva IA/fatturazione gestite in self-hosted. Servizi opzionali richiedono configurazione completa. Riavvia o ricrea app dopo modifica valori pubblici runtime, senza rebuild OCI. doctor distingue capacità incomplete da errori del nucleo. Prova link account e callback sull’origine prevista.

## Abilitare esplicitamente i provider opzionali {#optional-providers}

Il nucleo non richiede Stripe, PostHog, un account Cloud o una chiave IA minddy. I servizi esterni aggiungono costi, permessi e destinazioni dei dati: leggi le loro condizioni prima di attivarli. La diagnostica segnala valori mancanti senza scegliere un fallback. Un’istanza self-hosted può usare chiavi personali o endpoint IA locali raggiungibili. Lascia MINDDY_MANAGED_AI e MINDDY_MANAGED_BILLING disattivati; una sola chiave OpenRouter non seleziona l’edizione Cloud.

![Schema: Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.](/documentation/it/optional-providers-flow.svg)

### Configurare i provider completi {#configure}

L’email dell’applicazione richiede EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console non è consentito in produzione; SMTP Auth si configura separatamente. Web Push richiede la coppia VAPID e VAPID_SUBJECT; gli abbonamenti dipendono da quella coppia. Analytics richiede chiave e host PostHog; il tracciamento degli errori richiede MINDDY_PUBLIC_ERROR_TRACKING=1. L’installer propone application-email e web-push, ma le credenziali esterne devono essere fornite dall’operatore. Non usare mittenti minddy o credenziali delle release native su altre istanze.

### Collegare Git ed esecuzione del codice {#git-and-code}

Sono supportati GitHub.com e GitLab.com, non GitHub Enterprise Server o GitLab autogestito. Le connessioni degli utenti possono usare il relay gestito; puoi escluderlo con --no-forge-relay o MINDDY_FORGE_RELAY=0 e configurare app proprie. Le connessioni esistenti mantengono il proprio canale fino alla riconnessione. Il profilo server include il runner Docker fidato. Vercel Sandbox è un’alternativa esplicita che richiede credenziali e MINDDY_DATA_ROOT_KEY valida anche quando la cifratura dei contenuti è disattivata. L’esecuzione desktop locale è stata ritirata. Una configurazione mancante blocca la delega; non esegue il lavoro sul computer dell’utente.


L’immagine pubblicata dell’applicazione include Node.js e Git, ma rimuove intenzionalmente npm, npx e Corepack. Il profilo Compose di riferimento sceglie questa immagine anche per i worker tramite AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Non basta per un nuovo worker di codice: il bootstrap OpenCode usa npm per installare il runtime e il plugin fissati, anche in un repository senza dipendenze di progetto. Senza npm, l’esecuzione si ferma al bootstrap; dalla conversazione non si può dedurre che un file del progetto sia stato modificato o che un test sia riuscito. Usa un’immagine dedicata ai worker, costruita e verificata dall’operatore, con Node.js 24, npm, Git e gli strumenti richiesti dal progetto, sovrascrivendo AGENT_RUNNER_SANDBOX_IMAGE nel servizio runner. Mantieni i vincoli di isolamento. Verifica bootstrap, clonazione, test effettivi e diff risultante prima di abilitare la delega di codice. Correggere i file del runner non fornisce questi strumenti al worker.

## Esporre origini e gestire i job pianificati {#proxy-network-and-jobs}

Un servizio pubblico richiede un proxy TLS e il redirect da HTTP a HTTPS. Le origini minddy e Supabase, i redirect Auth, i callback OAuth e gli header devono concordare. Non esporre PostgreSQL, Studio, porte interne o runner. Nel profilo full il server usa http://kong:8000 internamente, mentre browser e link mantengono l’origine pubblica di Supabase. HTTP privato richiede localhost o una rete IPv4 privata affidabile, senza inoltro delle porte del router.

![Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Runner, database e porte private. Job autenticati; fermi in manutenzione.](/documentation/it/proxy-network-and-jobs-flow.svg)

### Fornire pianificazione autenticata {#schedules}

I profili Compose di riferimento avviano lo scheduler e l’installer genera CRON_SECRET. Un deployment personalizzato dai sorgenti deve fornire uno scheduler HTTP equivalente. Ogni richiesta invia `Authorization: Bearer <CRON_SECRET>`; un valore vuoto o errato restituisce 401. Non registrare questo header. Gli orari del candidato elencati sotto sono in UTC. Usa le route della release installata, perché possono cambiare.


Lo scheduler pubblicato in v0.11.0 non include numo-turns. Quello del candidato è stato corretto per chiamarlo ogni minuto. La tabella descrive il candidato corretto: non presumere che questo job esista in un deployment v0.11.0 invariato.

| Endpoint | Orario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Fermare i job in manutenzione {#maintenance}

Prima di un backup o di una migrazione, ferma scheduler, applicazione, worker e API pubblica. Fermare soltanto il server web lascia possibili scritture dirette. Verifica in manutenzione con ingressi e job chiusi, poi riapri solo dopo i controlli su database, Auth, Storage e applicazione. Se un job non parte, verifica in privato scheduler, origine e segreto. Le routine richiedono il server, non un desktop aperto.
