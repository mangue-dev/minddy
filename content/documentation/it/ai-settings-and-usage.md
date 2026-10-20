---
{
  "id": "ai-settings-and-usage",
  "locale": "it",
  "title": "Impostazioni e utilizzo dell’IA",
  "summary": "Configura le chiavi IA personali e i modelli predefiniti e comprendi i limiti dei piani Cloud e il conteggio dell’utilizzo.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Configurare chiavi IA personali e modelli",
    "Capire i piani Cloud e il consumo IA",
    "Capire piani Cloud e consumo IA"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "diagram",
      "src": "/documentation/it/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Connessioni, assegnazione per capacità e modello Numo personale sono impostazioni separate.",
      "caption": "Più fornitori possono restare collegati. L’assegnazione sceglie per capacità; il predefinito Numo viene salvato per account e fornitore.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Fornitori e modello Numo",
        "items": [
          {
            "title": "Fornitori collegati",
            "detail": "Mantieni collegati più fornitori API; aggiungerne uno conserva gli altri."
          },
          {
            "title": "Fornitore per capacità",
            "detail": "Assegna separatamente testo, trascrizione ed embeddings, poi attiva gli utilizzi."
          },
          {
            "title": "Modello predefinito di Numo",
            "detail": "Segui l’app o salva un modello personale. La scelta della conversazione ha la precedenza."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

Le impostazioni IA dell’account definiscono chiavi personali, ambiti e modelli predefiniti. Controlla l’instradamento dei modelli prima di avviare il lavoro. Su Cloud, usa la fatturazione per distinguere utilizzo incluso, chiamate con chiavi personali e limiti delle routine. In self-hosted, disponibilità e costi dipendono dalla configurazione dell’istanza.

La sezione **IA di Minddy** delle impostazioni IA dell’account configura i provider API usati da conversazioni Numo, routine, automazioni, voce e feedback. Gli agenti di codice che esegui per conto tuo, collegati tramite minddy MCP, usano il proprio abbonamento o account API e non consumano l’utilizzo dell’IA di Minddy.

## Configurare chiavi IA personali e modelli {#ai-keys-and-models}

Nelle impostazioni IA dell’account, **Fornitore IA** seleziona il fornitore di modelli di testo tra Minddy Cloud e i fornitori compatibili collegati. **Fornitori collegati** mostra l’elenco completo. Scegli **Aggiungi fornitore**, selezionalo, inserisci la chiave API e l’eventuale URL di base e salva. Puoi collegare più fornitori; aggiungerne o selezionarne uno non elimina gli altri. Non incollare mai una chiave in una conversazione o schermata.

Assegna separatamente testo, trascrizione ed embeddings. Ogni famiglia usa un solo fornitore alla volta. Gli interruttori di utilizzo per fornitore stabiliscono se Numo, automazioni, voce e feedback usano quella chiave o la quota Minddy. Ad esempio, puoi mantenere il testo su OpenRouter e la trascrizione su OpenAI. Selezionare un fornitore di testo non riattiva un utilizzo Numo precedentemente disattivato.

In **Modello predefinito di Numo**, scegli **Predefinito dell’app** o un modello specifico del fornitore attivo di Numo. La scelta viene salvata per il tuo account e separatamente per ogni fornitore, dopo i ricaricamenti e nelle nuove sessioni. Il valore dell’app segue il modello configurato dall’applicazione per quel fornitore. Il modello scelto esplicitamente in una conversazione ha la precedenza; le conversazioni che seguono il tuo predefinito ricevono le modifiche successive dell’account. I turni già ammessi mantengono il modello fissato. Un modello non più disponibile o oltre i limiti del piano viene rifiutato: scegli un altro modello o il predefinito dell’app. L’esportazione e importazione dell’account includono queste preferenze, senza credenziali dei fornitori.

Una chiave non confermata o irraggiungibile può lasciare le chiamate IA generali supportate sul consumo Minddy quando l’IA gestita è configurata. Il fornitore fattura le chiamate effettuate con la sua chiave. Le chiavi personali validate e il lavoro finanziato da Minddy seguono le [regole di budget qui sotto](#consumption).

![Connessioni, assegnazione per capacità e modello Numo personale sono impostazioni separate.](/documentation/it/ai-providers-and-numo-defaults-flow.svg)

### Modelli locali {#models}

Minddy chiama i modelli di IA dal server, quindi non può usare un modello in esecuzione sul tuo computer. **Aggiungi fornitore** non offre Ollama locale né endpoint locali compatibili con OpenAI. Un endpoint locale salvato in una versione precedente resta visibile in **Fornitori collegati**, ma non può gestire le conversazioni di Numo, le routine o altre funzioni. Rimuovilo e assegna al suo posto un provider raggiungibile dal server. Quando un provider non serve più, rimuovilo tramite il relativo comando di conferma e verifica l’instradamento risultante prima dell’esecuzione successiva.


## Capire i piani Cloud e il consumo IA {#plans-and-ai-usage}

Cloud offre i piani Free, Go e Pro. Tutti includono MCP, conversazioni Numo, azioni contestuali e routine. Cambiano capacità, utilizzo IA incluso, modelli e spazio di archiviazione. Apri Fatturazione per vedere il budget e i consumi correnti e confronta la pagina pubblica dei prezzi prima di scegliere un piano; i dati pubblicati lì costituiscono il riferimento attuale.

Usa il comando di acquisto o di gestione dell’abbonamento offerto al tuo account. Prima di accettare, controlla l’importo, il periodo di fatturazione e la conferma del provider. Un cambio di piano riuscito deve risultare nella fatturazione dell’account: verificalo, invece di considerare la chiusura della finestra di pagamento come una prova.

### Consumo del budget {#consumption}

L’utilizzo IA incluso copre ragionamento e chiamate agli strumenti di Numo, routine, automazioni, dettatura vocale ed elaborazione dei feedback. Il limite mensile dell’IA inclusa si applica al lavoro finanziato da minddy. Il tetto per esecuzione di una routine è un limite distinto che può mettere in pausa quell’esecuzione; il lavoro completato rimane nella conversazione. Questi limiti non autorizzano addebiti automatici per il superamento del budget. Controlla la scheda del limite e la data di ripristino del budget quando è disponibile.

Le chiavi personali compatibili fanno fatturare al provider le chiamate ai modelli anziché consumare l’utilizzo IA incluso. Le famiglie o gli ambiti non assegnati le cui chiamate sono finanziate da minddy restano soggetti al rispettivo budget minddy. L’auto-hosting comporta costi d’infrastruttura e di provider opzionali determinati dall’installazione; eseguire lo stesso nucleo non lo trasforma in un abbonamento Cloud.

### Capacità dei piani {#plan-capacities}

Questi valori predefiniti descrivono Minddy 0.20.0. Prima di acquistare, verifica la pagina dei prezzi e l’account reali: i prezzi configurati per il pagamento e le deroghe dell’account possono differire. Il conteggio degli ospiti esclude il proprietario del progetto e include membri, lettori e inviti in attesa; non esiste una fatturazione per postazione. Lo spazio occupato dai file viene imputato al proprietario del progetto che li riceve. Quando la proprietà viene trasferita, questi limiti, lo spazio e l’IA in background, come Smart Assign e la revisione dei feedback, usano il piano del nuovo proprietario.

| Piano | Progetti | Ticket per progetto | Ospiti per progetto | Spazio | IA mensile inclusa (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimitati | Illimitati | Illimitati | 20 GiB | 5 |
| Pro | Illimitati | Illimitati | Illimitati | 100 GiB | 15 |

La fatturazione mostra il budget IA rimanente e il prossimo ripristino, **Andamento del budget** e **Cosa consuma il budget?**, che suddivide il consumo in **Routine**, **Numo**, **Dettatura vocale**, **Feedback** e **Automazioni** come percentuale del budget incluso. **Cronologia di utilizzo** elenca le azioni del periodo corrente e la loro quota del budget.

## Dettare testo e modifiche {#voice-dictation}

Usa il microfono accanto a un campo compatibile per dettare un ticket, un obiettivo, un commento, un messaggio Numo, un feedback o un’istruzione per una routine. Servono il permesso di scrivere in quel punto, un microfono funzionante e un browser compatibile con la registrazione. Autorizza il microfono per il sito nel browser e nel sistema operativo. Usa HTTPS per un’istanza remota. Nel Cloud deve essere disponibile il budget IA; le istanze self-hosted richiedono anche fornitori di trascrizione e dettatura funzionanti. Le chiavi personali per la voce e i modelli si configurano [più sopra](#ai-keys-and-models).

1. Apri il modulo o il ticket interessato e scegli il suo microfono. In un ticket aperto, Command+Maiusc+D su macOS o Ctrl+Maiusc+D sugli altri sistemi avvia o interrompe la modifica vocale. Verifica che compaiano il timer e la forma d’onda.
2. Parla nella lingua dell’interfaccia, che guida la trascrizione. Per modificare un ticket, indica chiaramente l’azione, ad esempio «Imposta la priorità su alta». Ferma la registrazione con il comando quadrato e attendi la fine della trascrizione e dell’elaborazione Numo prima di chiudere il modulo.
3. Controlla il risultato. Messaggi Numo, commenti e istruzioni delle routine ricevono testo modificabile; rileggilo prima di inviarlo o salvarlo. I moduli di creazione ricevono campi di bozza ancora da confermare. La modifica vocale di un ticket esistente applica subito i cambiamenti: verifica i campi e correggi eventuali errori con i normali comandi. La dettatura non concede permessi aggiuntivi.

### Consumo e limiti di registrazione {#voice-limits}

L’audio viene inviato al servizio di trascrizione configurato, poi può essere corretto o interpretato da un modello IA. Il consumo segue le regole del fornitore e del budget dell’account; registrazione e interpretazione possono generare consumi separati. Il feedback pubblico ha regole proprie di disponibilità e addebito, descritte nella [guida al feedback](/docs/feedback). La demo della pagina iniziale ha un limite separato e non costituisce una quota di dettatura dell’account.

Il servizio di trascrizione per utenti autenticati accetta fino a 10 MiB di audio e 30 richieste per account all’ora. Il registratore condiviso si ferma dopo 20 minuti come precauzione. Preferisci registrazioni brevi per controllare ogni risultato. Conserva il testo esistente fino alla verifica; il registratore non è un backup dell’audio.

### Riprendere dopo un errore {#voice-recovery}

Se l’accesso è negato, abilita il microfono per il sito e per il browser o l’app desktop nel sistema operativo. Se non viene trovato un dispositivo, collega o seleziona un microfono; se è occupato, chiudi l’applicazione che lo usa. Se la registrazione non è supportata, usa un browser compatibile o scrivi il testo.

In caso di silenzio o risultato vuoto, controlla il dispositivo di ingresso e fai una breve registrazione udibile. Dividi le registrazioni troppo grandi. Il messaggio sul limite di richieste indica quanto attendere; aspetta prima di riprovare. Per errori di budget o del fornitore, controlla il consumo IA, le assegnazioni vocali e la configurazione dell’istanza. Se la correzione fallisce ma viene restituita la trascrizione, rileggi e modifica quel testo. Prima di ripetere una modifica fallita, controlla i campi correnti per non applicarla due volte.