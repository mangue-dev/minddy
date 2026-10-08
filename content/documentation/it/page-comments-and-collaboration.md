---
{
  "id": "page-comments-and-collaboration",
  "locale": "it",
  "title": "Discutere una pagina e gestire conflitti",
  "summary": "Usa discussioni ancorate e distingui la presenza dalle modifiche salvate.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-comments.png",
      "alt": "Attività della pagina con una modifica dimostrativa e campo del commento vuoto.",
      "caption": "Leggi l’attività e scrivi un commento nel campo. In questo esempio non è stato inviato alcun commento.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Aggiungere e risolvere una discussione {#page-comments-and-collaboration}

Apri una pagina del progetto e i suoi controlli dei commenti. Seleziona il contenuto pertinente quando crei un commento ancorato, spiega la domanda o modifica proposta e usa le menzioni per coinvolgere un membro. Rispondi nella discussione per mantenere la decisione con il contesto che riguarda. Risolvila quando la domanda è stata effettivamente affrontata.

Gli avatar di presenza identificano chi sta guardando la pagina. Non dimostrano che il testo non salvato di un’altra persona sia arrivato al server né che modifiche simultanee siano unite automaticamente. Controlla lo stato di salvataggio prima di uscire.


![Attività della pagina con una modifica dimostrativa e campo del commento vuoto.](/documentation/it/page-comments.png)

## Recuperare un conflitto di salvataggio {#page-conflict}

Minddy unisce le modifiche a blocchi diversi del primo livello del documento quando può conservare entrambi i cambiamenti. Non unisce carattere per carattere modifiche simultanee all’interno dello stesso blocco. Se entrambe le persone hanno modificato quel blocco, il documento conserva la versione remota e un avviso propone il tuo blocco precedente da esaminare.

Confronta il blocco identificato con il documento attuale. Scegli di ripristinare la tua versione solo se intendi sostituire quel blocco con essa. Se l’azione in conflitto era un’eliminazione, l’opzione per eliminarlo di nuovo applica esplicitamente quella cancellazione. Chiudere l’avviso mantiene il documento adottato e rimuove l’avvertimento; non ripristina la tua versione. Conserva il testo desiderato prima di chiudere e usa la cronologia per esaminare le versioni salvate quando serve un recupero più ampio. Queste scelte riguardano il blocco identificato, senza sostituire alla cieca tutta la pagina.

Un’ancora può mancare dopo modifiche al documento: leggi la discussione prima di spostare o eliminare il blocco citato. Commenti e attività restano interni al progetto salvo pubblicazione esplicita dei contenuti attraverso un percorso supportato. Prova la pagina pubblicata per stabilire la vista effettiva del visitatore senza supporre che i controlli di collaborazione diventino pubblici.
