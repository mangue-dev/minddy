---
{
  "id": "personal-statistics",
  "locale": "it",
  "title": "Statistiche personali",
  "summary": "Confronta attività completata e misure di tempo entro il loro ambito effettivo.",
  "topic": "Pianificare e trovare lavoro",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Leggere le statistiche personali di lavoro"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-statistics.png",
      "alt": "Statistiche personali con griglia annuale, ripartizioni, ritmo di lavoro e totali complessivi.",
      "caption": "Questo account dimostrativo ha un ticket completato e undici creati. Le statistiche mostrate sono reali; i nomi del progetto e dell’obiettivo sono stati tradotti per l’illustrazione.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1892,
        1996
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Aprire e leggere le statistiche {#personal-statistics}

Apri Statistiche dalla navigazione del tuo account. Consulta la griglia annuale delle attività, le suddivisioni per progetto, categoria e obiettivo, la sezione sul ritmo e i totali complessivi. La pagina mostra i periodi configurati; non offre un filtro delle date per scegliere un altro intervallo. Riepiloga il tuo lavoro senza creare una classifica del rendimento degli altri membri.

Usa il numero di ticket completati, il ritmo, i giorni attivi, le serie e le misurazioni del tempo per esaminare la tua attività. La griglia delle attività conta gli eventi di completamento dei ticket e delle attività del taccuino, raggruppati per giorni di calendario nel tuo fuso orario. Un giorno attivo ha almeno uno di questi eventi; la serie attuale tollera che oggi sia ancora vuoto, ma termina al successivo giorno vuoto. I totali complessivi dei ticket completati contano una sola volta ciascun identificativo, quindi il numero di eventi e il totale di ticket distinti rispondono a domande diverse.

Il tempo per impegno è la mediana del tempo trascorso dal primo passaggio registrato di un ticket a In corso fino al completamento. Si considerano ticket idonei nello stato Fatto, assegnati a te, con un impegno ed entrambi i timestamp. Comprende il tempo di attesa; non è un cronometro delle ore lavorate. La vista della quantità mostra la dimensione del campione utilizzato. Una mediana assente può indicare che non ci sono misurazioni idonee, non una durata pari a zero. Prima di confrontare i valori, leggi l'unità e il periodo indicati in ogni sezione.

## Interpretare dati scarsi o cambiamenti {#statistics-limits}

Un periodo vuoto può indicare che non c'è lavoro completato corrispondente oppure che l'attività è insufficiente. Non dimostra che l'account non abbia ticket. Cambiamenti nelle etichette di impegno, nell'ambito o nel tipo di lavoro possono modificare il confronto senza dimostrare che sei diventato più veloce o più lento.

Numo può leggere le tue statistiche con strumenti di sola lettura e spiegare gli stessi numeri. Anche l'accesso all'utilizzo del piano e alle esecuzioni recenti è di sola lettura: riferire il tuo budget non lo modifica. Per un problema di costi dell'IA, apri le schermate di utilizzo e le impostazioni dell'account invece di cambiare l'impegno di un ticket per nascondere la misurazione.


![Statistiche personali con griglia annuale, ripartizioni, ritmo di lavoro e totali complessivi.](/documentation/it/reader-statistics.png)
