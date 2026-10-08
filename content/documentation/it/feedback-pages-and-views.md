---
{
  "id": "feedback-pages-and-views",
  "locale": "it",
  "title": "Aggiungere pagine e viste pubbliche alla bacheca",
  "summary": "Selezionare contenuti pubblicati senza esporre nomi o link protetti.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
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
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/feedback-pages-and-views-workflow.png",
      "alt": "Guida ai feedback pubblicata e selezionata nella navigazione della bacheca, leggibile senza accesso.",
      "caption": "Pubblica una pagina, attiva le schede delle pagine e selezionala per la bacheca. Questa pagina dimostrativa è stata aperta anonimamente; il suo URL opaco mantiene noindex.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Pubblicare e selezionare {#feedback-pages-and-views}

Come proprietario, pubblica prima la pagina del progetto desiderata o condividi la vista desiderata con visibilità pubblica. Controlla che non contenga informazioni private. Apri le impostazioni Feedback, abilita la famiglia di pagine o viste e seleziona ogni elemento da mostrare. Sono necessari sia l’interruttore della famiglia sia la selezione dei singoli elementi.

L’elenco delle impostazioni può contenere condivisioni protette, ma la navigazione pubblica include solo quelle di livello pubblico. Selezionare una pagina protetta non supera la protezione e non mostra il suo nome in una scheda della bacheca. Un elemento pubblicato in un altro progetto non fa parte delle schede di questo progetto.


## Verificare e rimuovere accesso {#visibility}

Apri la bacheca senza sessione. Segui le schede verso pagine e viste selezionate e controlla titoli e contenuti. Quando configurata, la navigazione è condivisa tra bacheca, viste pubbliche e pagine pubbliche; una scheda isolata non viene mostrata come navigazione.

Per rimuovere una scheda, deseleziona l’elemento o disattiva la sua famiglia. Questo rimuove la navigazione, non la condivisione sottostante. Revoca o modifica la condivisione stessa per togliere l’accesso dal link diretto. Disattivare la bacheca disattiva anche la navigazione associata, ma non revoca autonomamente ogni condivisione di pagina o vista. Dopo una modifica della pubblicazione, verifica sia la scheda della bacheca sia l’URL originale della condivisione.

![Guida ai feedback pubblicata e selezionata nella navigazione della bacheca, leggibile senza accesso.](/documentation/it/feedback-pages-and-views-workflow.png)
