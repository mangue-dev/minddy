---
{
  "id": "objectives",
  "locale": "it",
  "title": "Obiettivi",
  "summary": "Definisci il risultato di un progetto, collega il lavoro e interpreta avanzamento, dipendenze e slancio.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Seguire un risultato con un obiettivo",
    "Interpretare dipendenze e andamento degli obiettivi"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-objectives.png",
      "alt": "Finestra di creazione obiettivo non inviata con un nome di risultato d’esempio.",
      "caption": "Definisci il risultato prima di scegliere responsabile, data limite e stato. Questa finestra non ha creato un secondo obiettivo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-objective-momentum.png",
      "alt": "Ritmo dell’obiettivo dopo un ticket dimostrativo realmente completato.",
      "caption": "Leggi il ritmo insieme al lavoro collegato. La cronologia disponibile non è ancora sufficiente per mostrare una data stimata di conclusione.",
      "revision": 5,
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
    "objectives-steps",
    "objective-dependencies-and-momentum-steps"
  ]
}
---

Un obiettivo raccoglie i ticket di un progetto per seguire un risultato. Le sue dipendenze spiegano i vincoli, mentre progresso e andamento aiutano a interpretare il lavoro collegato. Questi indicatori non sostituiscono la verifica del risultato né garantiscono una data di consegna.

## Seguire un risultato con un obiettivo {#objectives}

Apri la destinazione degli obiettivi del progetto e crea un obiettivo. Dai un nome al risultato desiderato, aggiungi contesto utile e imposta i campi disponibili per responsabile, data obiettivo, colore e stato. Un obiettivo appartiene a un progetto ed è distinto da un ciclo personale che comprende più progetti. La persona responsabile segue il risultato; sceglierla non trasferisce la proprietà del progetto.

Apri ogni ticket pertinente e scegli l’obiettivo nelle sue proprietà oppure usa i controlli dei ticket dell’obiettivo. Verifica che il lavoro previsto compaia sotto l’obiettivo. Usa discussione e risorse per decisioni e pagine di riferimento che riguardano l’intero risultato.

![Finestra di creazione obiettivo non inviata con un nome di risultato d’esempio.](/documentation/it/reader-objectives.png)

### Leggere il progresso prima di chiudere {#objective-progress}

Esamina i ticket completati e attivi insieme al progresso dell’obiettivo. Un indicatore riassume il lavoro collegato; non può stabilire se un risultato di prodotto sia accettabile. Controlla attività mancanti e lavoro annullato o duplicato prima di segnare l’obiettivo come completato.

Usa il ciclo di vita dell’obiettivo per distinguere risultati pianificati, in corso, completati e annullati. Una data obiettivo è un traguardo, mentre una previsione è una stima basata sull’attività. Se l’obiettivo appare vuoto, controlla l’associazione dei ticket e i filtri della vista invece di ricrearlo. L’eliminazione di un obiettivo usa il cestino recuperabile e non è un normale cambio di stato.

## Interpretare dipendenze e andamento degli obiettivi {#objective-dependencies-and-momentum}

Apri l’obiettivo e le sue relazioni. Controlla quale risultato dipende da un altro e leggi le relazioni di blocco tra ticket quando spiegano il vincolo. L’organizzazione padre-figlio, un collegamento correlato e una dipendenza di blocco rispondono a domande diverse; controlla la direzione prima di cambiare una relazione.

Una relazione di blocco può collegare un ticket o un altro obiettivo a questo obiettivo, all’interno dello stesso progetto. I suoi ticket aperti ereditano il blocco irrisolto: la relazione mostrata identifica sia il prerequisito effettivo sia l’obiettivo che lo trasmette. Non viene salvata una nuova relazione diretta su ogni ticket. Chiudere il prerequisito o l’obiettivo bloccato, oppure rimuovere un ticket da quell’obiettivo, elimina il relativo blocco ereditato. Risolvi il prerequisito effettivo o correggi una relazione superata. Cambiare solo la data obiettivo non completa i ticket che lo bloccano.

### Interpretare il segnale di andamento {#momentum}

L’andamento riassume il lavoro completato di recente. Può essere in accelerazione, costante, in rallentamento o fermo, con stati separati per obiettivi non iniziati, completati e annullati. Usalo per individuare un risultato che richiede attenzione, poi leggi i ticket e l’attività sottostanti.

La data di fine stimata richiede almeno due completamenti, una settimana intera osservata, impegno consegnato positivo e lavoro rimanente. Contribuiscono solo i ticket attualmente collegati; un completamento precedente alla creazione dell’obiettivo non produce un andamento recente artificiale. Con una data obiettivo valida, lo storico va dalla creazione a quella data e il ritmo di consegna usa il tempo osservato dalla creazione, compreso il tempo dopo una scadenza non rispettata. Senza una data obiettivo valida, il calcolo usa uno storico mobile di otto settimane e una finestra di previsione di 28 giorni. Poco storico o un recente cambio di ambito ne riducono l’utilità. La stima non è una scadenza promessa e non comprende il lavoro invisibile che non hai collegato. Confronta data obiettivo, lavoro rimanente e vincoli reali prima di cambiare gli impegni.

![Ritmo dell’obiettivo dopo un ticket dimostrativo realmente completato.](/documentation/it/reader-objective-momentum.png)
