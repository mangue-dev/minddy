---
{
  "id": "optional-providers",
  "locale": "it",
  "title": "Abilitare esplicitamente i provider opzionali",
  "summary": "Il nucleo non richiede Stripe, PostHog, un account Cloud o una chiave IA Minddy.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
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
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/it/optional-providers-flow.svg",
      "alt": "Schema: Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.",
      "caption": "Questi componenti hanno responsabilità distinte. Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.",
      "revision": 1,
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
    "optional-providers-flow"
  ]
}
---

## Abilitare esplicitamente i provider opzionali {#optional-providers}

Il nucleo non richiede Stripe, PostHog, un account Cloud o una chiave IA Minddy. I servizi esterni aggiungono costi, permessi e destinazioni dei dati: leggi le loro condizioni prima di attivarli. La diagnostica segnala valori mancanti senza scegliere un fallback. Un’istanza self-hosted può usare chiavi personali o endpoint IA locali raggiungibili. Lascia MINDDY_MANAGED_AI e MINDDY_MANAGED_BILLING disattivati; una sola chiave OpenRouter non seleziona l’edizione Cloud.

![Schema: Operatore sceglie capacità opzionale. Credenziali complete e condizioni. Destinazione dati esterna esplicita. Verificare comportamento e costi.](/documentation/it/optional-providers-flow.svg)

## Configurare i provider completi {#configure}

L’email dell’applicazione richiede EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM e INVITATION_EMAIL_FROM. console non è consentito in produzione; SMTP Auth si configura separatamente. Web Push richiede la coppia VAPID e VAPID_SUBJECT; gli abbonamenti dipendono da quella coppia. Analytics richiede chiave e host PostHog; il tracciamento degli errori richiede MINDDY_PUBLIC_ERROR_TRACKING=1. L’installer propone application-email e web-push, ma le credenziali esterne devono essere fornite dall’operatore. Non usare mittenti Minddy o credenziali delle release native su altre istanze.

## Collegare Git ed esecuzione del codice {#git-and-code}

Sono supportati GitHub.com e GitLab.com, non GitHub Enterprise Server o GitLab autogestito. Le connessioni degli utenti possono usare il relay gestito; puoi escluderlo con --no-forge-relay o MINDDY_FORGE_RELAY=0 e configurare app proprie. Le connessioni esistenti mantengono il proprio canale fino alla riconnessione. Il profilo server include il runner Docker fidato. Vercel Sandbox è un’alternativa esplicita che richiede credenziali e MINDDY_DATA_ROOT_KEY valida anche quando la cifratura dei contenuti è disattivata. L’esecuzione desktop locale è stata ritirata. Una configurazione mancante blocca la delega; non esegue il lavoro sul computer dell’utente.


L’immagine pubblicata dell’applicazione include Node.js e Git, ma rimuove intenzionalmente npm, npx e Corepack. Il profilo Compose di riferimento sceglie questa immagine anche per i worker tramite AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Non basta per un nuovo worker di codice: il bootstrap OpenCode usa npm per installare il runtime e il plugin fissati, anche in un repository senza dipendenze di progetto. Senza npm, l’esecuzione si ferma al bootstrap; dalla conversazione non si può dedurre che un file del progetto sia stato modificato o che un test sia riuscito. Usa un’immagine dedicata ai worker, costruita e verificata dall’operatore, con Node.js 24, npm, Git e gli strumenti richiesti dal progetto, sovrascrivendo AGENT_RUNNER_SANDBOX_IMAGE nel servizio runner. Mantieni i vincoli di isolamento. Verifica bootstrap, clonazione, test effettivi e diff risultante prima di abilitare la delega di codice. Correggere i file del runner non fornisce questi strumenti al worker.
