---
{
  "id": "import-issues",
  "locale": "it",
  "title": "Importare un backlog CSV dopo la verifica",
  "summary": "Controllare colonne, persone, stati e riferimenti padre prima di creare ticket.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/import-issues-preview-workflow.png",
      "alt": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.",
      "caption": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate. L’importazione non è stata inviata; la pianificazione IA facoltativa è stata bloccata per la cattura.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "import-issues-workflow"
  ]
}
---

## Preparare e controllare {#import-issues}

Il proprietario del progetto apre Importazione nelle impostazioni del progetto e seleziona un’esportazione CSV. I formati di Linear e Jira vengono riconosciuti; gli altri CSV usano l’associazione generica delle colonne. Ogni importazione è limitata a 5 MiB e 5.000 ticket. Suddividi intenzionalmente gli archivi più grandi e, quando possibile, mantieni i riferimenti ai ticket padre nello stesso gruppo.

Associa la colonna del titolo prima di importare. Controlla descrizione, stato, priorità, impegno, scadenza, categorie e assegnatari. Associa le persone a membri effettivi del progetto e verifica le nuove categorie. I riferimenti ai padri corrispondono a chiavi esterne nello stesso gruppo e supportano un solo livello. I CSV non importano i byte dei file allegati.

Una proposta IA viene richiesta soltanto per le associazioni mancanti. Puoi modificarla; se il provider non è disponibile o la richiesta fallisce, l’associazione manuale resta utilizzabile. Una correzione manuale impedisce a una proposta tardiva di sovrascrivere le tue scelte.


## Importare e verificare {#result}

Dopo ogni modifica delle associazioni, leggi il numero di ticket, la distribuzione degli stati e gli avvisi. Correggi le righe ignorate o non valide prima di confermare. L’importazione crea nuovi ticket: non presumere che caricare nuovamente il file aggiorni quelli esistenti eliminando i duplicati. Dopo il successo, verifica un campione di ticket, assegnazioni, date e collegamenti ai padri. Se la risposta va persa, controlla il progetto prima di ripetere l’intero file, per evitare lavoro duplicato.

![Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.](/documentation/it/import-issues-preview-workflow.png)
