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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-comment-popover.tsx",
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
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-editor.png",
      "alt": "Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.",
      "caption": "Titoli, blocchi di attività e la menzione AUR-2 organizzano la pagina. Il contenuto è un esempio dimostrativo.",
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
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-comments.png",
      "alt": "Attività della pagina con una modifica dimostrativa e campo del commento vuoto.",
      "caption": "Leggi l’attività e scrivi un commento nel campo. In questo esempio non è stato inviato alcun commento.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-file-states.png",
      "alt": "Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.",
      "caption": "Controlla lo stato effettivo del file: il secondo allegato è disponibile, il primo caricamento incompleto no.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-history-preview.png",
      "alt": "Scheda Versioni con uno stato precedente espanso, autore, Ripristina e avviso di conservazione per 30 giorni.",
      "caption": "Esamina l’anteprima di uno stato salvato e confrontalo con la pagina attuale prima di ripristinarlo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-publish.png",
      "alt": "Finestra di pubblicazione con Privato selezionato e opzioni con password o link.",
      "caption": "Privato mantiene la pagina nel progetto. Controlla chi deve leggerla prima di cambiare la pubblicazione.",
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
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-export.png",
      "alt": "Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.",
      "caption": "Scegli Markdown per scaricare il documento oppure Stampa / PDF per aprire la vista di stampa.",
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
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
  ]
}
---

Le pagine conservano documenti, file e discussioni del progetto. Qui trovi organizzazione, editor, collaborazione, cronologia, pubblicazione ed esportazione. Il menu del documento non offre un’importazione generica: un archivio di database si importa in un database nuovo e vuoto, come descritto nella guida ai database.

## Costruire un wiki di progetto {#create-and-organize-pages}

Apri Pagine in un progetto di cui sei membro. Usa il menu + e scegli una pagina per un documento o un database per un elenco strutturato. Dai alla pagina un titolo utile e scrivi la specifica, decisione o procedura che deve conservare.

Crea sottopagine per documenti correlati e usa i controlli dell’albero per spostarle o riordinarle. Una pagina non può diventare discendente di sé stessa. Duplicare una pagina crea nuovi contenuti, non un riferimento aggiornato all’originale. Controlla il ramo duplicato prima di modificarlo o condividerlo.

### Preferiti ed eliminazione {#page-tree}

Segna una pagina come preferita per mostrarla in cima all’albero del progetto. Questi preferiti sono condivisi nel progetto, diversamente da una nota privata del taccuino. Collega una pagina a un ticket quando il documento attuale è il contesto dell’attività; il titolo della risorsa segue le rinominazioni della pagina.

L’eliminazione sposta nel cestino le pagine per cui è previsto il recupero. Controlla il ramo selezionato prima di eliminare e usa il recupero invece di ricreare una pagina persa quando il contenuto va conservato. Le voci con valori di database memorizzati si possono riordinare nel proprio database, ma non spostare fuori. Se uno spostamento viene rifiutato, esamina gerarchia e tipo di voce invece di forzarlo con tentativi ripetuti.


![Menu di creazione con Nuova pagina e Nuovo database.](/documentation/it/page-create-menu.png)

## Scrivere una pagina con blocchi e menzioni {#page-editor}

Apri la pagina e modifica titolo o corpo come membro del progetto. Usa il menu dei comandi con barra e i controlli di formattazione per inserire titoli, paragrafi, elenchi, attività, codice, sezioni espandibili e riquadri informativi. Un riquadro può avere un’icona emoji e un colore della palette; sceglili per distinguere informazioni utili, non come unico modo di comunicare un avviso.

Usa le menzioni per collegare ticket, obiettivi, persone o pagine pertinenti. I rimandi inversi aiutano i lettori a trovare pagine che citano quella attuale. Un collegamento fornisce contesto, non accesso a un oggetto privato di un altro progetto.


![Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.](/documentation/it/page-editor.png)

### Salvataggio e portabilità {#editor-save}

Controlla l’indicatore di salvataggio prima di lasciare una modifica importante. Se un’altra modifica crea un conflitto, usa i controlli di recupero mostrati e conserva il testo; non supporre che entrambe siano state unite. La cronologia può aiutare a esaminare versioni salvate precedenti.

Le esportazioni Markdown e le letture delle pagine da parte degli agenti conservano icone e colori dei riquadri nella rappresentazione supportata. I formati di esportazione differiscono per fedeltà e gestione degli allegati: controlla il documento ottenuto prima di sostituire una fonte originale. Usa blocchi di codice per comandi letterali e mantieni prerequisiti e avvisi nel testo circostante.

## Discutere una pagina e gestire conflitti {#page-comments-and-collaboration}

Apri una pagina del progetto e i suoi controlli dei commenti. Seleziona il contenuto pertinente quando crei un commento ancorato, spiega la domanda o modifica proposta e usa le menzioni per coinvolgere un membro. Rispondi nella discussione per mantenere la decisione con il contesto che riguarda. Risolvila quando la domanda è stata effettivamente affrontata.

Gli avatar di presenza identificano chi sta guardando la pagina. Non dimostrano che il testo non salvato di un’altra persona sia arrivato al server né che modifiche simultanee siano unite automaticamente. Controlla lo stato di salvataggio prima di uscire.


![Attività della pagina con una modifica dimostrativa e campo del commento vuoto.](/documentation/it/page-comments.png)

### Recuperare un conflitto di salvataggio {#page-conflict}

