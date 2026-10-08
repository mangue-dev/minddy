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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-property-types.png",
      "alt": "Selettore del tipo di colonna con testo, numero, selezioni, date, persone e casella di controllo.",
      "caption": "Scegli un tipo adatto ai valori da conservare.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-entry.png",
      "alt": "Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.",
      "caption": "Apri una voce per leggere il testo completo e modificare i valori in base al tipo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-conversion-warning.png",
      "alt": "Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.",
      "caption": "Controlla il numero effettivo di celle incompatibili prima di confermare. Annulla conserva i valori attuali.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-import-review.png",
      "alt": "Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.",
      "caption": "Controlla le voci analizzate e il numero di colonne prima di importare nel database vuoto.",
      "revision": 5,
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
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Un database organizza pagine come voci con proprietà strutturate. Puoi definirne le colonne, modificare valori e contenuti e adattare lo schema. Le conversioni richiedono di controllare l’anteprima; l’importazione di un archivio completo parte da un database nuovo e vuoto.

## Creare un database e le sue colonne {#create-a-database}

Come membro del progetto, apri Pagine, usa + e scegli un database. Un nuovo database ha il nome delle voci e nessuna colonna opzionale. Il banner «Nuovo database» offre la configurazione con Numo o l’importazione di un database esistente. La configurazione manuale resta disponibile senza IA. Scegliere la configurazione con Numo apre una richiesta preparata con questo database come contesto di pagina, dopo che la creazione è terminata. Controlla e invia la richiesta per chiedere la struttura necessaria; aprire la conversazione non completa la configurazione. Il lavoro effettivo dell’IA richiede un fornitore configurato e utilizzo disponibile oppure una chiave personale compatibile. Esamina lo schema e le voci risultanti prima di farvi affidamento.

Apri «Colonne» e scegli «Aggiungi colonna» oppure usa la colonna + sul bordo destro della tabella. Dai un nome alla colonna e scegli Testo, Numero, Selezione, Selezione multipla, Data di creazione, Data, Persone o Casella di controllo. Usa il selettore ricercabile per trovare il tipo. Salva, aggiungi una voce e verifica che la colonna appaia in tabella e nella pagina della voce.

### Scegliere i tipi e rispettare i limiti {#database-types}

Un database supporta fino a 30 colonne di proprietà oltre al nome della voce. Selezione consente un’opzione; Selezione multipla ne consente diverse, fino a 100 opzioni per colonna. Le celle di testo supportano 2.000 caratteri. Numero accetta decimali con segno, punto o virgola e rifiuta lettere. Data di creazione è il timestamp originale della voce e non è modificabile.

Persone seleziona membri del progetto, non indirizzi email arbitrari. I membri appena menzionati possono ricevere notifiche. Una voce di database è anche una pagina completa con normali contenuti, commenti e allegati.

Formule avanzate, automazioni e viste aggiuntive non sono disponibili. Scegli una proprietà di testo o un documento collegato quando i dati non rientrano in un tipo supportato; non descrivere una formula non supportata come una colonna funzionante.


![Selettore del tipo di colonna con testo, numero, selezioni, date, persone e casella di controllo.](/documentation/it/database-property-types.png)

## Modificare valori e pagine delle voci di database {#database-cells-and-entries}

Fai clic su una cella della tabella o sulla proprietà sopra il corpo di una voce. Enter salva, Escape annulla e Shift+Enter inserisce una riga di testo. Uscire dall’editor salva. Un numero non valido mantiene l’editor aperto finché non viene corretto; un salvataggio non riuscito ripristina il valore e segnala un errore.

Usa una cella Selezione per un’opzione o Selezione multipla per diverse opzioni. Cerca quelle esistenti o creane una dal menu. Apri «Modifica opzioni» per rinominare o cambiare colori, poi salva tutto insieme o annulla. Data, Persone e Casella di controllo usano i controlli corrispondenti; Data di creazione resta in sola lettura.

### Aprire, selezionare e inserire voci {#entry-actions}

Apri una voce per modificarne la pagina completa in un pannello flottante. «Espandi» la apre come pagina completa dopo la fine dei salvataggi del documento in attesa. Se il salvataggio fallisce, il pannello resta aperto per risolverlo. Una voce vuota resta nel database finché non viene eliminata.

Usa le caselle delle righe per selezionare e Shift-clic per un intervallo. La maniglia apre le azioni e può riordinare le voci in ordine manuale. Il + nel margine inserisce sotto una voce; Option/Alt inserisce sopra. L’inserimento adiacente torna all’ordine manuale e rimuove i filtri per rendere visibile la nuova voce.

### Preferenze di visualizzazione {#database-display}

