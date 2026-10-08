---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "it",
  "title": "Interpretare dipendenze e andamento degli obiettivi",
  "summary": "Leggi blocchi e segnali di attività senza trattare le stime come garanzie di consegna.",
  "topic": "Progetti e ticket",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-objective-momentum.png",
      "alt": "Ritmo dell’obiettivo dopo un ticket dimostrativo realmente completato.",
      "caption": "Leggi il ritmo insieme al lavoro collegato. La cronologia disponibile non è ancora sufficiente per mostrare una data stimata di conclusione.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Esaminare relazioni e blocchi {#objective-dependencies-and-momentum}

Apri l’obiettivo e le sue relazioni. Controlla quale risultato dipende da un altro e leggi le relazioni di blocco tra ticket quando spiegano il vincolo. L’organizzazione padre-figlio, un collegamento correlato e una dipendenza di blocco rispondono a domande diverse; controlla la direzione prima di cambiare una relazione.

Una relazione di blocco può collegare un ticket o un altro obiettivo a questo obiettivo, all’interno dello stesso progetto. I suoi ticket aperti ereditano il blocco irrisolto: la relazione mostrata identifica sia il prerequisito effettivo sia l’obiettivo che lo trasmette. Non viene salvata una nuova relazione diretta su ogni ticket. Chiudere il prerequisito o l’obiettivo bloccato, oppure rimuovere un ticket da quell’obiettivo, elimina il relativo blocco ereditato. Risolvi il prerequisito effettivo o correggi una relazione superata. Cambiare solo la data obiettivo non completa i ticket che lo bloccano.

## Interpretare il segnale di andamento {#momentum}

L’andamento riassume il lavoro completato di recente. Può essere in accelerazione, costante, in rallentamento o fermo, con stati separati per obiettivi non iniziati, completati e annullati. Usalo per individuare un risultato che richiede attenzione, poi leggi i ticket e l’attività sottostanti.

La data di fine stimata richiede almeno due completamenti, una settimana intera osservata, impegno consegnato positivo e lavoro rimanente. Contribuiscono solo i ticket attualmente collegati; un completamento precedente alla creazione dell’obiettivo non produce un andamento recente artificiale. Con una data obiettivo valida, lo storico va dalla creazione a quella data e il ritmo di consegna usa il tempo osservato dalla creazione, compreso il tempo dopo una scadenza non rispettata. Senza una data obiettivo valida, il calcolo usa uno storico mobile di otto settimane e una finestra di previsione di 28 giorni. Poco storico o un recente cambio di ambito ne riducono l’utilità. La stima non è una scadenza promessa e non comprende il lavoro invisibile che non hai collegato. Confronta data obiettivo, lavoro rimanente e vincoli reali prima di cambiare gli impegni.

![Ritmo dell’obiettivo dopo un ticket dimostrativo realmente completato.](/documentation/it/reader-objective-momentum.png)
