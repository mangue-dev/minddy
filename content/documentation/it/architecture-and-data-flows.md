---
{
  "id": "architecture-and-data-flows",
  "locale": "it",
  "title": "Architettura e flussi di dati",
  "summary": "Segui richieste e dati tra minddy, Supabase, scheduler, sandbox e provider esterni, distinguendo servizi persistenti e destinazioni dei dati.",
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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/server/capabilities.ts",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Seguire flussi fra applicazione, database e provider"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/it/architecture-and-data-flows-flow.svg",
      "alt": "Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente e runner fidato. Provider opzionali: destinazioni separate.",
      "caption": "L’applicazione coordina i servizi interni e usa i provider esterni quando sono configurati.",
      "revision": 4,
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
            "title": "Browser e applicazione autenticata"
          },
          {
            "title": "Supabase: PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Scheduler indipendente e runner fidato"
          },
          {
            "title": "Provider opzionali: destinazioni separate"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguire flussi fra applicazione, database e provider {#architecture-and-data-flows}

`Next.js` fornisce l’interfaccia e le API autorizzate. Supabase fornisce PostgreSQL, Auth, Storage e Realtime. PostgreSQL conserva i record dell’applicazione, gli account, i dati di piattaforma e i metadati dei file; Storage conserva i byte. La configurazione protetta contiene chiavi e impostazioni dei provider. I container possono essere ricreati, mentre volumi, byte e chiavi devono persistere. Un ripristino completo riunisce questi elementi allo stesso punto di recupero.

![Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente e runner fidato. Provider opzionali: destinazioni separate.](/documentation/it/architecture-and-data-flows-flow.svg)

## Seguire una richiesta {#requests}

Il browser usa le origini pubbliche di minddy e Supabase. Auth crea la sessione; il server verifica l’attore e l’oggetto prima di eseguire un’operazione. Realtime propaga gli aggiornamenti. Nel profilo full il server usa Kong sulla rete interna senza cambiare le origini del browser o i link degli account. Lo scheduler invia richieste HTTP autenticate senza un browser. Quando Numo deve lavorare sul codice, il runner fidato crea sandbox ristrette per il repository collegato; le sandbox non ricevono i segreti dell’istanza né il socket Docker.

## Identificare destinazioni esterne {#providers}

IA, email, Git, MCP remoto, notifiche push, analytics e archiviazione esterna sono destinazioni distinte quando vengono abilitate. Ospitare minddy sul tuo server non rende locali questi servizi. Nel profilo managed il backend è gestito dal provider scelto; full lo pone sotto il tuo controllo. minddy Cloud gestisce il servizio e i suoi provider, mentre in self-hosted sei tu a configurare account e scelte. Verifica permessi, costi e condizioni di trattamento dei dati. Non dedurre il provider o l’edizione Cloud dal solo hostname o dalla piattaforma di distribuzione.
