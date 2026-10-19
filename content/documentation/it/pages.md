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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-680); MIN-693 project roles; MIN-718 hybrid issue search; MIN-688 live collaboration; MIN-684 page promotion",
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
      "components/pages/page-print-view.tsx",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-680-file-preview.md",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "content/documentation/reviews/min-688-live-collaboration.md",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "content/documentation/reviews/min-684-promote-page.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root (MIN-680 source, focused route/UI tests and isolated browser review; prior controls retain existing evidence); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-688 live collaboration: source, convergence/authority unit tests and a rollback-only database probe; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-684 page promotion: source and focused unit-test review of the menu entries, reader gating, save-before-promote and the Numo request; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (it changed-text and retained-meaning self-review); agent:/root/min693_it with agent:/root (it MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (it translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min688_it with agent:/root (it MIN-688 translation of the rewritten saving, presence and conflict passages; agent review, not human acceptance); agent:/root (it translation of the MIN-684 promotion section with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        264,
        152
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        974
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-comments.png",
      "alt": "Attività della pagina con una modifica dimostrativa e campo del commento vuoto.",
      "caption": "Leggi l’attività e scrivi un commento nel campo. In questo esempio non è stato inviato alcun commento.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        625
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-file-states.png",
      "alt": "Pagina dimostrativa con un caricamento incompleto e un file salvato di 67 byte con il comando Scarica.",
      "caption": "Controlla lo stato effettivo del file: il secondo allegato è disponibile, il primo caricamento incompleto no.",
      "revision": 13,
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
      "revision": 13,
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/it/page-export.png",
      "alt": "Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.",
      "caption": "Scegli Markdown per scaricare il documento oppure Stampa / PDF per aprire la vista di stampa.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/it/file-preview.png",
      "alt": "Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica e Rimuovi.",
      "caption": "Il visualizzatore condiviso colloca Chiudi sotto l’anteprima. Il menu Azioni del file offre Scarica e, con i permessi necessari, Rimuovi.",
      "revision": 13,
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

Apri Pagine in un progetto di cui sei membro. Usa il menu + e scegli una pagina per un documento o un database per un elenco strutturato. Dai alla pagina un titolo utile e scrivi la specifica, decisione o procedura che deve conservare.

Crea sottopagine per documenti correlati e usa i controlli dell’albero per spostarle o riordinarle. Una pagina non può diventare discendente di sé stessa. Duplicare una pagina crea nuovi contenuti, non un riferimento aggiornato all’originale. Controlla il ramo duplicato prima di modificarlo o condividerlo.

### Preferiti ed eliminazione {#page-tree}

Segna una pagina come preferita per mostrarla in cima all’albero del progetto. Questi preferiti sono condivisi nel progetto, diversamente da una nota privata del taccuino. Collega una pagina a un ticket quando il documento attuale è il contesto dell’attività; il titolo della risorsa segue le rinominazioni della pagina.

L’eliminazione sposta nel cestino le pagine per cui è previsto il recupero. Controlla il ramo selezionato prima di eliminare e usa il recupero invece di ricreare una pagina persa quando il contenuto va conservato. Le voci con valori di database memorizzati si possono riordinare nel proprio database, ma non spostare fuori. Se uno spostamento viene rifiutato, esamina gerarchia e tipo di voce invece di forzarlo con tentativi ripetuti.


![Menu di creazione con Nuova pagina e Nuovo database.](/documentation/it/page-create-menu.png)

## Promuovere una pagina a ticket {#promote-page-to-issue}

Quando una pagina descrive lavoro da fare, il proprietario o un Membro può trasformarla in un ticket con Numo. I lettori non vedono questa azione. Servono utilizzo IA disponibile o una chiave personale compatibile.

1. Scegli **Promuovi a ticket** nel menu della pagina nell’albero (`…` o clic destro sulla riga) o nel menu `…` della pagina aperta (**Opzioni di pagina**). La stessa azione compare per una voce di database aperta nel pannello laterale e nel menu della maniglia di una singola voce, come spiega la [guida ai database](/it/documentazione/databases#entry-actions).
2. Se la pagina aperta ha modifiche non salvate, minddy le salva prima. Se il salvataggio non riesce, minddy segnala che non è stato possibile salvare la pagina e Numo non si apre. Ripeti la promozione quando la pagina è salvata.
3. Numo si apre nel progetto della pagina, con la pagina come contesto, e riceve la richiesta di leggerne il titolo, il contenuto e, per una voce di database, le proprietà. Se la pagina non è chiara, o se un database lascia ambiguo l’ambito del ticket, Numo fa delle domande prima di creare qualcosa. Rispondi nella conversazione.
4. Numo crea un solo ticket e vi allega la pagina. Apri il ticket e controlla identificativo, ambito, proprietà e pagina allegata.

A differenza di un’attività del taccuino portata nel progetto, la pagina non viene rimossa: resta al suo posto nell’albero, con contenuto e sottopagine. Se la creazione non riesce o il risultato non è chiaro dopo un errore di rete, cerca il ticket prima di ripetere la promozione.

## Scrivere una pagina con blocchi e menzioni {#page-editor}

Apri la pagina e modifica titolo o corpo come proprietario o come Membro. I lettori possono aprire e leggere le pagine, ma non possono modificarle, importarle, duplicarle, aggiungerle ai preferiti o pubblicarle, né ripristinarne una versione. Usa il menu dei comandi con barra e i controlli di formattazione per inserire titoli, paragrafi, elenchi, attività, codice, sezioni espandibili e riquadri informativi. Un riquadro può avere un’icona emoji e un colore della palette; sceglili per distinguere informazioni utili, non come unico modo di comunicare un avviso.

Usa le menzioni per collegare ticket, obiettivi, persone o pagine pertinenti. Digita `@` seguito da un identificativo, da parole del titolo o da una breve descrizione; una ricerca descrittiva mostra anche ticket trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**, dopo le corrispondenze testuali. I rimandi inversi aiutano i lettori a trovare pagine che citano quella attuale. Un collegamento fornisce contesto, non accesso a un oggetto privato di un altro progetto.


![Pagina dimostrativa con titoli, paragrafi, caselle delle attività e una menzione a un ticket.](/documentation/it/page-editor.png)

### Salvataggio e portabilità {#editor-save}

Una pagina si salva mentre scrivi: ogni modifica raggiunge il server in pochi istanti e l’indicatore di salvataggio mostra il salvataggio in corso finché il server non l’ha accettata. Più persone possono modificare la stessa pagina contemporaneamente, anche lo stesso paragrafo o il titolo. Le modifiche di ciascuno compaiono agli altri mentre scrive, così come quelle che Numo o un agente collegato tramite MCP apportano alla pagina.

Se la connessione si interrompe, tieni la pagina aperta. Le modifiche non salvate restano sulla pagina e vengono inviate al ritorno della connessione; nello stesso momento arrivano le modifiche degli altri, che si uniscono alle tue. minddy apre un’altra pagina solo quando le tue modifiche sono salvate: finché non possono essere inviate, ti tiene sulla pagina e segnala che il salvataggio non è riuscito. Chiudere una scheda del browser con modifiche non salvate ti chiede prima una conferma; uscire dall’app desktop non la chiede, e le modifiche non salvate vanno perse. Se perdi l’accesso alla pagina o il permesso di modificarla mentre ci sono modifiche non salvate, minddy le annulla e mostra un messaggio. Quando il server rifiuta una modifica, per esempio un titolo più lungo di 500 caratteri o un link con un protocollo non consentito, minddy annulla quella modifica e mostra un messaggio. La cronologia può aiutare a esaminare versioni salvate precedenti.

Le esportazioni Markdown e le letture delle pagine da parte degli agenti conservano icone e colori dei riquadri nella rappresentazione supportata. I formati di esportazione differiscono per fedeltà e gestione degli allegati: controlla il documento ottenuto prima di sostituire una fonte originale. Usa blocchi di codice per comandi letterali e mantieni prerequisiti e avvisi nel testo circostante.

## Discutere una pagina e gestire conflitti {#page-comments-and-collaboration}

Apri una pagina del progetto e i suoi controlli dei commenti. Seleziona il contenuto pertinente quando crei un commento ancorato, spiega la domanda o modifica proposta e usa le menzioni per coinvolgere un membro. Un lettore può commentare se il proprietario ha attivato **Può commentare** per lui. Rispondi nella discussione per mantenere la decisione con il contesto che riguarda. Risolvila quando la domanda è stata effettivamente affrontata.

Gli avatar di presenza identificano chi sta guardando la pagina. Mentre qualcuno modifica, il suo cursore e la sua selezione compaiono nel corpo e nel titolo, in un colore proprio e con il suo nome. Il cursore di un lettore non viene mostrato. Un cursore indica dove qualcuno sta lavorando, non che il suo testo sia salvato: l’indicatore di salvataggio riflette solo le tue modifiche.


![Attività della pagina con una modifica dimostrativa e campo del commento vuoto.](/documentation/it/page-comments.png)

### Recuperare un conflitto di salvataggio {#page-conflict}

Le modifiche simultanee si uniscono automaticamente, carattere per carattere, anche all’interno dello stesso paragrafo. Un avviso di conflitto può comunque comparire quando minddy deve ricaricare la pagina mentre hai modifiche non salvate: dopo una disconnessione durante la quale sono state fatte molte modifiche, oppure dopo una modifica eseguita senza la modifica in tempo reale, come un’importazione in un database. Se le tue modifiche e la versione ricaricata hanno cambiato lo stesso blocco del primo livello, il documento conserva la versione ricaricata di quel blocco e l’avviso propone la tua da esaminare.

Confronta il blocco identificato con il documento attuale. Scegli di ripristinare la tua versione solo se intendi sostituire quel blocco con essa. Se l’azione in conflitto era un’eliminazione, l’opzione per eliminarlo di nuovo applica esplicitamente quella cancellazione. Chiudere l’avviso mantiene il documento adottato e rimuove l’avvertimento; non ripristina la tua versione. Conserva il testo desiderato prima di chiudere e usa la cronologia per esaminare le versioni salvate quando serve un recupero più ampio. Queste scelte riguardano il blocco identificato, senza sostituire alla cieca tutta la pagina.

Un’ancora può mancare dopo modifiche al documento: leggi la discussione prima di spostare o eliminare il blocco citato. Commenti e attività restano interni al progetto salvo pubblicazione esplicita dei contenuti attraverso un percorso supportato. Prova la pagina pubblicata per stabilire la vista effettiva del visitatore senza supporre che i controlli di collaborazione diventino pubblici.

## Allegare e recuperare file delle pagine {#page-files}

Apri la pagina come membro del progetto e usa i controlli di allegato o caricamento. Seleziona un file non vuoto entro il limite di 10 MB per file. La quota di spazio dell’account o dell’istanza può imporre un limite aggiuntivo. Mantieni l’originale fino alla riuscita del caricamento.

Le immagini possono essere inserite come blocchi immagine e gli altri documenti allegati come blocchi file. Il server determina il tipo di contenuto salvato dai byte, senza fidarsi del nome del file o dell’etichetta del browser. L’accettazione del caricamento non garantisce un’anteprima nella pagina per ogni formato; scarica il file quando l’anteprima non è disponibile.

Nell’editor del progetto, fai clic su un’immagine o sul nome di un blocco file supportato per aprire lo stesso visualizzatore a tutta finestra usato dagli allegati dei ticket. Markdown (`.md`), testo semplice (`.txt`, `.text`), CSV, PDF e formati audio o video supportati si aprono in contenitori dedicati. Usa Chiudi o Escape per tornare alla pagina. Il menu Azioni del file (`…`) offre Scarica; Rimuovi è disponibile solo nelle pagine modificabili e rimuove il blocco dal documento. Il blocco file mantiene anche il comando diretto Scarica. I formati non supportati, i collegamenti a file esterni e i blocchi file nelle pagine pubblicate mantengono il comportamento di download. Le immagini pubblicate usano il visualizzatore senza l’azione di rimozione.

![Visualizzatore CSV a tutta finestra con attività di esempio, un grande pulsante Chiudi e il menu Azioni del file con Scarica e Rimuovi.](/documentation/it/file-preview.png)

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

Apri il collegamento in una sessione separata del browser senza il tuo account. Prova la password se attiva, il contenuto, le sottopagine previste e i download. Questo verifica l’accesso in sola lettura del visitatore, non i tuoi permessi più ampi di membro.


![Finestra di pubblicazione con Privato selezionato e opzioni con password o link.](/documentation/it/page-publish.png)

### Revocare e controllare {#revoke-page}

Torna ai controlli di pubblicazione e scegli privato. Dopo la revoca riuscita, apri il vecchio collegamento in modo anonimo e verifica che l’accesso sia negato. Copie o schermate già ricevute non possono essere ritirate. Gli URL di download dei file già forniti da una pagina pubblicata vengono firmati per un massimo di 24 ore. La revoca impedisce nuove visite alla pagina, ma quegli URL già emessi possono restare validi fino alla scadenza.

I collegamenti delle pagine degli utenti restano `noindex` e sono separati dal manuale ufficiale indicizzato. Noindex è una politica di scoperta, non una password. Se un discendente o file è leggibile inaspettatamente, revoca prima, controlla il ramo pubblicato e riprova prima di inoltrare un collegamento corretto. I file di pagine non pubblicate non ottengono accesso tramite un riferimento interno.

## Esportare o stampare una pagina {#import-export-and-print-pages}

Apri il menu del documento della pagina e scegli Esporta. Seleziona Markdown per una pagina (.md) o un ramo (.zip), PDF per aprire la vista di stampa oppure l’archivio di database se la pagina è un database. Controlla l’ambito proposto prima di confermare: una pagina, il suo ramo e un archivio di database contengono elementi diversi.

Apri l’esportazione e verifica i titoli, i riquadri di avviso, i collegamenti e gli allegati necessari al lettore. L’azione PDF apre una vista di stampa leggibile senza tutta la navigazione dell’applicazione. Usa i controlli di stampa del browser per stampare o salvare un PDF. Nel menu del documento non c’è un’azione di importazione generica. Le importazioni supportate si avviano da un database vuoto, come descritto nella [guida all’importazione dei database](/it/documentazione/databases#import-a-database).


![Menu di esportazione del documento con Markdown (.md) e Stampa / PDF.](/documentation/it/page-export.png)

### Archivi di database e limiti {#export-fidelity}

Un archivio di database (.zip) include il suo ramo: Markdown e CSV, lo schema esatto e i colori delle opzioni, valori, contenuti, date e orari, pagine annidate e contenuti dei file. Importalo in un database nuovo e vuoto per ripristinare questa struttura. I filtri, l’ordinamento e le preferenze per le colonne nascoste specifici del dispositivo rimangono sul dispositivo originale.

Un’esportazione non trasferisce password, credenziali dei provider di account o abbonamenti. Per spostare il lavoro di un account tra istanze, usa la guida al trasferimento dei dati dell’account. Se un formato importato non può mantenere un blocco o una proprietà esterna, controlla il risultato prima di usarlo come sostituto. Non eliminare l’originale solo perché è stato creato un file da scaricare.


## Routine per nuove voci {#entry-routines}

Il proprietario può scegliere questo database come attivatore in [Routine](/docs/scheduled-routines#conditions). Le condizioni usano le proprietà tipizzate della voce. Una voce vuota può attendere che vengano compilate. Creazione, duplicazione, importazione di database e spostamento consentito nel database contano come arrivi; il ripristino no. Eliminare una proprietà referenziata o cambiarne il tipo richiede la correzione del filtro della routine.
