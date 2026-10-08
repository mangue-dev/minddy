---
{
  "id": "issues",
  "locale": "it",
  "title": "Ticket",
  "summary": "Crea e organizza i ticket, segui il loro ciclo di vita, gestisci dipendenze e piani e importa o modifica il lavoro in blocco.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Creare e modificare un ticket",
    "Valutare il lavoro in arrivo nel triage",
    "Seguire il ciclo di vita di un ticket",
    "Discutere il lavoro e allegare il contesto",
    "Collegare dipendenze e ticket correlati",
    "Suddividere un ticket in sottoticket",
    "Mantenere un piano di implementazione",
    "Ripetere un ticket dopo il completamento",
    "Aggiornare più ticket insieme",
    "Importare un backlog CSV dopo la verifica"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/it/new-issue.png",
      "alt": "Bozza non inviata con titolo, descrizione e proprietà selezionabili manualmente.",
      "caption": "Descrivi il risultato atteso e scegli le proprietà utili prima di creare il ticket.",
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
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/it/triage-incoming.png",
      "alt": "Ticket dimostrativo DOC-11 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.",
      "caption": "Leggi la segnalazione ricevuta prima di accettarla, rifiutarla o collegare un duplicato.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-statuses.png",
      "alt": "Gli otto stati del ticket nel selettore, con Backlog selezionato.",
      "caption": "La spunta indica lo stato attuale. Scegli quello che rispecchia lo stato effettivo del lavoro.",
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
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-resources.png",
      "alt": "Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.",
      "caption": "Controlla la destinazione prima di aggiungere la risorsa. Questo link d’esempio non è stato inviato.",
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
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-dependencies.png",
      "alt": "Ricerca di un ticket bloccante tramite identificativo.",
      "caption": "Scegli la direzione della relazione prima della destinazione. Il selettore è mostrato senza inviare la relazione.",
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
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-sub-issues.png",
      "alt": "Campo per creare un sotto-ticket in un ticket principale dimostrativo.",
      "caption": "Il campo crea un figlio di questo ticket; ogni figlio conserva stato e discussione propri.",
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
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-implementation-plan.png",
      "alt": "Piano dimostrativo con due attività di lavoro completate su sei.",
      "caption": "Il piano salvato distingue passaggi completati, attivi e in attesa. L’avanzamento non dimostra l’esecuzione dell’attività di codice fittizia.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1400
      ],
      "theme": "light"
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-date-recurrence.png",
      "alt": "Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.",
      "caption": "La modalità ricorrente mostra la cadenza settimanale. Conferma la prima scadenza prima di creare il ticket.",
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
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-bulk-actions.png",
      "alt": "Menu delle azioni per due ticket dimostrativi selezionati.",
      "caption": "Il menu agisce sui ticket selezionati. In questa schermata non è stata inviata alcuna modifica collettiva.",
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
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/import-issues-preview-workflow.png",
      "alt": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.",
      "caption": "Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate. L’importazione non è stata inviata; la pianificazione IA facoltativa è stata bloccata per la cattura.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

Un ticket descrive un’attività del progetto, dal lavoro in arrivo alla verifica del risultato. Puoi aggiungere discussione, risorse, dipendenze, sottoticket e un piano, poi gestire ricorrenze o azioni collettive. L’importazione CSV crea nuovi ticket e richiede il proprietario del progetto.

## Creare e modificare un ticket {#create-an-issue}

Devi essere membro del progetto di destinazione. Apri il progetto e il controllo per creare un ticket. Inserisci un titolo che identifichi il lavoro, poi aggiungi contesto, risultato previsto e vincoli nella descrizione. Scegli il progetto consapevolmente quando crei da una vista personale o tra progetti.

Per creare il ticket manualmente, disattiva Riempimento intelligente se il pulsante è visibile e attivo. Vengono così mostrati i controlli di priorità, impegno, categorie e obiettivo, che puoi impostare tu. La scelta vale per questo ticket; riaprendo il modulo di creazione viene ripristinata la preferenza dell’account. È indipendente dagli interruttori di automazione e Smart Assign del progetto.

