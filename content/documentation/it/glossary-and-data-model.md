---
{
  "id": "glossary-and-data-model",
  "locale": "it",
  "title": "Glossario e modello dei dati",
  "summary": "Comprendi il ruolo di progetti, ticket, obiettivi, cicli personali, pagine, database e feedback e le loro relazioni.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Comprendere progetti, ticket, obiettivi e lavoro personale"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/it/glossary-and-data-model-flow.svg",
      "alt": "Schema: Progetto: lavoro e conoscenza condivisi. Ticket: lavoro; obiettivo: risultato. Ciclo personale: lavoro fra progetti. Pagina: contesto; feedback: bisogno.",
      "caption": "Il lavoro condiviso del progetto si collega alla pianificazione personale senza uniformare proprietà e permessi.",
      "revision": 3,
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
            "title": "Progetto: lavoro e conoscenza condivisi"
          },
          {
            "title": "Ticket: lavoro; obiettivo: risultato"
          },
          {
            "title": "Ciclo personale: lavoro fra progetti"
          },
          {
            "title": "Pagina: contesto; feedback: bisogno"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Comprendere progetti, ticket, obiettivi e lavoro personale {#glossary-and-data-model}

Un progetto riunisce il lavoro condiviso: membri, ticket, categorie, viste, pagine, integrazioni e feedback. Un ticket descrive un’attività specifica con stato e responsabile; può avere un piano, una scadenza, un obiettivo, categorie, relazioni, commenti e risorse. Un obiettivo raccoglie più ticket per seguire un risultato e il relativo progresso. Il ciclo personale, invece, seleziona il lavoro di una persona per una o due settimane, anche da progetti diversi. Non è uno sprint condiviso né un obiettivo.

![Schema: Progetto: lavoro e conoscenza condivisi. Ticket: lavoro; obiettivo: risultato. Ciclo personale: lavoro fra progetti. Pagina: contesto; feedback: bisogno.](/documentation/it/glossary-and-data-model-flow.svg)

## Distinguere conoscenze e richieste {#knowledge-and-feedback}

Una pagina conserva il contesto che deve durare, per esempio una specifica, una decisione o una procedura operativa. Può contenere sottopagine, file e discussioni. Un database di pagine aggiunge proprietà alle voci, che rimangono pagine complete. Il feedback rappresenta un’esigenza con voti e stato pubblico, distinta dal ticket interno; collegandolo a un ticket, il suo stato pubblico segue automaticamente lo stato di quel lavoro. Una vista filtra e ordina i ticket senza modificarli. Il quaderno conserva note e caselle di controllo private: promuovi una nota a ticket quando il progetto deve seguirla.

## Verificare con un esempio {#example}

Per preparare una release, crea un obiettivo, documenta la decisione in una pagina e collega la pagina ai ticket interessati. Ogni membro può poi aggiungere i propri ticket al ciclo personale. Puoi collegare il feedback al lavoro senza pubblicare la discussione privata. Una routine avvia una nuova conversazione Numo pianificata con istruzioni e contesto; non crea automaticamente un ticket ricorrente e non si attiva a ogni modifica. Conserva gli identificatori e la proprietà degli oggetti: collegare il contesto non uniforma i permessi.
