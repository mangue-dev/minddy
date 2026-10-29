---
{
  "id": "pages",
  "locale": "it",
  "title": "Pagine",
  "summary": "Organizza e modifica le pagine, gestisci discussioni, file e cronologia, pubblica o esporta documenti e importa archivi di database in un database vuoto.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 21,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "lib/server/page-database-views.ts",
      "components/pages/page-comment-bubble.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/rich-editor.tsx",
      "components/pages/page-extensions.ts",
      "components/pages/blocks/image.ts",
      "lib/pages-markdown.ts",
      "components/pages/blocks/subpage.ts",
      "lib/server/pages.ts",
      "lib/pages-subpage.ts",
      "lib/pages-export.ts",
      "components/public-page-body.tsx",
      "components/pages/page-comment-dialog.tsx",
      "lib/keyboard/shortcuts.ts",
      "components/editor/find-bar.tsx",
      "components/editor/find-replace.ts",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/code-block-lowlight.ts",
      "app/globals.css",
      "components/pages/page-peek-panel.tsx",
      "components/global-page-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/pages/block-gutter.tsx",
      "components/editor/suggestion-menu.tsx",
      "components/editor/suggestion-chip.ts",
      "components/editor/suggestion-menu.test.tsx",
      "components/editor/block-selection.ts",
      "components/editor/document-editor.tsx",
      "app/tokens.css",
      "components/pages/block-actions.ts",
      "lib/selection-menu-visibility.test.ts",
      "lib/mention-menu.ts",
      "components/pages/block-menu.tsx",
      "lib/action-menu-search.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (block menu search field reaching every action, block types and colors included, with submenu entries shown behind their path such as Turn into › Heading 1 (MIN-845), checked against components/pages/block-menu.tsx, components/issue-context-menu.tsx and lib/action-menu-search.ts; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; equivalent meaning to en revision 21; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Costruire un wiki di progetto",
    "Scrivere una pagina con blocchi e menzioni",
    "Discutere una pagina e gestire conflitti",
    "Allegare e recuperare file delle pagine",
    "Esaminare e ripristinare una versione di pagina",
    "Pubblicare una pagina e revocarne il collegamento",
    "Esportare o stampare una pagina",
    "Costruire una wiki di progetto",
    "Importare, esportare o stampare una pagina"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-create-menu.png",
      "alt": "Menu di creazione con Nuova pagina e Nuovo database.",
      "caption": "Usa i controlli delle pagine del progetto per scegliere un documento o un database.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        240,
        129
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-editor.png",
      "alt": "Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.",
      "caption": "Titoli, blocchi di attività e la menzione AUR-2 organizzano la pagina. Il contenuto è un esempio dimostrativo.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-comments.png",
      "alt": "Attività della pagina ancora senza eventi e campo del commento vuoto.",
      "caption": "Leggi l’attività e scrivi un commento nel campo. In questo esempio non è stato inviato alcun commento.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        608,
        616
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-file-states.png",
      "alt": "Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.",
      "caption": "Controlla lo stato effettivo del file: il secondo allegato è disponibile, il primo caricamento incompleto no.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-history-preview.png",
      "alt": "Scheda Versioni con uno stato precedente espanso, autore, Ripristina e avviso di conservazione per 30 giorni.",
      "caption": "Esamina l’anteprima di uno stato salvato e confrontalo con la pagina attuale prima di ripristinarlo.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-publish.png",
      "alt": "Finestra di pubblicazione con Privato selezionato e opzioni con password o link.",
      "caption": "Privato mantiene la pagina nel progetto. Controlla chi deve leggerla prima di cambiare la pubblicazione.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-export.png",
      "alt": "Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.",
      "caption": "Scegli Markdown per scaricare il documento oppure Stampa / PDF per aprire la vista di stampa.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/it/file-preview.png",
      "alt": "Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica, Rinomina e Rimuovi.",
      "caption": "Il visualizzatore condiviso colloca Chiudi sotto l’anteprima. Il menu Azioni del file offre Scarica e, con i permessi necessari, Rinomina e Rimuovi.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

Le pagine formano la wiki del progetto, con documenti, sottopagine, file e discussioni. Puoi organizzare e modificare i contenuti, collaborare, gestire la cronologia, pubblicare o esportare un ramo. Il menu del documento non offre un’importazione generica: importa un archivio in un database nuovo e vuoto seguendo la [guida ai database](/it/documentazione/databases#import-a-database).

## Costruire un wiki di progetto {#create-and-organize-pages}

Apri Pagine in un progetto come proprietario o come Membro; i lettori possono aprire le pagine ma non crearne. Usa il menu + e scegli una pagina per un documento o un database per un elenco strutturato. Dai alla pagina un titolo utile e scrivi la specifica, decisione o procedura che deve conservare.

Crea sottopagine per documenti correlati e usa i controlli dell’albero per spostarle o riordinarle. Una pagina non può diventare discendente di sé stessa. Duplicare una pagina crea nuovi contenuti, non un riferimento aggiornato all’originale. Controlla il ramo duplicato prima di modificarlo o condividerlo. Per creare una sottopagina mentre scrivi, digita `/` e scegli **Sottopagina**: minddy crea la pagina figlia sotto quella corrente, inserisce la sua menzione nel punto del cursore seguita da uno spazio, poi apre la nuova pagina nel pannello laterale, accanto alla pagina in cui stai scrivendo; scegli **Espandi** per aprirla per intero. Puoi continuare a scrivere dopo la menzione sulla stessa riga, come dopo qualsiasi menzione. Una pagina creata dalla barra laterale si apre per intero. Una pagina meno recente può ancora mostrare blocchi di sottopagina: la prima volta che la apre qualcuno che può modificarla, ogni blocco diventa una riga che contiene solo la menzione della figlia, e commenti e link ai blocchi continuano a puntarvi. L’apertura da parte di un lettore non converte nulla. Quando duplichi una pagina con le sue sottopagine, le menzioni delle pagine copiate puntano alle copie, anche all’interno di una frase.

### Preferiti ed eliminazione {#page-tree}

Segna una pagina come preferita per mostrarla in cima all’albero del progetto. Questi preferiti sono condivisi nel progetto, diversamente da una nota privata del taccuino. Collega una pagina a un ticket quando il documento attuale è il contesto dell’attività; il titolo della risorsa segue le rinominazioni della pagina. Nel menu `…` della pagina aperta, **Copia** offre **Copia collegamento** e **Copia il contenuto della pagina**, che copia titolo e corpo in Markdown (non disponibile per un database). Comando+Maiusc+L su macOS o Ctrl+Maiusc+L su Windows/Linux copia il collegamento della pagina aperta.

L’eliminazione sposta nel cestino le pagine per cui è previsto il recupero. Da un menu di pagina, lo spostamento nel cestino chiede prima conferma, indicando la pagina e quante sottopagine la seguono; restano ripristinabili dal cestino per 30 giorni. Eliminare una menzione non sposta mai una pagina nel cestino. Spostare nel cestino una pagina figlia dall’albero rimuove dalla pagina madre la riga che contiene solo la sua menzione; ripristinando la pagina, quella riga torna alla fine della madre, a meno che questa non la menzioni ancora altrove. Una menzione all’interno di una frase non viene mai rimossa. Controlla il ramo selezionato prima di eliminare e usa il recupero invece di ricreare una pagina persa quando il contenuto va conservato. Le voci con valori di database memorizzati si possono riordinare nel proprio database, ma non spostare fuori. Se uno spostamento viene rifiutato, esamina gerarchia e tipo di voce invece di forzarlo con tentativi ripetuti.


![Menu di creazione con Nuova pagina e Nuovo database.](/documentation/it/page-create-menu.png)

## Promuovere una pagina a ticket {#promote-page-to-issue}

Quando una pagina descrive lavoro da fare, il proprietario o un Membro può trasformarla in un ticket con Numo. I lettori non vedono questa azione. Servono utilizzo IA disponibile o una chiave personale compatibile.

1. Scegli **Promuovi a ticket** nel menu della pagina nell’albero (`…` o clic destro sulla riga) o nel menu `…` della pagina aperta (**Opzioni di pagina**). La stessa azione compare per una voce di database aperta nel pannello laterale e nel menu della maniglia di una singola voce, come spiega la [guida ai database](/it/documentazione/databases#entry-actions).
2. Se la pagina aperta ha modifiche non salvate, minddy le salva prima. Se il salvataggio non riesce, minddy segnala che non è stato possibile salvare la pagina e Numo non si apre. Ripeti la promozione quando la pagina è salvata.
3. Numo si apre nel progetto della pagina, con la pagina come contesto, e riceve la richiesta di leggerne il titolo, il contenuto e, per una voce di database, le proprietà. Se la pagina non è chiara, o se un database lascia ambiguo l’ambito del ticket, Numo fa delle domande prima di creare qualcosa. Rispondi nella conversazione.
4. Numo crea un solo ticket e vi allega la pagina. Apri il ticket e controlla identificativo, ambito, proprietà e pagina allegata.

A differenza di un’attività del taccuino portata nel progetto, la pagina non viene rimossa: resta al suo posto nell’albero, con contenuto e sottopagine. Se la creazione non riesce o il risultato non è chiaro dopo un errore di rete, cerca il ticket prima di ripetere la promozione.

## Scrivere una pagina con blocchi e menzioni {#page-editor}

Apri la pagina e modifica titolo o corpo come proprietario o come Membro. I lettori possono aprire e leggere le pagine, ma non possono modificarle, importarle, duplicarle, aggiungerle ai preferiti o pubblicarle, né ripristinarne una versione. Usa il menu dei comandi con barra e i controlli di formattazione per inserire titoli, testo, elenchi puntati, numerati e di attività, citazioni, riquadri informativi, blocchi di codice, equazioni, divisori, sezioni espandibili, sottopagine, immagini e file. Un riquadro può avere un’icona emoji e un colore della palette; sceglili per distinguere informazioni utili, non come unico modo di comunicare un avviso. Il blocco **Equazione** si scrive in LaTeX e viene visualizzato con KaTeX. Sceglilo nel menu `/` per un’equazione su una riga propria, oppure scrivi il LaTeX tra `$$` in una frase, come `$$x^2$$`, per un’equazione nel testo. Fai clic su un’equazione per modificarne il LaTeX con un’anteprima dal vivo, in un popover sul computer o in un pannello sul telefono. Il LaTeX che non può essere visualizzato appare in rosso con un messaggio, e salvare un’equazione vuota la rimuove.

Il menu `/` raggruppa i blocchi in **Blocchi di base**, **Elenchi** e **Blocchi avanzati**, e il menu `@` raggruppa per tipo ciò che puoi menzionare, come **Persone**, **Ticket** o **Pagine**. Finché un menu è aperto, la `/` o la `@` e ciò che digiti dopo appaiono nel testo come un’etichetta evidenziata, con **Digita per cercare** finché non digiti una lettera. Le frecce scorrono tutte le sezioni, e Invio o Tab sceglie. Premi Esc, digita due spazi di seguito o scegli **Chiudi menu**, in fondo al menu, per chiuderlo: ciò che hai digitato resta testo normale. Uno spazio subito dopo la `/` o la `@` da sola chiude anch’esso il menu. Una volta digitata una ricerca, un singolo spazio ne resta parte, quindi `/elenco puntato` o `@Camille Roy` vengono cercati come li digiti. Il menu si chiude anche quando la ricerca non trova nulla, a meno che una ricerca per significato sia ancora in corso.

Usa le menzioni per collegare ticket, obiettivi, persone o pagine pertinenti. Digita `@` seguito da un identificativo, un nome o un titolo, anche con spazi singoli; il menu si chiude negli stessi modi del menu `/`, e alla scelta di un elemento. Una parola che descrive il lavoro invece di nominarlo mostra anche ticket trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**, dopo le corrispondenze testuali. I rimandi inversi aiutano i lettori a trovare pagine che citano quella attuale. Un collegamento fornisce contesto, non accesso a un oggetto privato di un altro progetto. La menzione di una pagina che non ha ancora un titolo mostra **Senza titolo**.

Un clic sulla menzione di una pagina, su un rimando inverso, su una pagina allegata a un ticket o a un obiettivo, o su un collegamento a una pagina in un commento o in una risposta di Numo apre quella pagina in un pannello laterale sopra ciò che stavi leggendo. Leggila o modificala lì, scegli **Espandi** per aprire la pagina intera oppure chiudi il pannello per tornare indietro. Tra **Espandi** e la chiusura, il menu **Opzioni di pagina** (`…`) del pannello offre le stesse azioni della pagina intera; spostare la pagina nel cestino da lì chiude il pannello e ti lascia sulla pagina sottostante. Anche un database si apre nel pannello, con la barra degli strumenti compatta descritta nella [guida ai database](/docs/databases#database-display); una voce aperta dalla sua tabella ne prende il posto, e **Indietro**, in alto a sinistra nel pannello, torna alla tabella.


![Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.](/documentation/it/page-editor.png)

### Formattare il testo e scrivere sul telefono {#editor-formatting}

Le pagine, le descrizioni, i commenti e il taccuino delle attività condividono lo stesso editor. Seleziona del testo, o blocchi interi come descritto più avanti, per aprire la barra di selezione. La sua prima riga mostra il tipo del blocco: sceglila per aprire **Trasforma in** e cambiare il blocco. Seguono **Colore**, per il testo o lo sfondo, **Grassetto**, **Corsivo**, **Sottolineato**, **Barrato**, **Codice**, **Aggiungi link** (o **Rimuovi link** su un link), **Equazione in linea**, che trasforma il testo selezionato in un’equazione in linea o viceversa, **Cancella formattazione** e **Copia**, che copia la selezione. Sul computer, una riga **Chiedi a Numo** invia il passaggio a Numo, come descritto nella [guida a Numo](/it/documentazione/numo#work-with-numo), e in una pagina una riga **Commento** ancora un commento alla selezione. **Trasforma in** segna solo il tipo del blocco che contiene la selezione. Negli elenchi dei colori, qui e nel menu del blocco, ogni colore compare con il suo nome, scritto in quel colore o su quello sfondo. Un clic fuori dall’editor termina la selezione e nasconde la barra, così come scegliere **Commento**. I suggerimenti mostrano le scorciatoie: Comando+B, Comando+I, Comando+U, Comando+Maiusc+S e Comando+E su macOS, oppure Ctrl con gli stessi tasti su Windows/Linux. In un editor, Comando/Ctrl+B mette il testo in grassetto; altrove continua a mostrare o nascondere la barra laterale. In un blocco di codice, la barra mostra solo il tipo di blocco, **Colore**, **Copia**, **Chiedi a Numo** e **Commento**: un colore del testo sostituisce l’evidenziazione della sintassi del codice, un colore di sfondo la mantiene e il colore predefinito la ripristina. I colori del testo e dello sfondo non vengono conservati in Markdown. La barra segue il passaggio selezionato mentre la pagina scorre e si chiude quando il passaggio esce dalla vista.

Maiusc+Invio va a capo nello stesso blocco. Comando/Ctrl+Invio non inserisce un’interruzione di riga: in un commento o in un altro compositore invia, qualunque sia la scorciatoia di invio scelta nelle tue [preferenze](/it/documentazione/accounts#preferences), e se hai scelto Invio come scorciatoia di invio, anche Invio invia.

Per selezionare blocchi interi, trascina da un blocco a un altro o traccia un rettangolo di selezione dall’esterno del testo: premi nel margine accanto o nello spazio vuoto sotto la pagina, poi trascina sui blocchi. Ogni blocco toccato dal rettangolo viene selezionato; un clic lì senza trascinare continua a mettere il cursore su quella riga, ed Esc annulla il rettangolo. Ogni blocco raggiunto viene evidenziato con angoli arrotondati, nel colore del testo selezionato. Quando è selezionato un solo blocco, la barra di selezione si apre sopra: le sue azioni (**Trasforma in**, **Colore**, **Grassetto** e gli altri formati, **Copia**, **Chiedi a Numo**, **Commento**) si applicano al blocco, e dopo **Trasforma in** resta selezionato per proseguire con un’altra azione. Con più blocchi selezionati la barra resta nascosta: apri il menu della maniglia di un blocco selezionato, che agisce su tutti. Maiusc+clic su un altro blocco, o Maiusc+freccia su e Maiusc+freccia giù al bordo di un blocco, estendono la selezione a blocchi interi. Esc seleziona il blocco in cui stai scrivendo, ed Esc di nuovo annulla la selezione. Comando+A su macOS o Ctrl+A su Windows/Linux seleziona prima il testo del blocco in cui ti trovi, anche in un blocco di codice, e premuto di nuovo tutti i blocchi. Con dei blocchi selezionati, la freccia su e la freccia giù selezionano il blocco sopra o sotto, Maiusc+freccia su e Maiusc+freccia giù aggiungono o tolgono blocchi, Backspace o Canc li elimina, Comando/Ctrl+C li copia, Comando/Ctrl+X li taglia, e Invio su un solo blocco porta il cursore alla sua fine; digitare non ha effetto. Il menu del blocco agisce su tutti i blocchi selezionati. Scrivi nel campo di ricerca del menu del blocco per raggiungere qualsiasi sua azione, tipi di blocco e colori compresi: una voce di un sottomenu mostra il suo percorso, ad esempio **Trasforma in** › **Titolo 1**. Immagini, file, blocchi di codice, equazioni, divisori, menzioni e codice in linea mostrano la stessa evidenziazione quando sono selezionati, da soli o in una selezione. Mentre scrivi o modifichi un commento, Esc continua a chiuderlo o ad annullarlo. Su un touchscreen, la pressione prolungata seleziona ancora il testo, e il trascinamento non seleziona blocchi.

Sul telefono, l’editor non mostra maniglie dei blocchi né barra di selezione, e digitare `@` lascia un carattere normale. Mentre un editor ha il focus, una barra fluttuante resta sopra la tastiera e si nasconde quando la tastiera si chiude: **Inserisci un blocco** (+) elenca i blocchi di questo editor, nelle stesse sezioni del menu `/`, e inserisce quello scelto nel punto del cursore, come `/`; **Menziona** (@) elenca persone, ticket, obiettivi e pagine da menzionare, raggruppati per tipo; seguono **Grassetto**, **Corsivo**, **Barrato**, **Codice**, **Colore** (un pannello per il colore del testo o dello sfondo), **Aggiungi link**, **Riduci rientro** e **Aumenta rientro** in un elenco, **Commento** in una pagina e **Nascondi tastiera**, che resta fisso all’estremità destra. Un pannello inferiore in cui scrivi si allarga a tutta l’altezza dello schermo, e la riga che stai scrivendo resta sopra la tastiera. Una pressione prolungata seleziona il testo in un editor, e la barra e i suoi pannelli funzionano anche nel taccuino delle attività. La navigazione inferiore si nasconde mentre un campo di testo ha il focus, come il titolo di una pagina o un commento. Su uno schermo touch, **Aggiungi icona** è sempre visibile in una pagina.

### Trova e sostituisci in una pagina {#find-and-replace}

Quando una pagina è sullo schermo, Comando+F su macOS o Ctrl+F su Windows/Linux apre una barra di ricerca in alto a destra del documento, ovunque sia il cursore; in una pagina aperta nel pannello laterale, cerca in quella pagina. Il testo che avevi selezionato diventa la ricerca. Ogni risultato è evidenziato, quello corrente in modo più marcato, e la barra ne mostra la posizione, per esempio 2 di 7. Invio passa al risultato successivo e Maiusc+Invio al precedente; premere di nuovo Comando/Ctrl+F seleziona il testo cercato. **Maiuscole/minuscole**, **Parola intera** ed **Espressione regolare** affinano la ricerca; un’espressione non valida viene segnalata e non evidenzia nulla. La ricerca riguarda il corpo della pagina, non il suo titolo.

Se puoi modificare la pagina, **Mostra sostituzione** aggiunge un campo per il testo sostitutivo, con **Sostituisci**, che sostituisce il risultato corrente e passa al successivo, e **Sostituisci tutto**. In un’espressione regolare, i segnaposto da `$1` a `$9` inseriscono i gruppi trovati e `$&` l’intero risultato; una ricerca semplice inserisce il testo esattamente come l’hai digitato. Una sostituzione è una modifica normale: viene salvata e arriva agli altri editor come la digitazione, e Comando/Ctrl+Z la annulla, **Sostituisci tutto** in un solo passaggio. Esc chiude la barra e torna al testo. Il taccuino delle attività ha la stessa barra. Altrove in minddy, e quando un’altra finestra di dialogo è aperta sopra la pagina, Comando/Ctrl+F apre la ricerca del browser.

### Salvataggio e portabilità {#editor-save}

Una pagina si salva mentre scrivi: ogni modifica raggiunge il server in pochi istanti e l’indicatore di salvataggio mostra il salvataggio in corso finché il server non l’ha accettata. Più persone possono modificare la stessa pagina contemporaneamente, anche lo stesso paragrafo o il titolo. Le modifiche di ciascuno compaiono agli altri mentre scrive, così come quelle che Numo o un agente collegato tramite MCP apportano alla pagina.

Se la connessione si interrompe, tieni la pagina aperta. Le modifiche non salvate restano sulla pagina e vengono inviate al ritorno della connessione; nello stesso momento arrivano le modifiche degli altri, che si uniscono alle tue. minddy apre un’altra pagina solo quando le tue modifiche sono salvate: finché non possono essere inviate, ti tiene sulla pagina e segnala che il salvataggio non è riuscito. Chiudere una scheda del browser con modifiche non salvate ti chiede prima una conferma; uscire dall’app desktop non la chiede, e le modifiche non salvate vanno perse. Se perdi l’accesso alla pagina o il permesso di modificarla mentre ci sono modifiche non salvate, minddy le annulla e mostra un messaggio. Quando il server rifiuta una modifica, per esempio un titolo più lungo di 500 caratteri o un link con un protocollo non consentito, minddy annulla quella modifica e mostra un messaggio. La cronologia può aiutare a esaminare versioni salvate precedenti.

Le esportazioni Markdown e le letture delle pagine da parte degli agenti conservano icone e colori dei riquadri nella rappresentazione supportata. Anche un’immagine ridimensionata conserva la sua larghezza, scritta come titolo dell’immagine (`![alt](src "width=60%")`), quindi le modifiche di Numo, degli agenti MCP o del taccuino delle attività non la reimpostano. Gli agenti leggono e scrivono una menzione di pagina come `[@Title](mention:page/<id>)`; la forma precedente `[[page:<id>]]` è ancora accettata e letta come la stessa menzione, anche all’interno di una riga. Le equazioni viaggiano come LaTeX: `$E = mc^2$` all’interno di una riga e un blocco tra due righe `$$`. Un importo come `$5` resta testo. I formati di esportazione differiscono per fedeltà e gestione degli allegati: controlla il documento ottenuto prima di sostituire una fonte originale. Usa blocchi di codice per comandi letterali e mantieni prerequisiti e avvisi nel testo circostante.

## Discutere una pagina e gestire conflitti {#page-comments-and-collaboration}

Apri una pagina del progetto e i suoi controlli dei commenti. Seleziona il contenuto pertinente quando crei un commento ancorato, spiega la domanda o modifica proposta e usa le menzioni per coinvolgere un membro. Un lettore può commentare se il proprietario ha attivato **Può commentare** per lui. Rispondi nella discussione per mantenere la decisione con il contesto che riguarda. Risolvila quando la domanda è stata effettivamente affrontata. La discussione di un blocco si apre in una finestra di dialogo sul computer e in un pannello inferiore sul telefono, invece che accanto al blocco: mostra il passaggio citato, le discussioni esistenti con le loro risposte e un campo per un nuovo commento. Aprila dal badge dei commenti del blocco, da **Commento** nella barra di selezione o dal menu del blocco. Sul computer, passando il puntatore su un blocco senza commenti compare alla sua destra un pulsante **Commenta questo blocco**, all’altezza della maniglia del blocco; un blocco commentato mostra lì il suo badge dei commenti. Passando il puntatore su quel pulsante, il suo blocco viene evidenziato come una selezione. Questo pulsante non compare sul telefono.

Gli avatar di presenza identificano chi sta guardando la pagina. Mentre qualcuno modifica, il suo cursore e la sua selezione compaiono nel corpo e nel titolo, in un colore proprio e con il suo nome. Il cursore di un lettore non viene mostrato. Un cursore indica dove qualcuno sta lavorando, non che il suo testo sia salvato: l’indicatore di salvataggio riflette solo le tue modifiche.


![Attività della pagina ancora senza eventi e campo del commento vuoto.](/documentation/it/page-comments.png)

### Recuperare un conflitto di salvataggio {#page-conflict}

Le modifiche simultanee si uniscono automaticamente, carattere per carattere, anche all’interno dello stesso paragrafo. Un avviso di conflitto può comunque comparire quando minddy deve ricaricare la pagina mentre hai modifiche non salvate: dopo una disconnessione durante la quale sono state fatte molte modifiche, oppure dopo una modifica eseguita senza la modifica in tempo reale, come un’importazione in un database. Se le tue modifiche e la versione ricaricata hanno cambiato lo stesso blocco del primo livello, il documento conserva la versione ricaricata di quel blocco e l’avviso propone la tua da esaminare.

Confronta il blocco identificato con il documento attuale. Scegli di ripristinare la tua versione solo se intendi sostituire quel blocco con essa. Se l’azione in conflitto era un’eliminazione, l’opzione per eliminarlo di nuovo applica esplicitamente quella cancellazione. Chiudere l’avviso mantiene il documento adottato e rimuove l’avvertimento; non ripristina la tua versione. Conserva il testo desiderato prima di chiudere e usa la cronologia per esaminare le versioni salvate quando serve un recupero più ampio. Queste scelte riguardano il blocco identificato, senza sostituire alla cieca tutta la pagina.

Un’ancora può mancare dopo modifiche al documento: leggi la discussione prima di spostare o eliminare il blocco citato. Commenti e attività restano interni al progetto salvo pubblicazione esplicita dei contenuti attraverso un percorso supportato. Prova la pagina pubblicata per stabilire la vista effettiva del visitatore senza supporre che i controlli di collaborazione diventino pubblici.

## Allegare e recuperare file delle pagine {#page-files}

Apri la pagina come membro del progetto e usa i controlli di allegato o caricamento. Seleziona un file non vuoto entro il limite di 10 MB per file. La quota di spazio dell’account o dell’istanza può imporre un limite aggiuntivo. Mantieni l’originale fino alla riuscita del caricamento.

Le immagini possono essere inserite come blocchi immagine e gli altri documenti allegati come blocchi file. Il server determina il tipo di contenuto salvato dai byte, senza fidarsi del nome del file o dell’etichetta del browser. L’accettazione del caricamento non garantisce un’anteprima nella pagina per ogni formato; scarica il file quando l’anteprima non è disponibile.

Nell’editor del progetto, fai clic su un’immagine o sul nome di un blocco file supportato per aprire lo stesso visualizzatore a tutta finestra usato dagli allegati dei ticket. Markdown (`.md`), testo semplice (`.txt`, `.text`), CSV, PDF e formati audio o video supportati si aprono in contenitori dedicati. Usa Chiudi o Escape per tornare alla pagina. Il menu Azioni del file (`…`) offre Scarica. In una pagina modificabile, un blocco file offre anche Rinomina, che cambia il nome mostrato nella pagina, e immagini e file offrono Rimuovi: chiede conferma, rimuove il blocco dal documento e puoi annullarlo nell’editor. Il blocco file mantiene anche il comando diretto Scarica. I formati non supportati, i collegamenti a file esterni e i blocchi file nelle pagine pubblicate mantengono il comportamento di download. Le immagini pubblicate usano il visualizzatore senza l’azione di rimozione.

![Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica, Rinomina e Rimuovi.](/documentation/it/file-preview.png)

Verifica che il file compaia nella pagina e aprilo o scaricalo. I dati del file risiedono in Storage, mentre i metadati di pagina e file ne determinano l’accesso. Un salvataggio riuscito della pagina non dimostra da solo che i dati del file siano disponibili.

### File condivisi ed errori {#file-access}

Un file citato su una pagina pubblicata può essere reso disponibile ai suoi visitatori. I file di pagine fuori dal ramo pubblicato non diventano disponibili solo perché un’altra pagina li cita. Controlla la pagina e i discendenti inclusi prima di condividere.

Se il caricamento fallisce, controlla dimensione, quota e messaggio di errore. Un operatore di istanza autonoma deve anche verificare configurazione e policy di Storage. Se manca un file dopo un ripristino, recupera i corrispondenti dati di Storage e metadati; un ripristino del solo database non può ricrearlo. Gli URL dei file pubblicati vengono firmati per un massimo di 24 ore al momento del rendering della pagina. Revocare una condivisione interrompe le nuove visite autorizzate alla pagina, ma non invalida immediatamente gli URL dei file già forniti; possono restare utilizzabili fino alla scadenza. Le copie scaricate non possono essere ritirate.


![Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.](/documentation/it/page-file-states.png)

## Esaminare e ripristinare una versione di pagina {#page-history}

Apri l’indicatore di salvataggio o cronologia della pagina per vedere le versioni, oppure il controllo di commenti e attività per esaminare le azioni. Le schede rispondono a domande diverse: una versione salvata è uno stato del documento, mentre l’attività può includere rinominazioni, eliminazione o ripristino senza la stessa istantanea del contenuto.

Seleziona una versione per visualizzarla prima di ripristinare. La cronologia identifica autori e attività degli agenti: confronta il contenuto con la modifica da annullare. L’interfaccia annuncia una finestra di 30 giorni; non considerare la cronologia un backup esterno permanente.

### Ripristinare e verificare {#restore-page-version}

Come membro autorizzato del progetto, ripristina la versione selezionata solo dopo aver esaminato il contenuto attuale che sostituirà. Lo stato precedente al ripristino entra a sua volta nella cronologia, consentendo di recuperarlo più avanti finché è conservato.

Riapri o aggiorna l’editor dopo il ripristino e controlla il corpo effettivo della pagina. Un editor già aperto mantiene una versione superata e non deve sovrascrivere alla cieca lo stato ripristinato. Le versioni di pagina non sono backup completi dell’istanza: dati degli allegati, file eliminati e oggetti correlati possono avere cicli di vita separati. Usa le guide di recupero di file e operatori quando mancano informazioni esterne al corpo salvato.


![Scheda Versioni con uno stato precedente espanso, autore, Ripristina e avviso di conservazione per 30 giorni.](/documentation/it/page-history-preview.png)

## Pubblicare una pagina e revocarne il collegamento {#publish-a-page}

Apri una pagina del progetto come proprietario o come Membro e usa i controlli di pubblicazione. Esamina prima contenuto e allegati. Scegli accesso privato, protetto da password o pubblico. La password richiede almeno otto caratteri e viene applicata dopo l’invio; selezionare la modalità non crea da solo un collegamento protetto.

Copia il collegamento /p/ generato dopo la riuscita della pubblicazione. Se la pagina ha discendenti, controlla l’opzione per includerli e il loro numero. Includerli pubblica il ramo selezionato; escluderli lascia i contenuti fuori da quella pubblicazione. Un database senza discendenti pubblicati non espone automaticamente tutti i corpi delle voci.

Apri il collegamento in una sessione separata del browser senza il tuo account. Prova la password se attiva, il contenuto, le sottopagine previste e i download. Una menzione di una pagina dell’insieme pubblicato mostra il suo titolo e la apre con lo stesso link; una menzione di qualsiasi altra pagina mostra **Sottopagina non pubblicata** e non si apre. Questo verifica l’accesso in sola lettura del visitatore, non i tuoi permessi più ampi di membro.


![Finestra di pubblicazione con Privato selezionato e opzioni con password o link.](/documentation/it/page-publish.png)

### Revocare e controllare {#revoke-page}

Torna ai controlli di pubblicazione, scegli privato e conferma con **Annulla pubblicazione**: il vecchio collegamento smette di funzionare e pubblicando di nuovo si crea un nuovo collegamento. Dopo la revoca riuscita, apri il vecchio collegamento in modo anonimo e verifica che l’accesso sia negato. Copie o schermate già ricevute non possono essere ritirate. Gli URL di download dei file già forniti da una pagina pubblicata vengono firmati per un massimo di 24 ore. La revoca impedisce nuove visite alla pagina, ma quegli URL già emessi possono restare validi fino alla scadenza.

I collegamenti delle pagine degli utenti restano `noindex` e sono separati dal manuale ufficiale indicizzato. Noindex è una politica di scoperta, non una password. Se un discendente o file è leggibile inaspettatamente, revoca prima, controlla il ramo pubblicato e riprova prima di inoltrare un collegamento corretto. I file di pagine non pubblicate non ottengono accesso tramite un riferimento interno.

## Esportare o stampare una pagina {#import-export-and-print-pages}

Apri il menu del documento della pagina e scegli Esporta. Seleziona Markdown per una pagina (.md) o un ramo (.zip), PDF per aprire la vista di stampa oppure l’archivio di database se la pagina è un database. Controlla l’ambito proposto prima di confermare: una pagina, il suo ramo e un archivio di database contengono elementi diversi.

Apri l’esportazione e verifica i titoli, i riquadri di avviso, i collegamenti e gli allegati necessari al lettore. Nell’esportazione, le menzioni mostrano i titoli attuali delle pagine, e le menzioni delle pagine incluse nell’esportazione diventano collegamenti relativi. L’azione PDF apre una vista di stampa leggibile senza tutta la navigazione dell’applicazione. Usa i controlli di stampa del browser per stampare o salvare un PDF. Nel menu del documento non c’è un’azione di importazione generica. Le importazioni supportate si avviano da un database vuoto, come descritto nella [guida all’importazione dei database](/it/documentazione/databases#import-a-database).


![Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.](/documentation/it/page-export.png)

### Archivi di database e limiti {#export-fidelity}

Un archivio di database (.zip) include il suo ramo: Markdown e CSV, lo schema esatto e i colori delle opzioni, valori, contenuti, date e orari, pagine annidate e contenuti dei file. Importalo in un database nuovo e vuoto per ripristinare questa struttura. Le viste salvate del database non fanno parte dell’archivio: ricreale dopo l’importazione. Duplicare un database ne conserva le viste.

Un’esportazione non trasferisce password, credenziali dei provider di account o abbonamenti. Per spostare il lavoro di un account tra istanze, usa la guida al trasferimento dei dati dell’account. Se un formato importato non può mantenere un blocco o una proprietà esterna, controlla il risultato prima di usarlo come sostituto. Non eliminare l’originale solo perché è stato creato un file da scaricare.


## Routine per nuove voci {#entry-routines}

Il proprietario può scegliere questo database come attivatore in [Routine](/docs/scheduled-routines#conditions). Le condizioni usano le proprietà tipizzate della voce. Una voce vuota può attendere che vengano compilate. Creazione, duplicazione, importazione di database e spostamento consentito nel database contano come arrivi; il ripristino no. Eliminare una proprietà referenziata o cambiarne il tipo richiede la correzione del filtro della routine.
