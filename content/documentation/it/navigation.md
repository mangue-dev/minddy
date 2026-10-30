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
  "revision": 24,
  "sourceRevision": 22,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/keyboard/keyboard-context.tsx",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/use-hidden-projects.ts",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "components/objective-relations-section.tsx",
      "components/create-issue-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "lib/palette-workspace-groups.ts",
      "components/inbox-content.tsx",
      "lib/inbox-launcher.ts",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "components/mobile-navigation.tsx",
      "components/mobile-nav-actions.tsx",
      "lib/keyboard/typeahead.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (pointer to the Numo type-ahead on Home and in the expanded Numo panel, checked against lib/keyboard/typeahead.ts and lib/keyboard/keyboard-context.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show this behavior)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-search.png",
      "alt": "Risultati della ricerca dell’identificativo di un ticket dimostrativo.",
      "caption": "La palette trova il ticket tramite identificativo insieme alle pagine del progetto; aprire un risultato conserva le sue regole di accesso.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        788,
        320
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

La navigazione principale permette di raggiungere il lavoro personale e i tuoi progetti. Seleziona un progetto per vedere i suoi ticket e le destinazioni secondarie, tra cui triage, obiettivi, pagine e impostazioni del progetto. La riga per tornare indietro sale di un livello nella navigazione; può cambiare il contenuto della barra laterale mentre la pagina principale resta aperta. Seleziona una destinazione per aprirla. In un elenco come triage, obiettivi, feedback, revisione del codice o routine, il campo di filtro in cima alla barra laterale cerca in tutti gli elementi, qualunque siano i filtri che restringono l’elenco; il suo testo segnaposto ne indica il totale.

Contatori e avvisi ti seguono da un livello all’altro. Il controllo che riporta alla **Home** mostra il totale da smistare nei progetti elencati nella **Home**, compreso quello attuale, e l’avviso di Smart Assign quando a uno dei tuoi progetti mancano regole. Una riga di ritorno mostra il contatore del livello a cui riporta come badge sulla sua freccia, in ambra finché vale l’avviso di Smart Assign. All’interno di un progetto, **Triage** e **Feedback** mantengono i contatori di quel progetto. Le schede dell’app desktop portano lo stesso badge della loro voce nella barra laterale: l’avviso sulla **Home** e i contatori su **Posta in arrivo**, **Revisione del codice** e su **Triage** e **Feedback** di un progetto, aggiornati anche quando la scheda è in secondo piano.

I cicli personali e le viste tra progetti comprendono i progetti a cui hai accesso. Obiettivi, pagine e feedback appartengono a un singolo progetto. Controlla il progetto attivo prima di creare lavoro o cambiare impostazioni.

![Navigazione del progetto accanto alla bacheca dei ticket dimostrativi.](/documentation/it/work-navigation.png)

### Agire da una riga della barra laterale {#sidebar-menus}

Fai clic con il tasto destro su una riga della barra laterale per agire su ciò che rappresenta senza aprirlo prima. Le righe di collegamento offrono anche **Apri in una nuova scheda** e **Copia link**. Un’azione che sposta qualcosa nel cestino compare sempre per ultima, dopo un separatore.

