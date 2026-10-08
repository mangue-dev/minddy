---
{
  "id": "database-cells-and-entries",
  "locale": "it",
  "title": "Modificare valori e pagine delle voci di database",
  "summary": "Salva celle, seleziona righe ed espandi una voce conservando le modifiche in attesa.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-entry.png",
      "alt": "Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.",
      "caption": "Apri una voce per leggere il testo completo e modificare i valori in base al tipo.",
      "revision": 1,
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
    "database-cells-and-entries-steps"
  ]
}
---

## Modificare un valore {#database-cells-and-entries}

Fai clic su una cella della tabella o sulla proprietà sopra il corpo di una voce. Enter salva, Escape annulla e Shift+Enter inserisce una riga di testo. Uscire dall’editor salva. Un numero non valido mantiene l’editor aperto finché non viene corretto; un salvataggio non riuscito ripristina il valore e segnala un errore.

Usa una cella Selezione per un’opzione o Selezione multipla per diverse opzioni. Cerca quelle esistenti o creane una dal menu. Apri «Modifica opzioni» per rinominare o cambiare colori, poi salva tutto insieme o annulla. Data, Persone e Casella di controllo usano i controlli corrispondenti; Data di creazione resta in sola lettura.

## Aprire, selezionare e inserire voci {#entry-actions}

Apri una voce per modificarne la pagina completa in un pannello flottante. «Espandi» la apre come pagina completa dopo la fine dei salvataggi del documento in attesa. Se il salvataggio fallisce, il pannello resta aperto per risolverlo. Una voce vuota resta nel database finché non viene eliminata.

Usa le caselle delle righe per selezionare e Shift-clic per un intervallo. La maniglia apre le azioni e può riordinare le voci in ordine manuale. Il + nel margine inserisce sotto una voce; Option/Alt inserisce sopra. L’inserimento adiacente torna all’ordine manuale e rimuove i filtri per rendere visibile la nuova voce.

## Preferenze di visualizzazione {#database-display}

Cerca, filtra, ordina e nascondi colonne nell’unica vista elenco. Queste preferenze vengono ricordate sul dispositivo; l’ordine manuale è condiviso con l’albero delle pagine. Scorri orizzontalmente con un gesto del trackpad, Shift e rotella del mouse, tocco o barra inferiore. Un’anteprima tagliata non accorcia il testo salvato. Le voci con valori di colonne si possono riordinare nel proprio database, ma non spostare fuori.


![Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.](/documentation/it/database-entry.png)
