---
{
  "id": "change-a-database-schema",
  "locale": "it",
  "title": "Modificare lo schema di un database in sicurezza",
  "summary": "Rinomina, riordina o converti le colonne e verifica l’eventuale perdita di valori.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
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
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-conversion-warning.png",
      "alt": "Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.",
      "caption": "Controlla il numero effettivo di celle incompatibili prima di confermare. Annulla conserva i valori attuali.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Modificare la disposizione o le opzioni {#change-a-database-schema}

In Colonne, usa il controllo con l’occhio per mostrare o nascondere le proprietà. Fai clic su un’intestazione per rinominarla oppure trascina le intestazioni per riordinarle. La colonna con il nome della voce rimane per prima. Puoi modificare le opzioni di Selezione o Selezione multipla dal menu della cella o da Colonne; nomi e colori vengono salvati insieme.

Nascondere una colonna cambia le preferenze di visualizzazione e mantiene i valori. Eliminare una colonna personalizzata rimuove invece i suoi valori da tutte le voci e non può essere annullato. Considera questa conseguenza prima di confermare l’eliminazione.

## Convertire il tipo di una proprietà {#convert-column}

Scegli Modifica colonna per una proprietà personalizzata e seleziona il nuovo tipo. La finestra converte i valori esistenti al salvataggio. Se alcuni valori non sono compatibili, l’avviso indica quante celle verranno svuotate. Prosegui solo se accetti di perdere quei valori, oppure annulla per mantenere il tipo precedente e tutti i valori.

Il passaggio a Data di creazione usa la data di creazione originale di ogni voce e mostra un avviso prima di sostituire i valori esistenti. Dopo la conversione, controlla alcune voci rappresentative, soprattutto quando un numero, una selezione o una data potrebbero essere interpretati diversamente.

Le modifiche allo schema eseguite da un agente usano la revisione attuale del database e un token per l’anteprima della conversione. Le modifiche simultanee invalidano l’anteprima. Rileggi lo stato attuale e genera una nuova anteprima invece di forzare una conversione obsoleta. Per svuotare i valori incompatibili serve una conferma esplicita.


![Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.](/documentation/it/database-conversion-warning.png)
