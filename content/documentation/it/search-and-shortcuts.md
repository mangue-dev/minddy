---
{
  "id": "search-and-shortcuts",
  "locale": "it",
  "title": "Trovare lavoro e usare azioni da tastiera",
  "summary": "Cerca il lavoro accessibile, consulta gli aiuti sulle scorciatoie e mantieni il focus sull’oggetto previsto.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W15"
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
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "navigation",
    "views-and-filters",
    "desktop-app"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-search.png",
      "alt": "Risultati della ricerca dell’identificativo di un ticket dimostrativo.",
      "caption": "La palette trova il ticket tramite identificativo insieme alle pagine del progetto; aprire un risultato conserva le sue regole di accesso.",
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
    "search-and-shortcuts-steps"
  ]
}
---

## Cercare un oggetto {#search-and-shortcuts}

Apri la palette dei comandi dal controllo di ricerca della navigazione. Cerca un titolo distintivo o un identificativo di ticket e scegli un risultato. I risultati sono limitati al lavoro accessibile al tuo account; conoscere un identificativo non concede accesso a un altro progetto.

Premi Command+K su macOS o Ctrl+K su Windows/Linux per aprire la palette dei comandi; Command/Ctrl+P è una scorciatoia alternativa dell’applicazione. Fuori dal testo modificabile, ? apre la guida delle scorciatoie e C la creazione di ticket. Su una scheda di ticket sotto il puntatore o nei suoi controlli di dettaglio supportati, S apre lo stato, P la priorità, E l’impegno, A l’assegnatario, L le categorie, D la scadenza e O l’obiettivo. Queste azioni con un solo tasto non intercettano la scrittura in campi, aree di testo o editor di contenuti. Le sequenze di navigazione come G e poi H (Home) o G e poi I (Posta in arrivo) usano due tasti successivi. G e poi W porta a Pagine solo nel contesto di un progetto.

Usa la guida delle scorciatoie per esaminare i comandi disponibili sulla tua piattaforma. Minddy distingue scorciatoie dell’applicazione, azioni sulle proprietà dei ticket e scorciatoie native per schede o finestre desktop. Controlla dove si trova il focus prima di usare un comando: scrivere dentro un editor e agire sul ticket circostante sono contesti diversi.

![Risultati della ricerca dell’identificativo di un ticket dimostrativo.](/documentation/it/work-search.png)

## Usare un controllo visibile equivalente {#shortcut-alternatives}

I campi dei ticket hanno selettori di proprietà visibili oltre alle azioni da tastiera. Usali sul telefono o quando browser o sistema operativo intercettano una scorciatoia. Chiudi un pannello sovrapposto o riporta il focus sulla superficie prevista prima di provare un’altra azione.

La ricerca può trovare un ticket assente dalla vista filtrata attuale. Se manca un risultato, conferma progetto, account e istanza, poi usa una ricerca più distintiva. Non creare un duplicato solo perché il tabellone attuale nasconde l’attività. La documentazione pubblica ha una propria ricerca testuale localizzata, indipendente da Numo e dalla configurazione dei fornitori.
