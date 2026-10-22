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
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-750 Smart Fill re-evaluation schedule",
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
      "deploy/self-hosted/scheduler.mjs",
      "app/api/cron/issue-index/route.ts",
      "app/api/cron/smart-fill-reevaluation/route.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min750 (schedule table and release delta sentence checked against vercel.json and deploy/self-hosted/scheduler.mjs after adding smart-fill-reevaluation; rest of the article unchanged since the 0.20.0 release review; no screenshot in scope); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min750 (it table row and release delta sentence; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Prima di attivare un’integrazione, verifica le credenziali, le condizioni e la destinazione dei dati.",
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
            "title": "Operatore sceglie capacità opzionale"
          },
          {
            "title": "Credenziali complete e condizioni"
          },
          {
            "title": "Destinazione dati esterna esplicita"
          },
          {
            "title": "Verificare comportamento e costi"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/it/proxy-network-and-jobs-flow.svg",
      "alt": "Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Database e porte interne private. Job autenticati; fermi in manutenzione.",
      "caption": "Il proxy espone le origini pubbliche e mantiene privati i servizi interni; durante la manutenzione ferma anche i job.",
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
            "title": "Proxy HTTPS pubblico"
          },
          {
            "title": "Origini app e Supabase pubbliche"
          },
          {
            "title": "Database e porte interne private"
          },
          {
            "title": "Job autenticati; fermi in manutenzione"
          }
        ]
      }
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

`MINDDY_PUBLIC_APP_URL` è un’unica origine assoluta senza percorso o slash finale. In pubblico serve HTTPS; `localhost` e IPv4 privata affidabile possono usare HTTP. `MINDDY_PUBLIC_SUPABASE_URL` e `MINDDY_PUBLIC_SUPABASE_ANON_KEY` devono appartenere allo stesso stack; arrivano al browser. `SUPABASE_SERVICE_ROLE_KEY` resta solo server ed è obbligatoria in produzione, mai in variabili pubbliche o bundle client. URL database serve agli strumenti, non sostituisce configurazione API.

### Conservare i segreti {#secrets}

L’installer integra `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY`, e `CRON_SECRET` mancanti. La radice ha esattamente 64 caratteri esadecimali. Mantienila fuori PostgreSQL con copia di recupero protetta. Tutto l’ambiente resta `0600` e fuori Git. Non eseguirlo come shell e non stamparlo. Ripetere installazione non ruota segreti; perderli può rendere dati illeggibili. La rotazione deliberata richiede procedura corretta.

### Applicare e controllare una modifica {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` e `MINDDY_PUBLIC_CONTACT_EMAIL` identificano l’istanza. `ADMIN_EMAILS` elenca amministratori separati da virgole, con MFA obbligatoria. `OAUTH_ISSUER` normalmente resta vuoto salvo OAuth pubblicato intenzionalmente su altra origine stabile. Disattiva IA/fatturazione gestite in self-hosted. Servizi opzionali richiedono configurazione completa. Riavvia o ricrea app dopo modifica valori pubblici runtime, senza rebuild OCI. doctor distingue capacità incomplete da errori del nucleo. Prova link account e callback sull’origine prevista.

### Configurare feedback e segnalazioni sulla documentazione {#product-feedback}

Imposta `MINDDY_FEEDBACK_KEY` su una chiave di integrazione feedback per attivare l’invio di feedback nell’app. Per le segnalazioni sulla documentazione, crea un’integrazione feedback separata nel progetto destinatario, scegli Documentation come obiettivo predefinito e salva la chiave in `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Entrambe le chiavi restano sul server. Gli invii usano `/api/v1/feedback` sull’origine definita da `MINDDY_PUBLIC_APP_URL`. Riavvia l’applicazione dopo aver modificato questi valori.

Per segnalare un errore da un articolo è necessario aver effettuato l’accesso. Dopo l’accesso, il lettore torna allo stesso articolo con il dialogo di feedback aperto. Il titolo e la descrizione sono inizialmente vuoti. Dopo l’invio, il server aggiunge l’identificativo dell’articolo, la lingua, la revisione e l’URL pubblico; questi dati non sono campi modificabili del modulo. L’integrazione della documentazione collega automaticamente il feedback all’obiettivo selezionato. Senza `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, il pulsante per segnalare errori è disabilitato e mostra una spiegazione.

