---
{
  "id": "import-a-database",
  "locale": "it",
  "title": "Importare un database con il contenuto delle sue voci",
  "summary": "Verifica la corrispondenza dello schema e il numero di pagine prima di caricare un database vuoto.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-import-review.png",
      "alt": "Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.",
      "caption": "Controlla le voci analizzate e il numero di colonne prima di importare nel database vuoto.",
      "revision": 2,
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
    "import-a-database-steps"
  ]
}
---

## Scegliere l’importazione {#import-a-database}

Crea un database senza colonne facoltative né voci esistenti. Dal banner del nuovo database, scegli Importa un database esistente. Carica uno ZIP di Notion in formato Markdown & CSV con sottopagine, il CSV di un database oppure un archivio di database Minddy. Se l’archivio contiene più database, seleziona quello da importare.

Prima di confermare, controlla i nomi e i tipi di colonna suggeriti e poi il numero di pagine. Se l’assistenza all’importazione è configurata, Numo può suggerire i tipi da un piccolo campione; puoi comunque impostare la corrispondenza manualmente. Le proprietà di origine non supportate rimangono come testo. I valori incompatibili bloccano l’importazione anziché essere cancellati senza avviso.

## Cosa viene mantenuto e cosa controllare {#database-import-result}

L’importazione include i contenuti delle voci, i documenti annidati e i file locali presenti nell’archivio. Un archivio Minddy mantiene anche lo schema esatto e i colori delle opzioni e rimappa i collegamenti interni a pagine e file. Le persone possono essere associate ai membri del progetto di destinazione. Un’esportazione di Notion non contiene lo schema originale, i colori delle opzioni o le definizioni delle formule: queste informazioni mancanti non possono essere recuperate.

Gli archivi possono contenere al massimo 20 MB compressi, 50 MB estratti e 1.000 pagine. Ogni allegato mantiene il limite di 10 MB previsto per i file delle pagine. La scrittura nel database è transazionale. Riprovare lo stesso tentativo nella finestra ancora aperta mantiene il suo identificativo di richiesta, quindi un tentativo già completato viene restituito senza duplicare le righe. Caricare un altro file o aprire una nuova finestra può creare un tentativo diverso. Se il risultato della rete è incerto, esamina la destinazione prima di ricominciare; un database già popolato non soddisfa più il requisito di una destinazione vuota.

Dopo il completamento, controlla alcune voci, i valori, le pagine annidate e gli allegati. Conserva l’archivio originale finché la verifica non è conclusa. Se l’importazione fallisce, leggi il primo errore e correggi il formato o la corrispondenza prima di riprovare. Non compilare manualmente il database di destinazione presumendo che continui a soddisfare il requisito di essere vuoto.


![Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.](/documentation/it/database-import-review.png)
