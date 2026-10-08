---
{
  "id": "import-export-and-print-pages",
  "locale": "it",
  "title": "Importare, esportare o stampare una pagina",
  "summary": "Scegli il formato di uscita e verifica contenuto, gerarchia e allegati.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-export.png",
      "alt": "Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.",
      "caption": "Scegli Markdown per scaricare il documento oppure Stampa / PDF per aprire la vista di stampa.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Scegliere l’operazione sul documento {#import-export-and-print-pages}

Apri il menu del documento della pagina e scegli Esporta. Seleziona Markdown per una pagina (.md) o un ramo (.zip), PDF per aprire la vista di stampa oppure l’archivio di database se la pagina è un database. Controlla l’ambito proposto prima di confermare: una pagina, il suo ramo e un archivio di database contengono elementi diversi.

Apri l’esportazione e verifica i titoli, i riquadri di avviso, i collegamenti e gli allegati necessari al lettore. L’azione PDF apre una vista di stampa leggibile senza tutta la navigazione dell’applicazione. Usa i controlli di stampa del browser per stampare o salvare un PDF. Nel menu del documento non c’è un’azione di importazione generica. Le importazioni supportate si avviano da un database vuoto, come descritto nella guida all’importazione dei database.


![Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.](/documentation/it/page-export.png)

## Archivi di database e limiti {#export-fidelity}

Un archivio di database (.zip) include il suo ramo: Markdown e CSV, lo schema esatto e i colori delle opzioni, valori, contenuti, date e orari, pagine annidate e contenuti dei file. Importalo in un database nuovo e vuoto per ripristinare questa struttura. I filtri, l’ordinamento e le preferenze per le colonne nascoste specifici del dispositivo rimangono sul dispositivo originale.

Un’esportazione non trasferisce password, credenziali dei provider di account o abbonamenti. Per spostare il lavoro di un account tra istanze, usa la guida al trasferimento dei dati dell’account. Se un formato importato non può mantenere un blocco o una proprietà esterna, controlla il risultato prima di usarlo come sostituto. Non eliminare l’originale solo perché è stato creato un file da scaricare.