minddy unisce le modifiche a blocchi diversi del primo livello del documento quando può conservare entrambi i cambiamenti. Non unisce carattere per carattere modifiche simultanee all’interno dello stesso blocco. Se entrambe le persone hanno modificato quel blocco, il documento conserva la versione remota e un avviso propone il tuo blocco precedente da esaminare.

Confronta il blocco identificato con il documento attuale. Scegli di ripristinare la tua versione solo se intendi sostituire quel blocco con essa. Se l’azione in conflitto era un’eliminazione, l’opzione per eliminarlo di nuovo applica esplicitamente quella cancellazione. Chiudere l’avviso mantiene il documento adottato e rimuove l’avvertimento; non ripristina la tua versione. Conserva il testo desiderato prima di chiudere e usa la cronologia per esaminare le versioni salvate quando serve un recupero più ampio. Queste scelte riguardano il blocco identificato, senza sostituire alla cieca tutta la pagina.

Un’ancora può mancare dopo modifiche al documento: leggi la discussione prima di spostare o eliminare il blocco citato. Commenti e attività restano interni al progetto salvo pubblicazione esplicita dei contenuti attraverso un percorso supportato. Prova la pagina pubblicata per stabilire la vista effettiva del visitatore senza supporre che i controlli di collaborazione diventino pubblici.

## Allegare e recuperare file delle pagine {#page-files}

Apri la pagina come membro del progetto e usa i controlli di allegato o caricamento. Seleziona un file non vuoto entro il limite di 10 MB per file. La quota di spazio dell’account o dell’istanza può imporre un limite aggiuntivo. Mantieni l’originale fino alla riuscita del caricamento.

Le immagini possono essere inserite come blocchi immagine e gli altri documenti allegati come blocchi file. Il server determina il tipo di contenuto salvato dai byte, senza fidarsi del nome del file o dell’etichetta del browser. L’accettazione del caricamento non garantisce un’anteprima nella pagina per ogni formato; scarica il file quando l’anteprima non è disponibile.

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

Apri una pagina del progetto come membro e usa i controlli di pubblicazione. Esamina prima contenuto e allegati. Scegli accesso privato, protetto da password o pubblico. La password richiede almeno otto caratteri e viene applicata dopo l’invio; selezionare la modalità non crea da solo un collegamento protetto.

Copia il collegamento /p/ generato dopo la riuscita della pubblicazione. Se la pagina ha discendenti, controlla l’opzione per includerli e il loro numero. Includerli pubblica il ramo selezionato; escluderli lascia i contenuti fuori da quella pubblicazione. Un database senza discendenti pubblicati non espone automaticamente tutti i corpi delle voci.

Apri il collegamento in una sessione separata del browser senza il tuo account. Prova la password se attiva, il contenuto, le sottopagine previste e i download. Questo verifica l’accesso in sola lettura del visitatore, non i tuoi permessi più ampi di membro.


![Finestra di pubblicazione con Privato selezionato e opzioni con password o link.](/documentation/it/page-publish.png)

### Revocare e controllare {#revoke-page}

Torna ai controlli di pubblicazione e scegli privato. Dopo la revoca riuscita, apri il vecchio collegamento in modo anonimo e verifica che l’accesso sia negato. Copie o schermate già ricevute non possono essere ritirate. Gli URL di download dei file già forniti da una pagina pubblicata vengono firmati per un massimo di 24 ore. La revoca impedisce nuove visite alla pagina, ma quegli URL già emessi possono restare validi fino alla scadenza.

I collegamenti delle pagine degli utenti restano noindex e sono separati dal manuale ufficiale indicizzato. Noindex è una politica di scoperta, non una password. Se un discendente o file è leggibile inaspettatamente, revoca prima, controlla il ramo pubblicato e riprova prima di inoltrare un collegamento corretto. I file di pagine non pubblicate non ottengono accesso tramite un riferimento interno.

## Esportare o stampare una pagina {#import-export-and-print-pages}

Apri il menu del documento della pagina e scegli Esporta. Seleziona Markdown per una pagina (.md) o un ramo (.zip), PDF per aprire la vista di stampa oppure l’archivio di database se la pagina è un database. Controlla l’ambito proposto prima di confermare: una pagina, il suo ramo e un archivio di database contengono elementi diversi.

Apri l’esportazione e verifica i titoli, i riquadri di avviso, i collegamenti e gli allegati necessari al lettore. L’azione PDF apre una vista di stampa leggibile senza tutta la navigazione dell’applicazione. Usa i controlli di stampa del browser per stampare o salvare un PDF. Nel menu del documento non c’è un’azione di importazione generica. Le importazioni supportate si avviano da un database vuoto, come descritto nella guida all’importazione dei database.


![Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.](/documentation/it/page-export.png)

### Archivi di database e limiti {#export-fidelity}

Un archivio di database (.zip) include il suo ramo: Markdown e CSV, lo schema esatto e i colori delle opzioni, valori, contenuti, date e orari, pagine annidate e contenuti dei file. Importalo in un database nuovo e vuoto per ripristinare questa struttura. I filtri, l’ordinamento e le preferenze per le colonne nascoste specifici del dispositivo rimangono sul dispositivo originale.

Un’esportazione non trasferisce password, credenziali dei provider di account o abbonamenti. Per spostare il lavoro di un account tra istanze, usa la guida al trasferimento dei dati dell’account. Se un formato importato non può mantenere un blocco o una proprietà esterna, controlla il risultato prima di usarlo come sostituto. Non eliminare l’originale solo perché è stato creato un file da scaricare.
