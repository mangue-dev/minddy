---
{
  "id": "share-a-view",
  "locale": "it",
  "title": "Condividere e revocare una vista in sola lettura",
  "summary": "Pubblica il sottoinsieme previsto di ticket senza rendere il visitatore membro del progetto.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-share-view.png",
      "alt": "Finestra di condivisione di una vista con accesso privato selezionato.",
      "caption": "Accesso privato, protetto da password e pubblico sono scelte distinte. In questa schermata la vista rimane privata.",
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
    "share-a-view-steps"
  ]
}
---

## Pubblicare la vista {#share-a-view}

Apri il menu di una vista idonea sul tabellone del progetto e scegli l’azione per condividerla. Serve l’accesso al progetto; una vista personale al suo interno può essere condivisa solo dal proprio utente. Le viste globali tra progetti non possono essere condivise. Controlla filtri e contenuti visibili prima di pubblicare. Scegli un link pubblico segreto oppure la protezione con password, quando disponibili; la password deve avere almeno otto caratteri. Copia il link generato solo dopo che la modifica è stata salvata correttamente.

Apri il link in una sessione del browser separata, senza il tuo account. Controlla il sottoinsieme di ticket, i campi e i contenuti collegati che un visitatore può vedere. Il link pubblico concede accesso in sola lettura alla vista, non appartenenza o permessi di modifica nel progetto.

Le schede condivise espongono titoli, descrizioni e proprietà visualizzate, compresi nomi degli assegnatari, categorie, nomi degli obiettivi, scadenze, ricorrenza ed eventuali link a piattaforme Git remote. La proiezione pubblica esclude i contenuti dei piani di implementazione e gli indirizzi email dei membri. Le etichette del padre e delle relazioni possono mostrare identificativi di ticket del progetto fuori dal filtro della vista. Controlla descrizioni, nomi e identificativi oltre alle colonne visibili; nascondere una proprietà della scheda non è uno strumento generale per oscurare contenuti riservati.

![Finestra di condivisione di una vista con accesso privato selezionato.](/documentation/it/work-share-view.png)

## Revocare e verificare {#revoke-view}

Torna ai controlli di condivisione e rendi la vista privata per revocarne la pubblicazione. Apri di nuovo il vecchio link senza autenticarti e controlla che l’accesso sia negato. La revoca non recupera copie o screenshot già salvati dal visitatore.

I link segreti delle viste usano il percorso di pubblicazione dei link privati e mantengono noindex. Questa regola limita la ricerca tramite motori di ricerca, ma non è una password. Mantieni privato il link se contiene informazioni sensibili e usa la protezione con password quando opportuno. Non confondere una vista condivisa dell’utente con la documentazione ufficiale indicizzata.

Se il risultato anonimo differisce dalle aspettative, controlla la vista salvata e la configurazione prima di inoltrare il link. Verifica nuovamente l’ambito dopo aver cambiato filtri o contenuti collegati.
