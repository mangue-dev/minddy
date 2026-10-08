---
{
  "id": "create-and-organize-pages",
  "locale": "it",
  "title": "Costruire una wiki di progetto",
  "summary": "Crea pagine e sottopagine, organizza la gerarchia e metti in evidenza i preferiti condivisi.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
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
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-create-menu.png",
      "alt": "Menu di creazione con Nuova pagina e Nuovo database.",
      "caption": "Usa i controlli delle pagine del progetto per scegliere un documento o un database.",
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
    "create-and-organize-pages-steps"
  ]
}
---

## Creare e organizzare pagine {#create-and-organize-pages}

Apri Pagine in un progetto di cui sei membro. Usa il menu + e scegli una pagina per un documento o un database per un elenco strutturato. Dai alla pagina un titolo utile e scrivi la specifica, decisione o procedura che deve conservare.

Crea sottopagine per documenti correlati e usa i controlli dell’albero per spostarle o riordinarle. Una pagina non può diventare discendente di sé stessa. Duplicare una pagina crea nuovi contenuti, non un riferimento aggiornato all’originale. Controlla il ramo duplicato prima di modificarlo o condividerlo.

## Preferiti ed eliminazione {#page-tree}

Segna una pagina come preferita per mostrarla in cima all’albero del progetto. Questi preferiti sono condivisi nel progetto, diversamente da una nota privata del taccuino. Collega una pagina a un ticket quando il documento attuale è il contesto dell’attività; il titolo della risorsa segue le rinominazioni della pagina.

L’eliminazione sposta nel cestino le pagine per cui è previsto il recupero. Controlla il ramo selezionato prima di eliminare e usa il recupero invece di ricreare una pagina persa quando il contenuto va conservato. Le voci con valori di database memorizzati si possono riordinare nel proprio database, ma non spostare fuori. Se uno spostamento viene rifiutato, esamina gerarchia e tipo di voce invece di forzarlo con tentativi ripetuti.


![Menu di creazione con Nuova pagina e Nuovo database.](/documentation/it/page-create-menu.png)