Imposta le proprietà utili prima di confermare: stato, priorità, impegno, assegnatario, obiettivo, categorie, scadenza e ricorrenza. L’assegnatario è un membro del progetto; un obiettivo raggruppa ticket intorno a un risultato del progetto. Puoi lasciare vuote le proprietà opzionali anziché indovinarle. La priorità va da nessuna a bassa, media, alta e urgente; l’impegno usa XS, S, M, L e XL.

Conferma la creazione e apri il nuovo ticket. Controlla identificativo e progetto. Riapri i selettori delle proprietà per cambiare i valori quando l’attività diventa più chiara. La descrizione spiega il lavoro; il piano di implementazione si mantiene separatamente nella scheda del piano.


![Bozza non inviata con titolo, descrizione e proprietà selezionabili manualmente.](/documentation/it/new-issue.png)

### Verificare salvataggio e visibilità {#issue-save}

Dopo aver cambiato una proprietà, verifica il valore visualizzato. I filtri possono rimuovere subito un ticket dalla vista attuale quando cambiano assegnatario, stato o categoria. Cerca il suo identificativo o apri il progetto senza quei filtri prima di creare un sostituto.

Se la creazione o il salvataggio falliscono, conserva il testo, leggi l’errore e controlla che appartenenza e destinazione esistano ancora. Prima di riprovare dopo un errore di rete, verifica se il ticket sia già stato creato. Collega le pagine del progetto come risorse aggiornate quando serve il loro contenuto attuale e usa i commenti per discutere l’attività.

## Valutare il lavoro in arrivo nel triage {#triage-incoming-work}

Apri la destinazione Triaggio del progetto. Leggi il ticket in arrivo e il contesto della sua origine prima di accettarlo nel lavoro pianificato. Controlla se un ticket esistente rappresenta già la richiesta. Chiarisci risultato previsto, progetto, assegnatario, priorità e sforzo secondo necessità.

Scegli Accetta e conferma per spostare nel Backlog un ticket da mantenere. Scegli Rifiuta e conferma per impostarlo su Annullata. Se è un duplicato, usa il selettore dei duplicati per scegliere il ticket da mantenere. Il ticket in arrivo assume lo stato Duplicato e rimanda a quello scelto. Quando un elemento esce dal triage, viene selezionato il successivo. Verifica lo stato risultante o il collegamento al duplicato nel ticket stesso. Passare da una scheda all’altra senza eseguire una di queste azioni non chiude il ticket.

### Ordinamento e limiti {#triage-order}

Smart Triage usa regole di ordinamento deterministiche.

All’interno di ogni colonna di stato, i ticket aperti che bloccano altro lavoro aperto vengono prima dei ticket senza blocchi. I ticket bloccati da lavoro aperto vengono ultimi, anche quando bloccano a loro volta altri ticket. Gli estremi chiusi non generano più questa priorità. All’interno di ciascun livello, priorità più alta, impegno minore e scadenze superate o vicine fanno avanzare il lavoro. Nello stesso livello di blocco, i ticket di un obiettivo rimangono insieme e il gruppo viene ordinato in base al suo ticket meglio posizionato. A parità di posizione, contano la scadenza, la data di creazione più vecchia, la posizione manuale e infine l’identificativo, che garantisce un ordine stabile. Una relazione di collegamento non influisce su questo ordinamento. Non è una modalità sperimentale di triage con IA. L’ordine aiuta a scegliere quali elementi esaminare prima; non dimostra la verità di una descrizione, non risolve automaticamente i duplicati e non concede permessi.

Se manca l’elemento previsto, controlla progetto attivo, stato e filtri, poi cerca il suo identificativo. Il lavoro importato o sincronizzato dall’esterno può arrivare nel triage; controlla la fonte originale e la mappatura dell’integrazione prima di cambiare campi sincronizzati. Una richiesta collegata dal feedback resta un oggetto di feedback distinto con una propria discussione pubblica.


![Ticket dimostrativo DOC-11 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.](/documentation/it/triage-incoming.png)

## Seguire il ciclo di vita di un ticket {#issue-statuses}