## Abilitare esplicitamente i provider opzionali {#optional-providers}

Il nucleo non richiede Stripe, PostHog, un account Cloud o una chiave IA minddy. I servizi esterni aggiungono costi, permessi e destinazioni dei dati: leggi le loro condizioni prima di attivarli. La diagnostica segnala valori mancanti senza scegliere un fallback. Un’istanza self-hosted può usare chiavi personali o endpoint IA locali raggiungibili. Lascia `MINDDY_MANAGED_AI` e `MINDDY_MANAGED_BILLING` disattivati; una sola chiave OpenRouter non seleziona l’edizione Cloud.

![Schema: Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.](/documentation/it/optional-providers-flow.svg)

### Configurare i provider completi {#configure}

L’email dell’applicazione richiede `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` e `INVITATION_EMAIL_FROM`. `console` non è consentito in produzione; SMTP Auth si configura separatamente. Web Push richiede la coppia VAPID e `VAPID_SUBJECT`; gli abbonamenti dipendono da quella coppia. Analytics richiede chiave e host PostHog; il tracciamento degli errori richiede `MINDDY_PUBLIC_ERROR_TRACKING=1`. L’installer propone `application-email` e `web-push`, ma le credenziali esterne devono essere fornite dall’operatore. Non usare mittenti minddy o credenziali delle release native su altre istanze.

### Collegare Git ed esecuzione del codice {#git-and-code}

Sono supportati GitHub.com e GitLab.com, non GitHub Enterprise Server o GitLab autogestito. Le connessioni degli utenti possono usare il relay gestito; puoi escluderlo con `--no-forge-relay` o `MINDDY_FORGE_RELAY=0` e configurare app proprie. Le connessioni esistenti mantengono il proprio canale fino alla riconnessione. Numo non esegue codice, quindi il server di riferimento non richiede alcun runner di codice né sandbox, e nessun servizio riceve il socket Docker. Le impostazioni lasciate da una release precedente, come `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` e le credenziali di Vercel Sandbox, vengono ignorate; rimuovile dall’ambiente protetto.

## Esporre origini e gestire i job pianificati {#proxy-network-and-jobs}

Un servizio pubblico richiede un proxy TLS e il redirect da HTTP a HTTPS. Le origini minddy e Supabase, i redirect Auth, i callback OAuth e gli header devono concordare. Non esporre PostgreSQL, Studio o porte interne. Nel profilo full il server usa `http://kong:8000` internamente, mentre browser e link mantengono l’origine pubblica di Supabase. HTTP privato richiede `localhost` o una rete IPv4 privata affidabile, senza inoltro delle porte del router.

![Schema: Proxy HTTPS pubblico. Origini app e Supabase pubbliche. Database e porte interne private. Job autenticati; fermi in manutenzione.](/documentation/it/proxy-network-and-jobs-flow.svg)

### Fornire pianificazione autenticata {#schedules}

I profili Compose di riferimento avviano lo scheduler e l’installer genera `CRON_SECRET`. Un deployment personalizzato dai sorgenti deve fornire uno scheduler HTTP equivalente. Ogni richiesta invia `Authorization: Bearer <CRON_SECRET>`; un valore vuoto o errato restituisce 401. Non registrare questo header. Gli orari elencati sotto sono in UTC e appartengono a questa release. Usa le route della release installata, perché possono cambiare.


Rispetto allo scheduler di v0.11.0, questa release aggiunge `numo-turns`, `forge-relay-maintenance`, `page-materialization`, `issue-index` e `smart-fill-reevaluation` e non chiama più `/api/cron/agent-drain` né `/api/cron/automations`, rimossi insieme al lavoro sul codice di Numo e alle automazioni di progetto. Uno scheduler personalizzato copiato da v0.11.0 va aggiornato secondo questa tabella.

| Endpoint | Orario (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/smart-fill-reevaluation` | `* * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Fermare i job in manutenzione {#maintenance}

Prima di un backup o di una migrazione, ferma scheduler, applicazione, worker e API pubblica. Fermare soltanto il server web lascia possibili scritture dirette. Verifica in manutenzione con ingressi e job chiusi, poi riapri solo dopo i controlli su database, Auth, Storage e applicazione. Se un job non parte, verifica in privato scheduler, origine e segreto. Le routine richiedono il server, non un desktop aperto.
