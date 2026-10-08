---
{
  "id": "page-editor",
  "locale": "it",
  "title": "Scrivere una pagina con blocchi e menzioni",
  "summary": "Usa contenuti strutturati, riquadri informativi e collegamenti, verificando che le modifiche siano salvate.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
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
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
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
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-editor.png",
      "alt": "Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.",
      "caption": "Titoli, blocchi di attività e la menzione AUR-2 organizzano la pagina. Il contenuto è un esempio dimostrativo.",
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
    "page-editor-steps"
  ]
}
---

## Scrivere il documento {#page-editor}

Apri la pagina e modifica titolo o corpo come membro del progetto. Usa il menu dei comandi con barra e i controlli di formattazione per inserire titoli, paragrafi, elenchi, attività, codice, sezioni espandibili e riquadri informativi. Un riquadro può avere un’icona emoji e un colore della palette; sceglili per distinguere informazioni utili, non come unico modo di comunicare un avviso.

Usa le menzioni per collegare ticket, obiettivi, persone o pagine pertinenti. I rimandi inversi aiutano i lettori a trovare pagine che citano quella attuale. Un collegamento fornisce contesto, non accesso a un oggetto privato di un altro progetto.


![Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.](/documentation/it/page-editor.png)

## Salvataggio e portabilità {#editor-save}

Controlla l’indicatore di salvataggio prima di lasciare una modifica importante. Se un’altra modifica crea un conflitto, usa i controlli di recupero mostrati e conserva il testo; non supporre che entrambe siano state unite. La cronologia può aiutare a esaminare versioni salvate precedenti.

Le esportazioni Markdown e le letture delle pagine da parte degli agenti conservano icone e colori dei riquadri nella rappresentazione supportata. I formati di esportazione differiscono per fedeltà e gestione degli allegati: controlla il documento ottenuto prima di sostituire una fonte originale. Usa blocchi di codice per comandi letterali e mantieni prerequisiti e avvisi nel testo circostante.