Apri il selettore di stato del ticket o usa le azioni di stato del tabellone. In una vista kanban, spostare il lavoro tra colonne cambia il ticket stesso; cambiare un filtro modifica solo ciò che vedi. Verifica il nuovo stato nel pannello di dettaglio dopo lo spostamento.

| Stato | Uso |
| --- | --- |
| Triaggio | Lavoro in arrivo in attesa di valutazione. |
| Backlog | Lavoro conservato ma non ancora scelto per iniziare. |
| Da fare | Lavoro scelto da svolgere. |
| In corso | Lavoro in esecuzione. |
| In revisione | Implementazione in attesa di revisione. |
| Fatto | Risultato previsto completato. |
| Annullata | Lavoro chiuso senza consegna. |
| Duplicato | Lavoro rappresentato da un altro ticket. |

Gli stati sono fissi e non vengono personalizzati per progetto. Triaggio e Duplicato sono disponibili nei selettori, ma sono deliberatamente assenti dalle normali colonne kanban. Una colonna mancante non dimostra che lo stato o il ticket non esistano.


![Gli otto stati del ticket nel selettore, con Backlog selezionato.](/documentation/it/issue-statuses.png)

### Stati finali e verifica {#closed-work}

Fatto, Annullata e Duplicato sono stati finali per il monitoraggio: smettono di bloccare i ticket dipendenti ed escono dai conteggi attivi. Chiudere come Annullata non significa che l’attività sia stata consegnata. Quando contrassegni un duplicato, identifica il ticket mantenuto per dare una destinazione chiara alla discussione e al progresso.

Controlla i filtri se un ticket scompare dopo la chiusura. Riaprilo tramite identificativo per controllare il risultato e cambiare stato se l’hai chiuso per errore. Per il lavoro bloccato, controlla anche la direzione della dipendenza: cambiare lo stato di un ticket non ne riscrive descrizione o piano.

## Discutere il lavoro e allegare il contesto {#issue-discussion-and-resources}

Apri la cronologia di discussione del ticket per aggiungere un commento. Spiega una decisione, una domanda o un risultato di verifica perché un altro membro possa capire cosa è cambiato. Usa le menzioni quando serve una persona o un oggetto collegato nel contesto; le notifiche dipendono comunque dalle preferenze del destinatario e dalla consegna sul suo dispositivo.

Allega una pagina pertinente del progetto, un file o un collegamento attraverso i controlli delle risorse. Una pagina collegata è una risorsa aggiornata: il suo titolo segue le rinominazioni e il contenuto può evolvere. Un file è un allegato memorizzato, non una garanzia che un URL esterno resti disponibile.

![Finestra di aggiunta di un link con un indirizzo di contatto d’esempio.](/documentation/it/work-resources.png)

### Visibilità e caricamenti non riusciti {#resource-access}

L’appartenenza e l’accesso al progetto regolano discussione e risorse interne. Aggiungere una risorsa a un ticket non la pubblica per visitatori anonimi. Quando fai riferimento al feedback, distingui la discussione riservata al gruppo da una risposta pubblica prima di inviare testo.

Dopo l’operazione, verifica che una risorsa caricata compaia e si possa aprire. Se il caricamento fallisce, conserva il file originale, leggi l’errore e verifica il limite applicabile di dimensione o spazio dell’account. Gli operatori di istanze autonome hanno bisogno anche di metadati, policy e dati dei file di Storage funzionanti. Evita di allegare credenziali o dump diagnostici privati.

## Collegare dipendenze e ticket correlati {#issue-dependencies}

Apri i controlli delle relazioni di un ticket e cerca l’altro per titolo o identificativo. Scegli una relazione di blocco quando un’attività deve terminare prima che un’altra possa procedere. Se A blocca B, A è il prerequisito e B è bloccato da A. Una relazione di collegamento aggiunge contesto senza imporre quell’ordine.

Leggi entrambi gli identificativi e la direzione visualizzata prima di confermare. Per esempio, «Preparare l’endpoint» blocca «Collegare il client», non il contrario. Una dipendenza non rende nessuno dei ticket un sottoticket e una relazione padre-figlio non sostituisce una relazione di blocco.

