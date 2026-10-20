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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 5,
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

Un progetto riunisce il lavoro condiviso: membri, ticket, categorie, viste, pagine, integrazioni e feedback. Ogni persona al suo interno ha un ruolo: un proprietario, membri che lavorano sui contenuti e lettori che li seguono. Un ticket descrive un’attività specifica con stato e responsabile; può avere un piano, una scadenza, un obiettivo, categorie, relazioni, commenti e risorse. Un obiettivo raccoglie più ticket per seguire un risultato e il relativo progresso. Il ciclo personale, invece, seleziona il lavoro di una persona per una o due settimane, anche da progetti diversi. Non è uno sprint condiviso né un obiettivo.

![Schema: Progetto: lavoro e conoscenza condivisi. Ticket: lavoro; obiettivo: risultato. Ciclo personale: lavoro fra progetti. Pagina: contesto; feedback: bisogno.](/documentation/it/glossary-and-data-model-flow.svg)

## Distinguere conoscenze e richieste {#knowledge-and-feedback}

Una pagina conserva il contesto che deve durare, per esempio una specifica, una decisione o una procedura operativa. Può contenere sottopagine, file e discussioni. Un database di pagine aggiunge proprietà alle voci, che rimangono pagine complete. Il feedback rappresenta un’esigenza con voti e stato pubblico, distinta dal ticket interno; collegandolo a un ticket, il suo stato pubblico segue automaticamente lo stato di quel lavoro. Una vista filtra e ordina i ticket senza modificarli. Il quaderno conserva note e caselle di controllo private: promuovi una nota a ticket quando il progetto deve seguirla.

## Verificare con un esempio {#example}

Per preparare una release, crea un obiettivo, documenta la decisione in una pagina e collega la pagina ai ticket interessati. Ogni membro può poi aggiungere i propri ticket al ciclo personale. Puoi collegare il feedback al lavoro senza pubblicare la discussione privata. Una routine avvia una nuova conversazione Numo con il contesto del progetto secondo una pianificazione o quando un evento scelto soddisfa le sue condizioni, per esempio un ticket che entra in uno stato o una nuova voce di database; non è un ticket ricorrente e non modifica il codice del repository. Conserva gli identificatori e la proprietà degli oggetti: collegare il contesto non uniforma i permessi.
