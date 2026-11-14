---
{
  "id": "databases",
  "locale": "it",
  "title": "Database",
  "summary": "Crea un database, modifica valori e pagine delle voci, cambia lo schema e importa un database completo con le verifiche necessarie.",
  "topic": "Pagine e database",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts",
      "components/pages/database-table-scroll.tsx",
      "components/ui/checkbox.tsx",
      "lib/server/database-view-tools.ts",
      "lib/page-database-filters.ts",
      "components/pages/database-filter-editor.tsx",
      "supabase/migrations/20270109200092_page_database_views_realtime.sql",
      "components/pages/page-peek-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/global-page-panel.tsx",
      "lib/page-database-number.ts",
      "lib/page-database-schema-patch.ts",
      "lib/use-page-database.ts",
      "lib/undo/undo-context.tsx",
      "components/pages/database-choice.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/database-tool-schema.ts",
      "supabase/migrations/20270109200126_page_database_metadata_recurrence_formats.sql"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (MIN-990 changes mirrored from en revision 20; labels checked against messages/it.json; agent review, not human acceptance)",
    "language": "agent:claude-code (it translation of the changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Creare un database e le sue colonne",
    "Modificare valori e pagine delle voci di database",
    "Modificare lo schema di un database in sicurezza",
    "Importare un database con il contenuto delle sue voci"
  ],
  "figures": [
    {
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/it/database-setup-cards.png",
      "alt": "Anteprima del componente con le schede per configurare una nuova banca dati con Numo o importarne una esistente.",
      "caption": "Suggerimenti per una nuova banca dati con dati dimostrativi. Scegli Numo o l’importazione, oppure chiudi le schede per continuare manualmente.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-property-types.png",
      "alt": "Selettore del tipo di colonna con un campo di ricerca, testo, numero, selezioni, data, persone, casella di controllo e i quattro tipi in sola lettura.",
      "caption": "Scegli un tipo adatto ai valori da conservare.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        448,
        453
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-entry.png",
      "alt": "Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.",
      "caption": "Apri una voce per leggere il testo completo e modificare i valori in base al tipo.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-conversion-warning.png",
      "alt": "Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.",
      "caption": "Controlla il numero effettivo di celle incompatibili prima di confermare. Annulla conserva i valori attuali.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        282
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-import-review.png",
      "alt": "Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.",
      "caption": "Controlla le voci analizzate e il numero di colonne prima di importare nel database vuoto.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/it/database-options.png",
      "alt": "Anteprima del componente Modifica opzioni con stati in italiano, maniglie di trascinamento, cestini e la spiegazione dell’eliminazione.",
      "caption": "Modifica insieme nomi, colori e ordine delle opzioni. Trascina una maniglia per riordinare; il cestino rimuove un’opzione dalla bozza; Salva applica le modifiche. Sono mostrati dati dimostrativi.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/it/database-date-time.png",
      "alt": "Anteprima del selettore di data con il 24 luglio 2026 selezionato, Aggiungi un orario attivo e Orario impostato su 02:00 AM.",
      "caption": "Attiva Aggiungi un orario per inserire un orario. Questa anteprima del componente usa dati dimostrativi e il fuso orario del dispositivo.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        324,
        498
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Un database combina una tabella di proprietà strutturate con una pagina completa per ogni voce. Puoi creare colonne e modificare le voci manualmente oppure importare un database in una destinazione nuova e vuota. Prima di convertire una proprietà o eliminare una colonna, controlla quali valori saranno sostituiti o persi.

## Creare un database e le sue colonne {#create-a-database}

L’area di configurazione di una nuova banca dati offre due schede: **Crea con Numo** per preparare la struttura e **Importa un database esistente**. Il controllo di chiusura, etichettato **Nascondi la guida alla creazione**, nasconde queste proposte; la modifica manuale resta disponibile.

Come proprietario o Membro del progetto, apri Pagine, usa + e scegli un database. Un nuovo database ha il nome delle voci e nessuna colonna opzionale. Il banner «Nuovo database» offre la configurazione con Numo o l’importazione di un database esistente. La configurazione manuale resta disponibile senza IA. Scegliere **Crea con Numo** apre una richiesta preparata con questo database come contesto di pagina, dopo che la creazione è terminata. Controlla e invia la richiesta per chiedere la struttura necessaria; aprire la conversazione non completa la configurazione. Il lavoro effettivo dell’IA richiede un fornitore configurato e utilizzo disponibile oppure una chiave personale compatibile. Esamina lo schema e le voci risultanti prima di farvi affidamento.

Apri «Colonne» e scegli «Aggiungi colonna» oppure usa la colonna + sul bordo destro della tabella. Dai un nome alla colonna e scegli Testo, Numero, Selezione, Selezione multipla, Data, Persone, Casella di controllo, Data di creazione, Ultima modifica, Creato da o Ultima modifica di. Usa il selettore ricercabile per trovare il tipo. Salva, aggiungi una voce e verifica che la colonna appaia in tabella e nella pagina della voce.


![Anteprima del componente con le schede per configurare una nuova banca dati con Numo o importarne una esistente.](/documentation/it/database-setup-cards.png)

### Scegliere i tipi e rispettare i limiti {#database-types}

Un database supporta fino a 30 colonne di proprietà oltre al nome della voce. Selezione consente un’opzione; Selezione multipla ne consente diverse, fino a 100 opzioni per colonna. Le celle di testo supportano 2.000 caratteri. Numero accetta un valore scritto con il punto o la virgola, con separatori delle migliaia, un simbolo di valuta o il segno di percentuale, e rifiuta le lettere. Accetta anche un calcolo: scrivi `14 + 2` e la cella conserva 16. I calcoli ammettono `+`, `-`, `*`, `/`, `^` e le parentesi, e una percentuale al loro interno si applica a ciò che la precede: `80 + 20 %` dà 96.

Una colonna Numero adatta la visualizzazione a ciò che scrivi. Scrivi un importo con un simbolo o un codice di valuta, ad esempio `12 €`, `$40` o `40 CHF`, e tutta la colonna mostra importi in quella valuta. Scrivi un valore seguito dal segno di percentuale, ad esempio `25 %`, e la colonna mostra percentuali. Un numero semplice o un calcolo lasciano la colonna com’è. Per tornare ai numeri semplici, apri il menu dell’intestazione della colonna e scegli **Mostra come numero semplice**. Il formato cambia il modo in cui i valori vengono visualizzati, mai il numero salvato. Un numero semplice viene mostrato con i separatori delle migliaia a partire da cinque cifre, quindi un anno si legge ancora 2026.

Quattro tipi di colonna si compilano da soli a partire da ogni voce e non sono modificabili: Data di creazione e Ultima modifica mostrano quando la voce è stata creata e modificata l’ultima volta, Creato da e Ultima modifica di mostrano chi lo ha fatto. Una modifica fatta da Numo o da un agente MCP risulta fatta da minddy.

Persone seleziona membri del progetto, non indirizzi email arbitrari. I membri appena menzionati possono ricevere notifiche. Una voce di database è anche una pagina completa con normali contenuti, commenti e allegati.

Formule avanzate e automazioni non sono disponibili. Scegli una proprietà di testo o un documento collegato quando i dati non rientrano in un tipo supportato; non descrivere una formula non supportata come una colonna funzionante.


![Selettore del tipo di colonna con un campo di ricerca, testo, numero, selezioni, data, persone, casella di controllo e i quattro tipi in sola lettura.](/documentation/it/database-property-types.png)

## Modificare valori e pagine delle voci di database {#database-cells-and-entries}

Nell’editor delle opzioni, aggiungi un’opzione sotto le righe esistenti, anche quando l’elenco è vuoto. Assegna a ciascuna un nome distinto e non vuoto, poi salva. Funziona sia per la selezione singola sia per quella multipla.

Fai clic su una cella della tabella o sulla proprietà sopra il corpo di una voce. Enter salva, Escape annulla e Shift+Enter inserisce una riga di testo. Uscire dall’editor salva. Un numero non valido mantiene l’editor aperto finché non viene corretto; un salvataggio non riuscito ripristina il valore e segnala un errore.

Usa una cella Selezione per un’opzione o Selezione multipla per diverse opzioni. Cerca quelle esistenti o creane una dal menu. Apri «Modifica opzioni» da una cella, o dal menu dell’intestazione di una colonna Selezione o Selezione multipla (fai clic sul nome della colonna), per rinominare o cambiare colori, poi salva tutto insieme o annulla. Data, Persone e Casella di controllo usano i controlli corrispondenti; Data di creazione, Ultima modifica, Creato da e Ultima modifica di restano in sola lettura.

Le nuove opzioni ricevono un colore casuale della tavolozza che non è ancora usato nella colonna, sia quando le crei da una cella sia nella finestra delle opzioni. Una volta usati tutti e dieci i colori, possono ripetersi. Puoi comunque scegliere un colore manualmente.

In «Modifica opzioni», trascina la maniglia all’inizio di una riga per riordinare le opzioni. Da tastiera, porta il focus sulla maniglia, premi Spazio, sposta l’opzione con le frecce Su e Giù e premi di nuovo Spazio per rilasciarla; Esc annulla. Usa il cestino della riga per eliminare un’opzione. Salva applica insieme nomi, colori, ordine ed eliminazioni; se hai eliminato delle opzioni, prima le elenca e chiede di confermare con **Elimina e salva**. Una notifica propone poi **Annulla**, che ripristina le opzioni insieme ai valori che le usavano. Un’opzione eliminata viene rimossa da tutte le voci che la usano, comprese quelle nel cestino; le altre opzioni selezionate vengono mantenute. Annulla scarta le modifiche della bozza.

Scegli un giorno in Data. Per includere un’ora, attiva Aggiungere un’ora e compila Tempo. Il valore viene salvato durante la modifica e il selettore rimane aperto. I valori con un’ora vengono visualizzati nel fuso orario del dispositivo, compresa la mezzanotte. Disattivando Aggiungere un’ora, il giorno visualizzato viene mantenuto come data senza ora. I filtri di data corrispondono al giorno visualizzato.

Una data può ripetersi, come la scadenza di un ticket. Nel selettore di data, scegli **Ricorrente** invece di **Una volta**, poi un ritmo: ogni giorno, settimana, mese o anno. La cella mostra un’icona di ripetizione e la prossima occorrenza, che avanza da sola una volta passato il giorno; l’ordinamento e i filtri usano quell’occorrenza. Scegli **Una volta** per tornare a una data singola.

![Anteprima del componente Modifica opzioni con stati in italiano, maniglie di trascinamento, cestini e la spiegazione dell’eliminazione.](/documentation/it/database-options.png)

![Anteprima del selettore di data con il 24 luglio 2026 selezionato, Aggiungi un orario attivo e Orario impostato su 02:00 AM.](/documentation/it/database-date-time.png)

### Aprire, selezionare e inserire voci {#entry-actions}

Il contenuto di una voce vuota mostra un segnaposto per individuare l’area di scrittura. La duplicazione dalle azioni di riga o da una selezione di più righe richiede conferma prima di creare le copie. Anche lo spostamento nel cestino richiede conferma e consente il recupero, senza eliminare definitivamente le voci.

Apri una voce per modificarne la pagina completa in un pannello flottante. «Espandi» la apre come pagina completa dopo la fine dei salvataggi del documento in attesa. Se il salvataggio fallisce, il pannello resta aperto per risolverlo. L’intestazione del pannello ha anche il menu **Opzioni di pagina** (`…`) della voce, tra «Espandi» e la chiusura; spostare la voce nel cestino da lì chiude il pannello e lascia la tabella al suo posto. Una voce vuota resta nel database finché non viene eliminata.

Usa le caselle delle righe per selezionare e Shift-clic per un intervallo. Il suggerimento di ogni casella indica **Seleziona** o **Deseleziona**. La casella dell’intestazione (**Seleziona tutte le voci**, oppure **Deseleziona tutto** quando sono tutte selezionate) mostra un trattino quando è selezionata solo una parte delle voci e un segno di spunta quando lo sono tutte; un clic su di essa da una selezione parziale seleziona tutte le voci. Passa il puntatore su una riga per mostrarne il margine: la maniglia apre il menu della voce e può riordinare le voci in ordine manuale, e il + inserisce sotto la voce; Option/Alt inserisce sopra. L’inserimento adiacente rimuove i filtri della vista attiva per rendere visibile la nuova voce. Le voci spuntate aprono la barra di selezione mobile: scegli **Azioni**, o premi Command+K su macOS o Ctrl+K sugli altri sistemi, per promuoverle a ticket, **Duplica** o **Sposta nel cestino**, ognuna dopo la sua conferma, e **Chiedi a Numo** apre Numo con tutte le voci spuntate nel suo contesto. Su uno schermo touch le righe non hanno margine e le loro caselle restano visibili; la stessa barra di selezione agisce sulle voci spuntate, e lo spostamento di una voce in alto o in basso non è disponibile lì.

Il menu della maniglia di una singola voce inizia con **Apri pagina**, poi offre ciò che la barra laterale offre per qualsiasi pagina: **Aggiungi una sottopagina**, **Aggiungi ai preferiti**, **Copia**, **Promuovi a ticket**, **Pubblica…** ed **Esporta**, seguiti da **Duplica** e **Sposta nel cestino**. Un lettore vede **Apri pagina**, **Copia** ed **Esporta**. Quando il menu riguarda più righe selezionate, conserva **Duplica** e **Sposta nel cestino**.

Da quel menu, il proprietario o un Membro può scegliere **Promuovi a ticket** perché Numo trasformi quella voce, il suo contenuto e le sue proprietà in un ticket. La voce resta nel database. Quando il menu riguarda più righe selezionate, promuovile invece da **Azioni** nella barra di selezione: un’unica conversazione con Numo crea un ticket per voce. La [guida alle pagine](/it/documentazione/pages#promote-page-to-issue) descrive le domande di Numo e cosa fare se la voce non può essere salvata prima.

### Viste del database {#database-display}

Un database mostra le sue voci attraverso viste, elencate sopra la tabella. Ogni vista conserva il proprio ordinamento, il proprio filtro e le proprie colonne nascoste, e tutti i membri del progetto vedono le stesse viste. Il proprietario o un Membro aggiunge una vista con **Nuova vista** (+), che parte dalla vista mostrata, fa clic destro su una vista per scegliere **Rinomina vista** o **Elimina vista**, e trascina le viste per riordinarle. Le modifiche a ordinamento, filtro e colonne vengono salvate nella vista attiva per tutti. Un database conserva almeno una vista; prima della sua prima modifica mostra la vista predefinita **Tabella**. I lettori passano da una vista all’altra e possono regolarne una per sé finché non lasciano la pagina. Il browser ricorda l’ultima vista aperta; la ricerca non viene mai salvata. L’ordine manuale è condiviso con l’albero delle pagine. Scorri orizzontalmente con un gesto del trackpad, Shift e rotella del mouse o la barra di scorrimento in fondo alla finestra. Uno schermo touch non mostra questa barra: scorri la tabella con il dito. Un’anteprima tagliata non accorcia il testo salvato. Le voci con valori di colonne si possono riordinare nel proprio database, ma non spostare fuori. Numo può elencare le viste di un database e, su tua richiesta, crearle, rinominarle, riordinarle o eliminarle (mai l’ultima), oppure cambiarne ordinamento, filtri (tutti o almeno uno) e colonne nascoste. Nella pagina di un database, Numo intende «una vista» come una vista del database, non della bacheca dei ticket. L’ordine delle colonne non fa parte di una vista: appartiene allo schema del database. I client minddy MCP non possono gestire le viste.

Apri **Ordina per** per scegliere una colonna, poi una direzione formulata in base a ciò che la colonna contiene: **Dalla A alla Z** o **Dalla Z alla A** per testo e persone, **Prima opzione per prima** o **Ultima opzione per prima** per una colonna Selezione o Selezione multipla, che viene ordinata secondo l’ordine delle sue opzioni, **Dal più piccolo** o **Dal più grande** per un numero, **Dal meno recente** o **Dal più recente** per una data, **Non selezionate prima** o **Selezionate prima** per una casella di controllo, e **Dall’alto in basso** o **Dal basso in alto** per l’ordine manuale. Gli elenchi di colonne di **Ordina per** e **Filtra** mostrano l’icona del tipo di ciascuna colonna.

Trascina il bordo destro dell’intestazione di una colonna per impostarne la larghezza; fai doppio clic su quel bordo per tornare alla larghezza predefinita. Sotto una colonna Numero, passa il puntatore sul fondo della tabella e scegli **Calcola** per mostrare **Somma**, **Media**, **Minimo**, **Massimo** o **Conteggio** delle voci che la vista mantiene. Larghezze e calcoli vengono salvati con la vista, come l’ordinamento e i filtri.

Apri **Filtra** per comporre un elenco di condizioni con **Aggiungi un filtro**; **Rimuovi questo filtro** ne elimina una. Ogni condizione sceglie una colonna, una condizione e un valore, e le condizioni dipendono dal tipo di colonna. Testo offre contiene, non contiene, è, non è, è vuoto e non è vuoto. Numero offre è, non è, maggiore di, minore di, è vuoto e non è vuoto. Selezione offre è, non è, è vuoto e non è vuoto. Selezione multipla e Persone offrono contiene, non contiene, è vuoto e non è vuoto. Data, Data di creazione e Ultima modifica offrono è il, è dopo, è prima, è vuoto e non è vuoto. Creato da e Ultima modifica di offrono è e non è, con un membro del progetto. Casella di controllo corrisponde a **Selezionata** o **Non selezionata**. Una condizione senza valore non filtra ancora. Con due o più condizioni, scegli **Tutti i filtri** per mantenere le voci che soddisfano ogni condizione, oppure **Almeno un filtro** per quelle che ne soddisfano almeno una. Una vista contiene fino a 10 condizioni; una vista salvata in precedenza con un solo filtro lo conserva.

Le viste si aggiornano in tempo reale: una vista che un membro del team o Numo crea o modifica compare senza ricaricare la pagina. Finché un database non ha viste salvate, fai clic destro sulla vista predefinita per scegliere **Rinomina vista**: la rinomina la salva come vista con nome con le impostazioni attuali, e **Elimina vista** resta non disponibile.

Sul telefono, scegli una vista dal menu a discesa sopra la tabella; il suo menu offre **Nuova vista**, **Rinomina vista** ed **Elimina vista**. La barra degli strumenti mostra solo la ricerca, **Impostazioni della vista** e **Nuovo**. **Impostazioni della vista** apre un pannello con **Ordina per**, **Filtra** e **Colonne**, ognuno dei quali apre un proprio pannello. La ricerca apre un campo sotto la barra degli strumenti, con un pulsante per chiuderlo. La tabella occupa tutta la larghezza, con righe più alte e caselle sempre visibili. Le celle di testo e numero si aprono in un pannello inferiore con un pulsante **Salva**, come già fanno selezioni, persone e date.

Un database aperto nel pannello laterale, da una menzione, un rimando inverso, una pagina allegata a un ticket o un collegamento in un commento, usa questa barra degli strumenti compatta anche sul computer: l’elenco a discesa delle viste, il cui menu offre **Nuova vista**, **Rinomina vista** ed **Elimina vista**, poi la ricerca, **Impostazioni della vista** e **Nuovo**. La ricerca apre un campo in un popover. **Impostazioni della vista** apre un menu: **Ordina per** mostra le colonne e la direzione dell’ordinamento in un sottomenu, mentre **Filtra** e **Colonne** aprono ciascuno il proprio popover sotto il pulsante. La tabella scorre in orizzontale all’interno del pannello, con una propria barra di scorrimento. Una voce aperta da quella tabella ne prende il posto nel pannello; **Indietro**, in alto a sinistra nel pannello, torna alla tabella, ed **Espandi** apre come pagina intera ciò che il pannello mostra.


![Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.](/documentation/it/database-entry.png)

### Annullare e ripetere {#database-undo}

Premi ⌘Z (Ctrl+Z su Windows e Linux) per annullare la tua ultima modifica in un database, e ⌘⇧Z (Ctrl+Shift+Z) per ripeterla. Questo vale per il valore di una cella, una colonna aggiunta, rinominata, riordinata, convertita in un altro tipo o eliminata, le opzioni modificate, una voce creata, duplicata, riordinata o spostata nel cestino, e le impostazioni di una vista: ordinamento, filtri, colonne nascoste, larghezze delle colonne e calcoli. Annullare l’eliminazione di una colonna o di un’opzione ripristina i valori che aveva rimosso. Una modifica applicata a più voci selezionate si annulla in un solo passaggio.

La cronologia appartiene alla scheda aperta e contiene le tue modifiche: si perde quando ricarichi la pagina ed esclude le modifiche fatte dai membri del team, da Numo o da un agente MCP. Quando il cursore è in un campo di testo o nel corpo di una pagina, gli stessi tasti annullano invece la digitazione. Se nel frattempo qualcun altro ha modificato lo stesso valore, l’annullamento viene rifiutato e la tabella mostra il valore attuale.

## Modificare lo schema di un database in sicurezza {#change-a-database-schema}

Il trascinamento di una colonna inizia dopo un movimento del puntatore e resta orizzontale. Il cursore di presa compare solo durante il trascinamento; un clic normale continua ad aprire le azioni della colonna. Con il focus sull’intestazione di una colonna, Invio o Spazio apre le azioni. Premi F8 per iniziare il riordino, usa Sinistra o Destra, quindi Invio per confermare o Esc per annullare.

In Colonne, usa il controllo con l’occhio per mostrare o nascondere le proprietà e trascina la maniglia di una riga di questo elenco per riordinare le colonne. Da tastiera, porta il focus sulla maniglia, premi Spazio, sposta la colonna con le frecce Su e Giù e premi di nuovo Spazio per rilasciarla; Esc annulla. Fai clic o clic destro su un’intestazione per aprirne il menu, per esempio per rinominare la colonna, oppure trascina le intestazioni per riordinarle. La colonna con il nome della voce rimane per prima. Puoi modificare le opzioni di Selezione o Selezione multipla dal menu della cella o da Colonne; nomi e colori vengono salvati insieme.

Nascondere una colonna cambia le preferenze di visualizzazione e mantiene i valori. Per eliminare una colonna personalizzata, scegli **Elimina colonna** nel menu della sua intestazione o il suo pulsante cestino in Colonne; entrambi chiedono conferma. L’eliminazione rimuove invece i suoi valori da tutte le voci. Una notifica propone poi **Annulla**, e l’[annullamento](#database-undo) recupera la colonna e i suoi valori finché la pagina resta aperta; dopo, l’eliminazione è definitiva.

### Convertire il tipo di una proprietà {#convert-column}

Scegli Modifica colonna per una proprietà personalizzata e seleziona il nuovo tipo. La finestra converte i valori esistenti al salvataggio. Se alcuni valori non sono compatibili, l’avviso indica quante celle verranno svuotate. Prosegui solo se accetti di perdere quei valori, oppure annulla per mantenere il tipo precedente e tutti i valori.

Il passaggio a Data di creazione, Ultima modifica, Creato da o Ultima modifica di sostituisce i valori esistenti con ciò che minddy registra per ogni voce e mostra prima un avviso. Dopo la conversione, controlla alcune voci rappresentative, soprattutto quando un numero, una selezione o una data potrebbero essere interpretati diversamente.

Numo e gli agenti MCP leggono e scrivono le stesse colonne: possono aggiungere le colonne in sola lettura, impostare un formato numerico e scrivere una data ricorrente. Le modifiche allo schema eseguite da un agente usano la revisione attuale del database e un token per l’anteprima della conversione. Le modifiche simultanee invalidano l’anteprima. Rileggi lo stato attuale e genera una nuova anteprima invece di forzare una conversione obsoleta. Per svuotare i valori incompatibili serve una conferma esplicita.


![Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.](/documentation/it/database-conversion-warning.png)

## Importare un database con il contenuto delle sue voci {#import-a-database}

Crea un database senza colonne facoltative né voci esistenti. Dal banner del nuovo database, scegli **Importa un database esistente**. Carica uno ZIP di Notion in formato Markdown & CSV con sottopagine, il CSV di un database oppure un archivio di database minddy. Se l’archivio contiene più database, seleziona quello da importare.

Prima di confermare, controlla i nomi e i tipi di colonna suggeriti e poi il numero di pagine. Se l’assistenza all’importazione è configurata, Numo può suggerire i tipi da un piccolo campione; puoi comunque impostare la corrispondenza manualmente. Le proprietà di origine non supportate rimangono come testo. I valori incompatibili bloccano l’importazione anziché essere cancellati senza avviso.

### Cosa viene mantenuto e cosa controllare {#database-import-result}

L’importazione include i contenuti delle voci, i documenti annidati e i file locali presenti nell’archivio. Un archivio minddy mantiene anche lo schema esatto e i colori delle opzioni e rimappa i collegamenti interni a pagine e file. Le persone possono essere associate ai membri del progetto di destinazione. Un’esportazione di Notion non contiene lo schema originale, i colori delle opzioni o le definizioni delle formule: queste informazioni mancanti non possono essere recuperate.

Gli archivi possono contenere al massimo 20 MB compressi, 50 MB estratti, 1.000 pagine e 100 allegati. Ogni allegato mantiene il limite di 10 MB previsto per i file delle pagine. La scrittura nel database è transazionale. Riprovare lo stesso tentativo nella finestra ancora aperta mantiene il suo identificativo di richiesta, quindi un tentativo già completato viene restituito senza duplicare le righe. Caricare un altro file o aprire una nuova finestra può creare un tentativo diverso. Se il risultato della rete è incerto, esamina la destinazione prima di ricominciare; un database già popolato non soddisfa più il requisito di una destinazione vuota.

Dopo il completamento, controlla alcune voci, i valori, le pagine annidate e gli allegati. Conserva l’archivio originale finché la verifica non è conclusa. Se l’importazione fallisce, leggi il primo errore e correggi il formato o la corrispondenza prima di riprovare. Non compilare manualmente il database di destinazione presumendo che continui a soddisfare il requisito di essere vuoto.


![Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.](/documentation/it/database-import-review.png)


## Routine per nuove voci {#entry-routines}

Il proprietario può scegliere questo database come attivatore in [Routine](/docs/scheduled-routines#conditions). Le condizioni usano le proprietà tipizzate della voce. Una voce vuota può attendere che vengano compilate. Creazione, duplicazione, importazione di database e spostamento consentito nel database contano come arrivi; il ripristino no. Eliminare una proprietà referenziata o cambiarne il tipo richiede la correzione del filtro della routine.