![Ricerca di un ticket bloccante tramite identificativo.](/documentation/it/work-dependencies.png)

### Blocchi risolti ed ereditati {#blocker-state}

Gli stati finali Fatto, Annullata e Duplicato fanno smettere a un ticket di bloccare il lavoro. Le relazioni collegano ticket od obiettivi dello stesso progetto; entrambi gli estremi devono essere accessibili al suo interno. Non collegano lavoro privato arbitrario tra progetti e non pubblicano nessuno dei due estremi.

Un ticket aperto può ereditare un blocco attraverso il proprio obiettivo aperto. Se A blocca l’obiettivo B, i ticket aperti collegati a B mostrano A come blocco ereditato, anche senza una relazione diretta da A al ticket. La visualizzazione indica il prerequisito effettivo e l’obiettivo che trasmette il blocco. Esamina quella relazione dell’obiettivo prima di provare a rimuoverla dal ticket. Chiudere A, chiudere B o rimuovere il ticket da B elimina il blocco ereditato. Questo meccanismo segue l’appartenenza all’obiettivo, non la gerarchia tra ticket padre e sottoticket.

Rimuovi una relazione dai suoi controlli quando non è più pertinente, poi verifica etichetta e indicatore di blocco. Contrassegnare un ticket come duplicato ha effetti sul ciclo di vita e rimanda al lavoro mantenuto. Usalo per le attività duplicate invece di creare un collegamento ordinario e supporre che chiuda il duplicato.

Se il selettore di relazione non trova un ticket, controlla accesso al progetto e identificativo. Non esporre il contenuto di un altro progetto incollando un URL privato di ticket in una risposta pubblica al feedback.

## Suddividere un ticket in sottoticket {#sub-issues}

Apri il ticket padre e usa i controlli dei sottoticket per creare parti di lavoro più piccole. Dai a ogni figlio un risultato distinto. Dopo la creazione, controlla progetto, proprietà e identificativo del padre; una gerarchia deve facilitare il monitoraggio, non sostituire la descrizione di ciò che ogni figlio deve ottenere.

La gerarchia consente un solo livello: il padre deve essere un ticket di primo livello nello stesso progetto e un sottoticket non può avere figli. Se durante la creazione non scegli esplicitamente un obiettivo, il figlio eredita quello del padre. Controlla le proprietà risultanti invece di presumere che le modifiche successive del padre si propaghino.

Un figlio resta un ticket con un proprio stato e una propria discussione. L’indicatore di progresso del padre è ponderato in base all’impegno dei figli e alla quota di completamento attribuita al loro stato. Il contatore completati/totale nell’elenco dei sottoticket è invece un conteggio separato, non ponderato. Leggi gli stati dei figli insieme a entrambe le misure. Usa una dipendenza per dire «deve terminare prima» e un padre per dire «fa parte di questa attività più grande».

![Campo per creare un sotto-ticket in un ticket principale dimostrativo.](/documentation/it/work-sub-issues.png)

### Aprire o rimuovere la relazione con il padre {#change-parent}

L’identificativo del padre accanto al titolo del figlio apre un menu. Usa l’azione di apertura del padre per esaminare l’attività più grande. Per separare il figlio, scegli di scollegarlo dal padre e leggi la conferma prima di applicarla. Quando lo scollegamento riesce, la relazione scompare e il ticket rimane.

Non eliminare un figlio solo per riorganizzare la gerarchia. Controlla le relazioni padre-figlio esistenti prima di cambiare padre e risolvi una relazione rifiutata invece di forzare una gerarchia circolare. Se il salvataggio fallisce, riapri il figlio per verificare se il cambiamento sia stato applicato prima di riprovare. Conserva il lavoro completato dei figli quando rivedi il piano generale.

## Mantenere un piano di implementazione {#implementation-plans}

Apri la scheda del piano del ticket. La descrizione dovrebbe già indicare il problema e il risultato previsto. Aggiungi i passi di implementazione manualmente oppure chiedi a Numo di esaminare il repository collegato prima di proporre un piano a livello di codice. Un percorso o una funzione generati dall’IA non sono una prova se il repository non è stato realmente letto.