Cerca, filtra, ordina e nascondi colonne nell’unica vista elenco. Queste preferenze vengono ricordate sul dispositivo; l’ordine manuale è condiviso con l’albero delle pagine. Scorri orizzontalmente con un gesto del trackpad, Shift e rotella del mouse, tocco o barra inferiore. Un’anteprima tagliata non accorcia il testo salvato. Le voci con valori di colonne si possono riordinare nel proprio database, ma non spostare fuori.


![Voce dimostrativa con descrizione, durata 2.5, casella selezionata e selezione vuota.](/documentation/it/database-entry.png)

## Modificare lo schema di un database in sicurezza {#change-a-database-schema}

In Colonne, usa il controllo con l’occhio per mostrare o nascondere le proprietà. Fai clic su un’intestazione per rinominarla oppure trascina le intestazioni per riordinarle. La colonna con il nome della voce rimane per prima. Puoi modificare le opzioni di Selezione o Selezione multipla dal menu della cella o da Colonne; nomi e colori vengono salvati insieme.

Nascondere una colonna cambia le preferenze di visualizzazione e mantiene i valori. Eliminare una colonna personalizzata rimuove invece i suoi valori da tutte le voci e non può essere annullato. Considera questa conseguenza prima di confermare l’eliminazione.

### Convertire il tipo di una proprietà {#convert-column}

Scegli Modifica colonna per una proprietà personalizzata e seleziona il nuovo tipo. La finestra converte i valori esistenti al salvataggio. Se alcuni valori non sono compatibili, l’avviso indica quante celle verranno svuotate. Prosegui solo se accetti di perdere quei valori, oppure annulla per mantenere il tipo precedente e tutti i valori.

Il passaggio a Data di creazione usa la data di creazione originale di ogni voce e mostra un avviso prima di sostituire i valori esistenti. Dopo la conversione, controlla alcune voci rappresentative, soprattutto quando un numero, una selezione o una data potrebbero essere interpretati diversamente.

Le modifiche allo schema eseguite da un agente usano la revisione attuale del database e un token per l’anteprima della conversione. Le modifiche simultanee invalidano l’anteprima. Rileggi lo stato attuale e genera una nuova anteprima invece di forzare una conversione obsoleta. Per svuotare i valori incompatibili serve una conferma esplicita.


![Avviso di conversione: il passaggio da Testo a Numero svuota una cella incompatibile, con pulsanti per annullare o confermare.](/documentation/it/database-conversion-warning.png)

## Importare un database con il contenuto delle sue voci {#import-a-database}

Crea un database senza colonne facoltative né voci esistenti. Dal banner del nuovo database, scegli Importa un database esistente. Carica uno ZIP di Notion in formato Markdown & CSV con sottopagine, il CSV di un database oppure un archivio di database Minddy. Se l’archivio contiene più database, seleziona quello da importare.

Prima di confermare, controlla i nomi e i tipi di colonna suggeriti e poi il numero di pagine. Se l’assistenza all’importazione è configurata, Numo può suggerire i tipi da un piccolo campione; puoi comunque impostare la corrispondenza manualmente. Le proprietà di origine non supportate rimangono come testo. I valori incompatibili bloccano l’importazione anziché essere cancellati senza avviso.

### Cosa viene mantenuto e cosa controllare {#database-import-result}

L’importazione include i contenuti delle voci, i documenti annidati e i file locali presenti nell’archivio. Un archivio Minddy mantiene anche lo schema esatto e i colori delle opzioni e rimappa i collegamenti interni a pagine e file. Le persone possono essere associate ai membri del progetto di destinazione. Un’esportazione di Notion non contiene lo schema originale, i colori delle opzioni o le definizioni delle formule: queste informazioni mancanti non possono essere recuperate.

Gli archivi possono contenere al massimo 20 MB compressi, 50 MB estratti e 1.000 pagine. Ogni allegato mantiene il limite di 10 MB previsto per i file delle pagine. La scrittura nel database è transazionale. Riprovare lo stesso tentativo nella finestra ancora aperta mantiene il suo identificativo di richiesta, quindi un tentativo già completato viene restituito senza duplicare le righe. Caricare un altro file o aprire una nuova finestra può creare un tentativo diverso. Se il risultato della rete è incerto, esamina la destinazione prima di ricominciare; un database già popolato non soddisfa più il requisito di una destinazione vuota.

Dopo il completamento, controlla alcune voci, i valori, le pagine annidate e gli allegati. Conserva l’archivio originale finché la verifica non è conclusa. Se l’importazione fallisce, leggi il primo errore e correggi il formato o la corrispondenza prima di riprovare. Non compilare manualmente il database di destinazione presumendo che continui a soddisfare il requisito di essere vuoto.


![Verifica di un CSV locale: due pagine di voci e due colonne, con il pulsante Importa database.](/documentation/it/database-import-review.png)