- La riga **Tutti i ticket** offre **Nuovo ticket** e la riga **Routine** offre **Nuova routine** se sei proprietario di un progetto.
- Una riga di progetto, o il nome del progetto in cima al suo pannello, offre **Nuovo** (un ticket, un obiettivo o una pagina in quel progetto) e **Impostazioni del progetto**. Il proprietario del progetto vede anche **Sposta nel cestino**, che chiede la stessa conferma delle impostazioni del progetto. Lo stesso menu offre anche **Nascondi progetto**, oppure **Mostra progetto** per un progetto che hai nascosto; vedi [Nascondere un progetto per te](/docs/projects#hide-project).
- Una scheda di progetto offre la propria creazione: **Nuovo ticket** su Ticket, **Nuovo obiettivo** su Obiettivi, **Nuova pagina** su Pagine e **Nuovo feedback** su Feedback, che apre il modulo interno per i feedback.
- Una riga di triage offre **Accetta**, **Rifiuta** e **Segna come duplicato…**, che chiedono la stessa conferma o lo stesso selettore del pannello di triage, poi la copia del suo identificativo e **Sposta nel cestino**. Un lettore può solo copiare l’identificativo. Vedi [Valutare il lavoro in arrivo nel triage](/docs/issues#triage-incoming-work).
- Una riga di obiettivo offre **Stato**, **Visualizza ticket** sulla bacheca del progetto e **Sposta nel cestino**. Un lettore vede solo **Visualizza ticket**.
- Una riga di feedback offre **Stato**, a meno che non lo determini un ticket collegato, **Collega a un ticket esistente**, **Unisci a…** quando un’altra richiesta può accoglierla, e **Sposta nel cestino**. Ogni azione apre la richiesta e chiede la stessa conferma del suo pannello.
- Una riga di routine offre **Apri l’ultima esecuzione** e, al proprietario del progetto, **Esegui ora**, **Metti in pausa** o **Riattiva**, **Modifica** e **Sposta nel cestino**. Vedi [Gestire e verificare le esecuzioni](/it/documentazione/scheduled-routines#runs).
- Una riga di pull request offre i cambi consentiti dal suo stato attuale, **Unisci** quando è pronta e azioni di correzione quando qualcosa la blocca. Vedi [Revisione e unione](/it/documentazione/code-work#decision).

L’azione si applica alla riga su cui hai fatto clic, anche quando è aperto un altro progetto o elemento.

### Pannelli e navigazione mobile {#panels}

Un ticket si apre in un pannello di dettaglio, lasciando disponibile il tabellone sottostante. Una pagina aperta da una menzione o da un collegamento si apre allo stesso modo, in un pannello laterale con **Espandi** per raggiungere la pagina intera. Numo si apre dal pulsante flottante in un pannello di conversazione condiviso. La posta in arrivo si apre come pannello a comparsa della navigazione, con notifiche e inviti. I vecchi collegamenti alle schermate dedicate della posta in arrivo e di Numo portano ai punti di accesso attuali; non indicano schermate separate ancora presenti.

Sul telefono, apri il menu laterale di navigazione per scegliere le stesse destinazioni. La barra in fondo allo schermo riunisce, da sinistra a destra, il menu laterale di navigazione, Numo, la ricerca, il taccuino delle attività e **Nuovo**; **Home** si trova nel menu laterale. Una barra di caricamento in alto indica che la navigazione è in corso, anche mentre vengono completati i salvataggi della pagina in sospeso. I pannelli usano la larghezza disponibile: chiudi il pannello attuale o torna indietro per rivedere l’elenco. Usa i pulsanti visibili quando una scorciatoia da tastiera non è disponibile.

### Schede desktop {#tabs}

L’app desktop aggiunge schede native e un selettore di server intorno all’applicazione. Una scheda permette di navigare nell’applicazione; non crea un altro account né cambia l’appartenenza al progetto. Verifica l’istanza selezionata quando cambi server. Consulta la guida desktop per installazione, scorciatoie native e aggiornamenti; i permessi su pagine e ticket continuano ad applicarsi.

## Trovare lavoro e usare azioni da tastiera {#search-and-shortcuts}

Apri la palette dei comandi dal controllo di ricerca della navigazione. Cerca un titolo distintivo o un identificativo di ticket e scegli un risultato. I risultati sono limitati al lavoro accessibile al tuo account; conoscere un identificativo non concede accesso a un altro progetto. Il comando Documentazione apre il manuale pubblico nella lingua attuale.

Appena digiti, la palette trova anche routine, pull request, viste e notifiche della **Posta in arrivo**; non compaiono nell’elenco mostrato prima della digitazione. Routine e pull request compaiono se il tuo piano le include, e le pull request coprono le 100 aggiornate più di recente nei tuoi repository collegati. Le viste coprono **Tutti i ticket** e il progetto in cui ti trovi. Scegliere una routine, una pull request o una vista la apre. Scegliere una notifica apre la **Posta in arrivo** sulla scheda che la elenca, **Non lette** o **Tutte**, scorre fino a essa e la evidenzia per un istante; resta non letta finché non la apri. I progetti che hai nascosto restano fuori da questi risultati.

Anche ciò che colleghi si sceglie nella palette. Aggiungere una relazione, collegare un ticket a una pull request o una pull request a un ticket e allegare una pagina come risorsa la aprono solo sugli elementi che puoi scegliere, e il suo campo di ricerca indica cosa stai scegliendo. Per una relazione, scegli prima il tipo nel menu; la palette mostra poi i ticket e gli obiettivi che possono riceverla. Scegliere un elemento lo collega; Esc chiude la palette senza collegare nulla.

Premi Command+K su macOS o Ctrl+K su Windows/Linux per aprire la palette dei comandi; Command/Ctrl+P è una scorciatoia alternativa dell’applicazione. Fuori dal testo modificabile, ? apre la guida delle scorciatoie e C la creazione di ticket. Su una scheda di ticket sotto il puntatore o nei suoi controlli di dettaglio supportati, S apre lo stato, P la priorità, E l’impegno, A l’assegnatario, L le categorie, D la scadenza e O l’obiettivo. R aggiunge una relazione dagli stessi punti, nella pagina di un obiettivo e nel modulo di nuovo ticket: scegli il tipo di relazione, poi l’altro ticket o obiettivo. Se la scheda fa parte di una selezione, questi tasti modificano tutti i ticket selezionati; assegnatario, obiettivo, categorie e relazioni valgono solo per i ticket selezionati del progetto di quella scheda. Maiusc+C porta a un campo del commento pronto per scrivere, con la conversazione scorsa fino all’ultimo messaggio: quello di una scheda di ticket sotto il puntatore o di una riga sotto il puntatore nell’elenco di obiettivi, feedback, pull request, pagine o triage, oppure, se non c’è nulla sotto il puntatore, quello del ticket, dell’obiettivo, del feedback, della pull request o della pagina sullo schermo. Una pagina apre per questo il suo pannello **Attività**. Maiusc+C agisce solo su quell’elemento, anche se la scheda fa parte di una selezione. Nella pagina di un obiettivo e nel modulo di nuovo obiettivo, S apre il suo stato, A il responsabile, D la data limite e C il colore; lì, C non crea un ticket. Queste azioni con un solo tasto non intercettano la scrittura in campi, aree di testo o editor di contenuti. Le sequenze di navigazione come G e poi H (Home) o G e poi I (Posta in arrivo) usano due tasti successivi. G e poi W porta a Pagine solo nel contesto di un progetto. Nella **Home** e nel pannello di Numo ingrandito, una rapida raffica di tasti viene invece scritta nel campo di Numo, e un singolo tasto esegue la sua scorciatoia dopo una breve pausa ([scrivere a Numo](/docs/numo#work-with-numo)).

Per raggiungere un’impostazione, digitane il nome nella palette dei comandi o nel campo di filtro in cima alla barra laterale delle impostazioni. Entrambi trovano ogni riquadro di impostazioni e le singole impostazioni, come la lingua, il tema, ogni palette, la trasparenza e i due interruttori di **Avviare un ticket**. Scegliendo un risultato si apre la scheda di impostazioni giusta, la pagina scorre fino al riquadro o alla riga e lo evidenzia. Comando+T su macOS o Ctrl+T su Windows/Linux apre la palette della nuova scheda; un’impostazione scelta lì si apre in una nuova scheda dell’app. Dentro un progetto offre anche **Nuova pagina**, che crea una pagina in quel progetto e la apre in una nuova scheda. Le parole chiave in inglese e in francese funzionano qualunque sia la lingua dell’interfaccia.

Comando+F su macOS o Ctrl+F su Windows/Linux cerca nella pagina o nel taccuino delle attività sullo schermo con la [barra di ricerca e sostituzione](/it/documentazione/pages#find-and-replace) di minddy. Nelle altre schermate, e quando un’altra finestra di dialogo è aperta sopra la pagina, apre la ricerca del browser.

Usa la guida delle scorciatoie per esaminare i comandi disponibili sulla tua piattaforma. minddy distingue scorciatoie dell’applicazione, azioni sulle proprietà dei ticket e scorciatoie native per schede o finestre desktop. Controlla dove si trova il focus prima di usare un comando: scrivere dentro un editor e agire sul ticket circostante sono contesti diversi.

![Risultati della ricerca dell’identificativo di un ticket dimostrativo.](/documentation/it/work-search.png)

### Ordine dei ticket nella ricerca {#issue-search-order}

Ogni ricerca di ticket elenca i ticket nello stesso ordine: la palette, le menzioni `@`, i selettori di relazioni, duplicati e pull request, la finestra **Collega a un ticket esistente** dei feedback e la ricerca usata da Numo e dagli agenti MCP. I ticket **In corso** e **In revisione** vengono per primi, poi quelli in **Backlog** e **Da fare**. I ticket in **Triage**, **Completato**, **Annullato** e **Duplicato** vengono sempre per ultimi e restano selezionabili. In ogni gruppo, la corrispondenza di testo migliore viene per prima. Un identificativo digitato per intero, come `MIN-42`, mette quel ticket in cima, qualunque sia il suo stato.

### Cercare i ticket per significato {#search-by-meaning}

Quando una ricerca descrive il lavoro invece di nominarlo, la ricerca dei ticket trova anche ticket di significato vicino, anche se usano altre parole. Per esempio, «l’accesso non riesce dopo il ripristino della password» può trovare un ticket intitolato «Sessione persa al cambio della password». Vale per la palette dei comandi, le menzioni `@` nelle descrizioni, nelle pagine, nei commenti e nel compositore di Numo, i selettori delle relazioni, **Segna come duplicato…** nel triage, **Collega un ticket** su una pull request, il menu **Aggiungi contesto** → **Ticket** di Numo e **Collega a un ticket esistente** sui feedback.

Le corrispondenze testuali e gli identificativi esatti vengono sempre per primi e mantengono il loro ordine. Poco dopo che hai smesso di scrivere, al massimo cinque ticket trovati per significato si aggiungono dopo di essi sotto **Correlati per significato**. Finché non arrivano, una riga **Ricerca per significato…** indica che la ricerca è ancora in corso (nella palette dei comandi, solo quando nessun risultato testuale corrisponde). Se non ne trova nessuno, indica **Nessun ticket correlato per significato**; un menu `@` senza corrispondenze testuali si chiude invece. Un ticket già mostrato non viene ripetuto e la riga evidenziata non si sposta. Ogni selettore mantiene le proprie regole, quindi compaiono solo ticket che poteva già proporre: un selettore delle relazioni, per esempio, continua a proporre solo ticket dello stesso progetto non ancora collegati. La palette dei comandi cerca nei progetti che puoi leggere, fino ai 25 aggiornati più di recente; le sue azioni di selezione multipla non usano la ricerca per significato.

La ricerca per significato ha questi limiti:

- La ricerca deve contenere almeno due parole, o una parola di almeno sei lettere. Gli identificativi come `MIN-42`, `#42` o `42`, e le ricerche molto brevi, usano solo la ricerca testuale.
- Si basa sull’indice che Riempimento intelligente costruisce dal titolo e dalla descrizione dei ticket. Un ticket non ancora indicizzato, o il cui autore ha disattivato [**Indicizza i ticket**](/docs/issues#smart-fill-preferences), viene trovato solo tramite le sue parole. I ticket nel cestino non compaiono mai.
- Se hai disattivato **Indicizza i ticket** in **Impostazioni account** → **Smart Fill** → **Indicizzazione dei ticket**, le tue ricerche confrontano solo le parole. Lo stesso accade quando il tuo budget IA è esaurito o quando il provider non risponde entro pochi secondi. I risultati testuali restano e non viene mostrato alcun errore.
- Una ricerca `@` il cui testo corrisponde già a una persona, un progetto o una pagina non viene cercata per significato. In un progetto con più di 3.000 ticket indicizzati, vengono confrontati solo i 3.000 indicizzati più di recente; gli altri si trovano tramite le loro parole.

Ogni nuova ricerca usa una chiamata IA, conteggiata nella tua quota **Automazioni** e mostrata nella cronologia di utilizzo come **Ricerca dei ticket**. Una ricerca ripetuta entro circa 15 minuti di norma non viene addebitata di nuovo.

### Usare un controllo visibile equivalente {#shortcut-alternatives}

I campi dei ticket hanno selettori di proprietà visibili oltre alle azioni da tastiera. Usali sul telefono o quando browser o sistema operativo intercettano una scorciatoia. Chiudi un pannello sovrapposto o riporta il focus sulla superficie prevista prima di provare un’altra azione.

La ricerca può trovare un ticket assente dalla vista filtrata attuale. Se manca un risultato, conferma progetto, account e istanza, poi usa una ricerca più distintiva. Non creare un duplicato solo perché il tabellone attuale nasconde l’attività. La documentazione pubblica ha una propria ricerca testuale localizzata, indipendente da Numo e dalla configurazione dei fornitori.