Rientra la riga di un’attività di due spazi per ogni livello di annidamento; una tabulazione conta come quattro spazi. L’annidamento organizza i passi del piano e non crea relazioni padre-figlio tra ticket. Ogni attività di lavoro non annullata contribuisce al progresso, comprese quelle annidate.

Il piano usa righe di attività Markdown: `- [ ]` per da fare, `- [~]` per in corso, `- [x]` per completata e `- [-]` per annullata. Scrivi il testo dopo il marcatore, per esempio `- [ ] Verificare il link di contatto su mobile`. Le attività annullate non rientrano nel conteggio del completamento. Le attività sotto un’intestazione Questions riconosciuta vengono trattate come domande ed escluse dal progresso; tieni quindi i passaggi di lavoro in una sezione separata allo stesso livello d’intestazione. L’intestazione riconosciuta è `Questions`, con questa parola inglese. Salva le modifiche esplicite con il controllo di salvataggio; annullare scarta la bozza. Spuntare un’attività visualizzata ne aggiorna lo stato. Usa da fare, in corso, completata e annullata per descrivere ciò che è avvenuto, senza implicare verifiche non eseguite.

![Piano dimostrativo con due attività di lavoro completate su sei.](/documentation/it/work-implementation-plan.png)

### Conservare progresso e modifiche simultanee {#plan-progress}

Estendi o modifica il piano esistente invece di sostituirlo con una nuova copia non selezionata. Mantieni i passi completati e le spiegazioni dei cambiamenti di ambito. Prima di salvare una riscrittura importante, confrontala con il piano più recente se un altro membro o agente ha lavorato sul ticket.

Un piano scritto può essere affidato a Numo per l’implementazione quando il lavoro sul repository e l’ambiente isolato configurato sono disponibili. Quando esiste lavoro completato, l’interfaccia offre anche la verifica dell’implementazione. Queste azioni avviano lavoro; una casella selezionata non dimostra da sola che il codice superi i test. Leggi risultato, modifiche e controlli prima di segnare il ticket come fatto.

## Ripetere un ticket dopo il completamento {#recurring-issues}

Crea o apri un ticket che resti utile a ogni ripetizione, per esempio un controllo periodico delle dipendenze. Imposta una scadenza, poi scegli una ricorrenza giornaliera, settimanale, mensile o annuale nel controllo della data del ticket. Una ricorrenza senza scadenza viene rifiutata. Controlla proprietà e assegnatario prima di salvare. Le impostazioni delle ricorrenze del progetto elencano le serie attive; usale per cambiare frequenza o interrompere la ripetizione.

I ticket ricorrenti si ricreano dopo che il ticket è nello stato «Fatto»; il successivo viene creato nel Backlog. Dopo aver completato una ricorrenza, controlla identificativo e proprietà del ticket successivo.

La scadenza successiva deriva dalla scadenza precedente più un intervallo di ricorrenza, non dal giorno in cui hai completato l’attività. Il successore copia titolo, descrizione, priorità, impegno, assegnatario, obiettivo e categorie. Non copia il piano di implementazione, la relazione con il padre, le risorse o i commenti. La ricorrenza passa al successore; riaprire e completare di nuovo il vecchio ticket non crea un’altra occorrenza. Se la creazione del successore fallisce, la serie si interrompe invece di riprovare ripetutamente sul ticket completato. Esamina il risultato e configura la ricorrenza sulla prossima attività appropriata dopo aver risolto l’errore. Non supporre che un calendario esegua codice o completi il nuovo ticket per te.


![Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.](/documentation/it/issue-date-recurrence.png)

### Cambiare o interrompere la ripetizione {#recurrence-change}

Usa le impostazioni delle ricorrenze per modificare o disabilitare le ripetizioni future. Esamina separatamente i ticket già creati: interrompere la creazione futura non significa che il lavoro esistente sia stato completato o rimosso.

Una routine di Numo è un oggetto diverso: programma una conversazione e può usare il budget IA del proprietario e i fornitori configurati. Scegli ticket ricorrenti per un’attività ripetuta da monitorare e una routine per un’istruzione da eseguire secondo un calendario. Se manca il ticket successivo, controlla se il precedente sia stato segnato come fatto, se la ricorrenza sia ancora attiva e se stai guardando il Backlog senza filtri restrittivi.

