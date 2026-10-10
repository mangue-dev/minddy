---
{
  "id": "navigation",
  "locale": "it",
  "title": "Navigazione e ricerca",
  "summary": "Naviga nel lavoro personale e nei progetti, usa schede e pannelli e trova gli elementi accessibili con la ricerca e le scorciatoie da tastiera.",
  "topic": "Primi passi",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Trovare il lavoro personale e cambiare progetto",
    "Trovare lavoro e usare azioni da tastiera"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-navigation.png",
      "alt": "Navigazione del progetto accanto alla bacheca dei ticket dimostrativi.",
      "caption": "La barra del progetto permette di aprire ticket, obiettivi, pagine e triage.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-search.png",
      "alt": "Risultati della ricerca dell’identificativo di un ticket dimostrativo.",
      "caption": "La palette trova il ticket tramite identificativo insieme alle pagine del progetto; aprire un risultato conserva le sue regole di accesso.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

La navigazione distingue lavoro personale e contenuti di ogni progetto. Ricerca, pannelli e scorciatoie ti aiutano a raggiungere gli elementi accessibili; sul telefono puoi usare i controlli visibili e l’app desktop aggiunge schede native.

## Trovare il lavoro personale e cambiare progetto {#navigation}

La navigazione principale permette di raggiungere il lavoro personale e i tuoi progetti. Seleziona un progetto per vedere i suoi ticket e le destinazioni secondarie, tra cui triage, obiettivi, pagine e impostazioni del progetto. La riga per tornare indietro sale di un livello nella navigazione; può cambiare il contenuto della barra laterale mentre la pagina principale resta aperta. Seleziona una destinazione per aprirla.

I cicli personali e le viste tra progetti comprendono i progetti a cui hai accesso. Obiettivi, wiki e feedback appartengono a un singolo progetto. Controlla il progetto attivo prima di creare lavoro o cambiare impostazioni.

![Navigazione del progetto accanto alla bacheca dei ticket dimostrativi.](/documentation/it/work-navigation.png)

### Pannelli e navigazione mobile {#panels}

Un ticket si apre in un pannello di dettaglio, lasciando disponibile il tabellone sottostante. Numo si apre dal pulsante flottante in un pannello di conversazione condiviso. La posta in arrivo si apre come pannello a comparsa della navigazione, con notifiche e inviti. I vecchi collegamenti alle schermate dedicate della posta in arrivo e di Numo portano ai punti di accesso attuali; non indicano schermate separate ancora presenti.

Sul telefono, apri il menu laterale di navigazione per scegliere le stesse destinazioni. I pannelli usano la larghezza disponibile: chiudi il pannello attuale o torna indietro per rivedere l’elenco. Usa i pulsanti visibili quando una scorciatoia da tastiera non è disponibile.

### Schede desktop {#tabs}

L’app desktop aggiunge schede native e un selettore di server intorno all’applicazione. Una scheda permette di navigare nell’applicazione; non crea un altro account né cambia l’appartenenza al progetto. Verifica l’istanza selezionata quando cambi server. Consulta la guida desktop per installazione, scorciatoie native e aggiornamenti; i permessi su pagine e ticket continuano ad applicarsi.

## Trovare lavoro e usare azioni da tastiera {#search-and-shortcuts}

Apri la palette dei comandi dal controllo di ricerca della navigazione. Cerca un titolo distintivo o un identificativo di ticket e scegli un risultato. I risultati sono limitati al lavoro accessibile al tuo account; conoscere un identificativo non concede accesso a un altro progetto.

Premi Command+K su macOS o Ctrl+K su Windows/Linux per aprire la palette dei comandi; Command/Ctrl+P è una scorciatoia alternativa dell’applicazione. Fuori dal testo modificabile, ? apre la guida delle scorciatoie e C la creazione di ticket. Su una scheda di ticket sotto il puntatore o nei suoi controlli di dettaglio supportati, S apre lo stato, P la priorità, E l’impegno, A l’assegnatario, L le categorie, D la scadenza e O l’obiettivo. Queste azioni con un solo tasto non intercettano la scrittura in campi, aree di testo o editor di contenuti. Le sequenze di navigazione come G e poi H (Home) o G e poi I (Posta in arrivo) usano due tasti successivi. G e poi W porta a Pagine solo nel contesto di un progetto.

Usa la guida delle scorciatoie per esaminare i comandi disponibili sulla tua piattaforma. minddy distingue scorciatoie dell’applicazione, azioni sulle proprietà dei ticket e scorciatoie native per schede o finestre desktop. Controlla dove si trova il focus prima di usare un comando: scrivere dentro un editor e agire sul ticket circostante sono contesti diversi.

![Risultati della ricerca dell’identificativo di un ticket dimostrativo.](/documentation/it/work-search.png)

### Usare un controllo visibile equivalente {#shortcut-alternatives}

I campi dei ticket hanno selettori di proprietà visibili oltre alle azioni da tastiera. Usali sul telefono o quando browser o sistema operativo intercettano una scorciatoia. Chiudi un pannello sovrapposto o riporta il focus sulla superficie prevista prima di provare un’altra azione.

La ricerca può trovare un ticket assente dalla vista filtrata attuale. Se manca un risultato, conferma progetto, account e istanza, poi usa una ricerca più distintiva. Non creare un duplicato solo perché il tabellone attuale nasconde l’attività. La documentazione pubblica ha una propria ricerca testuale localizzata, indipendente da Numo e dalla configurazione dei fornitori.
