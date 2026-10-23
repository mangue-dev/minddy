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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
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
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
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
      "alt": "Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente per i job in background. Provider opzionali: destinazioni separate.",
      "caption": "L’applicazione coordina i servizi interni e usa i provider esterni quando sono configurati.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Scheduler indipendente per i job in background"
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

![Schema: Browser e applicazione autenticata. Supabase: PostgreSQL, Auth, Storage, Realtime. Scheduler indipendente per i job in background. Provider opzionali: destinazioni separate.](/documentation/it/architecture-and-data-flows-flow.svg)

## Seguire una richiesta {#requests}

Il browser usa le origini pubbliche di minddy e Supabase. Auth crea la sessione; il server verifica l’attore e l’oggetto prima di eseguire un’operazione. Realtime propaga gli aggiornamenti. Nel profilo full il server usa il gateway API sulla rete interna senza cambiare le origini del browser o i link degli account. Lo scheduler invia richieste HTTP autenticate senza un browser.

## Identificare destinazioni esterne {#providers}

IA, email, Git, MCP remoto, notifiche push, analytics e archiviazione esterna sono destinazioni distinte quando vengono abilitate. Ospitare minddy sul tuo server non rende locali questi servizi. Nel profilo managed il backend è gestito dal provider scelto; full lo pone sotto il tuo controllo. minddy Cloud gestisce il servizio e i suoi provider, mentre in self-hosted sei tu a configurare account e scelte. Verifica permessi, costi e condizioni di trattamento dei dati. Non dedurre il provider o l’edizione Cloud dal solo hostname o dalla piattaforma di distribuzione.
