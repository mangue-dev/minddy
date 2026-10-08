---
{
  "id": "architecture-and-data-flows",
  "locale": "it",
  "title": "Seguire flussi fra applicazione, database e provider",
  "summary": "Next.js fornisce l’interfaccia e le API autorizzate.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "storage-and-attachments",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/it/architecture-and-data-flows-flow.svg",
      "alt": "Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente e runner fidato. Provider opzionali: destinazioni separate.",
      "caption": "Questi componenti hanno responsabilità distinte. Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente e runner fidato. Provider opzionali: destinazioni separate.",
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
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguire flussi fra applicazione, database e provider {#architecture-and-data-flows}

Next.js fornisce l’interfaccia e le API autorizzate. Supabase fornisce PostgreSQL, Auth, Storage e Realtime. PostgreSQL conserva i record dell’applicazione, gli account, i dati di piattaforma e i metadati dei file; Storage conserva i byte. La configurazione protetta contiene chiavi e impostazioni dei provider. I container possono essere ricreati, mentre volumi, byte e chiavi devono persistere. Un ripristino completo riunisce questi elementi allo stesso punto di recupero.

![Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente e runner fidato. Provider opzionali: destinazioni separate.](/documentation/it/architecture-and-data-flows-flow.svg)

## Seguire una richiesta {#requests}

Il browser usa le origini pubbliche di Minddy e Supabase. Auth crea la sessione; il server verifica l’attore e l’oggetto prima di eseguire un’operazione. Realtime propaga gli aggiornamenti. Nel profilo full il server usa Kong sulla rete interna senza cambiare le origini del browser o i link degli account. Lo scheduler invia richieste HTTP autenticate senza un browser. Quando Numo deve lavorare sul codice, il runner fidato crea sandbox ristrette per il repository collegato; le sandbox non ricevono i segreti dell’istanza né il socket Docker.

## Identificare destinazioni esterne {#providers}

IA, email, Git, MCP remoto, notifiche push, analytics e archiviazione esterna sono destinazioni distinte quando vengono abilitate. Ospitare Minddy sul tuo server non rende locali questi servizi. Nel profilo managed il backend è gestito dal provider scelto; full lo pone sotto il tuo controllo. Minddy Cloud gestisce il servizio e i suoi provider, mentre in self-hosted sei tu a configurare account e scelte. Verifica permessi, costi e condizioni di trattamento dei dati. Non dedurre il provider o l’edizione Cloud dal solo hostname o dalla piattaforma di distribuzione.
