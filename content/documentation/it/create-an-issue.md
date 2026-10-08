---
{
  "id": "create-an-issue",
  "locale": "it",
  "title": "Creare e modificare un ticket",
  "summary": "Descrivi un’attività eseguibile, scegli il progetto e aggiorna le proprietà senza duplicare il lavoro.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/it/new-issue.png",
      "alt": "Bozza non inviata con titolo, descrizione e proprietà selezionabili manualmente.",
      "caption": "Descrivi il risultato atteso e scegli le proprietà utili prima di creare il ticket.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps"
  ]
}
---

## Creare l’attività {#create-an-issue}

Devi essere membro del progetto di destinazione. Apri il progetto e il controllo per creare un ticket. Inserisci un titolo che identifichi il lavoro, poi aggiungi contesto, risultato previsto e vincoli nella descrizione. Scegli il progetto consapevolmente quando crei da una vista personale o tra progetti.

Per creare il ticket manualmente, disattiva Riempimento intelligente se il pulsante è visibile e attivo. Vengono così mostrati i controlli di priorità, impegno, categorie e obiettivo, che puoi impostare tu. La scelta vale per questo ticket; riaprendo il modulo di creazione viene ripristinata la preferenza dell’account. È indipendente dagli interruttori di automazione e Smart Assign del progetto.

Imposta le proprietà utili prima di confermare: stato, priorità, impegno, assegnatario, obiettivo, categorie, scadenza e ricorrenza. L’assegnatario è un membro del progetto; un obiettivo raggruppa ticket intorno a un risultato del progetto. Puoi lasciare vuote le proprietà opzionali anziché indovinarle. La priorità va da nessuna a bassa, media, alta e urgente; l’impegno usa XS, S, M, L e XL.

Conferma la creazione e apri il nuovo ticket. Controlla identificativo e progetto. Riapri i selettori delle proprietà per cambiare i valori quando l’attività diventa più chiara. La descrizione spiega il lavoro; il piano di implementazione si mantiene separatamente nella scheda del piano.


![Bozza non inviata con titolo, descrizione e proprietà selezionabili manualmente.](/documentation/it/new-issue.png)

## Verificare salvataggio e visibilità {#issue-save}

Dopo aver cambiato una proprietà, verifica il valore visualizzato. I filtri possono rimuovere subito un ticket dalla vista attuale quando cambiano assegnatario, stato o categoria. Cerca il suo identificativo o apri il progetto senza quei filtri prima di creare un sostituto.

Se la creazione o il salvataggio falliscono, conserva il testo, leggi l’errore e controlla che appartenenza e destinazione esistano ancora. Prima di riprovare dopo un errore di rete, verifica se il ticket sia già stato creato. Collega le pagine del progetto come risorse aggiornate quando serve il loro contenuto attuale e usa i commenti per discutere l’attività.
