---
{
  "id": "page-files",
  "locale": "it",
  "title": "Allegare e recuperare file delle pagine",
  "summary": "Carica un file, verifica l’accesso e comprendi cosa rende leggibile la pubblicazione.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
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
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-file-states.png",
      "alt": "Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.",
      "caption": "Controlla lo stato effettivo del file: il secondo allegato è disponibile, il primo caricamento incompleto no.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-files-steps"
  ]
}
---

## Caricare e controllare un file {#page-files}

Apri la pagina come membro del progetto e usa i controlli di allegato o caricamento. Seleziona un file non vuoto entro il limite di 10 MB per file. La quota di spazio dell’account o dell’istanza può imporre un limite aggiuntivo. Mantieni l’originale fino alla riuscita del caricamento.

Le immagini possono essere inserite come blocchi immagine e gli altri documenti allegati come blocchi file. Il server determina il tipo di contenuto salvato dai byte, senza fidarsi del nome del file o dell’etichetta del browser. L’accettazione del caricamento non garantisce un’anteprima nella pagina per ogni formato; scarica il file quando l’anteprima non è disponibile.

Verifica che il file compaia nella pagina e aprilo o scaricalo. I dati del file risiedono in Storage, mentre i metadati di pagina e file ne determinano l’accesso. Un salvataggio riuscito della pagina non dimostra da solo che i dati del file siano disponibili.

## File condivisi ed errori {#file-access}

Un file citato su una pagina pubblicata può essere reso disponibile ai suoi visitatori. I file di pagine fuori dal ramo pubblicato non diventano disponibili solo perché un’altra pagina li cita. Controlla la pagina e i discendenti inclusi prima di condividere.

Se il caricamento fallisce, controlla dimensione, quota e messaggio di errore. Un operatore di istanza autonoma deve anche verificare configurazione e policy di Storage. Se manca un file dopo un ripristino, recupera i corrispondenti dati di Storage e metadati; un ripristino del solo database non può ricrearlo. Gli URL dei file pubblicati vengono firmati per un massimo di 24 ore al momento del rendering della pagina. Revocare una condivisione interrompe le nuove visite autorizzate alla pagina, ma non invalida immediatamente gli URL dei file già forniti; possono restare utilizzabili fino alla scadenza. Le copie scaricate non possono essere ritirate.


![Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.](/documentation/it/page-file-states.png)