## Aggiornare più ticket insieme {#bulk-issue-actions}

Sul tabellone, tieni premuto Maiusc e fai clic su ogni scheda per aggiungerla alla selezione o rimuoverla. Con il mouse puoi anche trascinare un rettangolo di selezione da uno spazio vuoto del tabellone. Maiusc, Command o Ctrl aggiungono gli elementi alla selezione esistente. Il rettangolo non è una modalità di selezione per schermi tattili. Controlla il numero selezionato e gli identificativi visibili prima di aprire le azioni collettive. La selezione è un insieme di lavoro per l’azione, non una vista salvata e non una concessione di permessi.

Scegli Azioni nella barra mobile della selezione per aprire la palette dei comandi. Scegli stato, priorità, sforzo o assegnatario, imposta il valore e conferma il modulo integrato. L’azione dell’obiettivo appare solo per una selezione in un unico progetto con obiettivi disponibili. Altre azioni, come aggiungere o rimuovere elementi dal ciclo, collegare due ticket o inviare la selezione a Numo, appaiono quando il tabellone attuale le supporta. Controlla poi i ticket interessati. Su un dispositivo solo tattile senza un gesto di selezione multipla supportato, modifica ogni ticket nel suo pannello di dettaglio.

![Menu delle azioni per due ticket dimostrativi selezionati.](/documentation/it/work-bulk-actions.png)

### Risultati parziali e azioni distruttive {#bulk-results}

Quando lavori tra progetti, verifica la tua appartenenza a ciascun progetto coinvolto. Leggi gli eventuali risultati di errore parziale: i cambiamenti riusciti possono essere già salvati anche se un altro ticket è stato rifiutato. Controlla il risultato prima di riprovare sull’intera selezione.

L’eliminazione riguarda tutti gli elementi selezionati, quindi conferma l’insieme prima di procedere. Rimuovi la selezione dopo l’operazione se passi ad altro lavoro. Se l’aggiornamento cambia i risultati dei filtri, i ticket possono uscire dalla vista mostrata pur restando nel progetto. Cerca gli identificativi per verificare il nuovo stato invece di ricrearli.

## Importare un backlog CSV dopo la verifica {#import-issues}

Il proprietario del progetto apre Importazione nelle impostazioni del progetto e seleziona un’esportazione CSV. I formati di Linear e Jira vengono riconosciuti; gli altri CSV usano l’associazione generica delle colonne. Ogni importazione è limitata a 5 MiB e 5.000 ticket. Suddividi intenzionalmente gli archivi più grandi e, quando possibile, mantieni i riferimenti ai ticket padre nello stesso gruppo.

Associa la colonna del titolo prima di importare. Controlla descrizione, stato, priorità, impegno, scadenza, categorie e assegnatari. Associa le persone a membri effettivi del progetto e verifica le nuove categorie. I riferimenti ai padri corrispondono a chiavi esterne nello stesso gruppo e supportano un solo livello. I CSV non importano i byte dei file allegati.

Una proposta IA viene richiesta soltanto per le associazioni mancanti. Puoi modificarla; se il provider non è disponibile o la richiesta fallisce, l’associazione manuale resta utilizzabile. Una correzione manuale impedisce a una proposta tardiva di sovrascrivere le tue scelte.

### Importare e verificare {#result}

Dopo ogni modifica delle associazioni, leggi il numero di ticket, la distribuzione degli stati e gli avvisi. Correggi le righe ignorate o non valide prima di confermare. L’importazione crea nuovi ticket: non presumere che caricare nuovamente il file aggiorni quelli esistenti eliminando i duplicati. Dopo il successo, verifica un campione di ticket, assegnazioni, date e collegamenti ai padri. Se la risposta va persa, controlla il progetto prima di ripetere l’intero file, per evitare lavoro duplicato.

![Anteprima CSV di due righe dimostrative tradotte e delle colonne rilevate.](/documentation/it/import-issues-preview-workflow.png)
