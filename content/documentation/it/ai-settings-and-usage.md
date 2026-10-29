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
  "revision": 24,
  "sourceRevision": 23,
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
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
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (model pickers show the default's model by name instead of App default when that model is in the catalog, and choosing it keeps following the default; checked against components/agent/model-combobox.tsx and components/settings/account-ai-keys-section.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure changed, the diagram does not show picker labels)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "alt": "Fornitori collegati, un fornitore per utilizzo, e fornitore e modello di Numo sono impostazioni separate.",
      "caption": "Ogni utilizzo passa da minddy Cloud o da un fornitore collegato. Il predefinito di Numo è salvato per fornitore; una conversazione può scegliere fornitore e modello propri.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Fornitori, utilizzi e Numo",
        "items": [
          {
            "title": "Fornitori collegati",
            "detail": "minddy Cloud e le tue chiavi API restano disponibili fianco a fianco."
          },
          {
            "title": "Un fornitore per utilizzo",
            "detail": "Ogni utilizzo specifico, dai titoli di Numo alla trascrizione, sceglie il proprio fornitore."
          },
          {
            "title": "Fornitore e modello di Numo",
            "detail": "Scegli un fornitore, poi il suo modello. Una conversazione può scegliere i propri."
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

Nelle impostazioni IA dell’account, **Fornitori collegati** elenca minddy Cloud, incluso nel tuo piano, e i fornitori API che hai collegato. Scegli **Aggiungi fornitore**, seleziona un fornitore, inserisci la sua chiave API e l’eventuale URL di base richiesto, poi salva. Puoi collegare più fornitori; aggiungerne uno non rimuove gli altri e non cambia ciò che usano i tuoi utilizzi. Non incollare mai una chiave in una conversazione o in uno screenshot.

Più in basso, **Numo**, **Automazioni**, **Dettatura vocale** e **Feedback** elencano i loro utilizzi specifici, come conversazioni, titoli delle conversazioni e ricerca web di Numo, oppure Smart Fill e da voce a testo. Ogni utilizzo sceglie il proprio fornitore, minddy Cloud o uno collegato, e cambia da solo: puoi lasciare tutto su minddy Cloud tranne le conversazioni di Numo. Un utilizzo propone solo i fornitori in grado di servirlo: la trascrizione e la ricerca per significato richiedono un fornitore con quei modelli, e la ricerca web richiede minddy Cloud o una chiave OpenRouter. Quando un utilizzo passa da una delle tue chiavi, il suo modello compare sotto il fornitore: mantieni il modello preselezionato dal fornitore o scegline un altro. Le scelte si applicano subito. Su un’istanza senza minddy Cloud, un fornitore appena collegato serve ogni utilizzo che non ne ha ancora uno.

Per le **Conversazioni** di Numo, scegli il fornitore, poi un modello di quel fornitore. Il selettore mostra il modello predefinito dell’app con il suo nome, spuntato finché lo segui; sceglierlo mantiene la tua impostazione legata al predefinito dell’app, quindi le sue modifiche successive continuano ad applicarsi. **Predefinito dell’app** compare come opzione solo quando quel modello non è nel catalogo. Questa scelta viene salvata per il tuo account e separatamente per ogni fornitore, tra un ricaricamento e l’altro e nelle nuove sessioni. In una conversazione, l’elenco dei modelli accanto al microfono si apre sui fornitori quando ce ne sono diversi; scegline uno per vedere i suoi modelli. La conversazione mantiene quel fornitore e quel modello, e le conversazioni che seguono il tuo predefinito recepiscono le modifiche successive dell’account. I turni già ammessi mantengono fornitore e modello fissati. Un modello salvato che diventa indisponibile o supera il tuo piano viene rifiutato: scegli un altro modello o il modello predefinito dell’app. Se il fornitore di una conversazione viene rimosso, Numo ti chiede di sceglierne un altro invece di cambiarlo da solo. L’esportazione e l’importazione dell’account includono queste preferenze di modello, senza le credenziali dei fornitori.

Una chiave non confermata o irraggiungibile può lasciare le chiamate IA generali supportate sul consumo Minddy quando l’IA gestita è configurata. Il fornitore fattura le chiamate effettuate con la sua chiave. Le chiavi personali validate e il lavoro finanziato da Minddy seguono le [regole di budget qui sotto](#consumption).

![Fornitori collegati, un fornitore per utilizzo, e fornitore e modello di Numo sono impostazioni separate.](/documentation/it/ai-providers-and-numo-defaults-flow.svg)

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

1. Apri il modulo o il ticket interessato e scegli il suo microfono. In un ticket aperto, Command+Maiusc+D su macOS o Ctrl+Maiusc+D sugli altri sistemi avvia o interrompe la modifica vocale. In fondo allo schermo si apre una barra di dettatura, come pannello su un telefono, con il timer e un’onda che segue la tua voce. Il resto dell’interfaccia attende la fine della registrazione.
2. Parla nella lingua dell’interfaccia, che guida la trascrizione. Per modificare un ticket, indica chiaramente l’azione, ad esempio «Imposta la priorità su alta». Scegli **Trascrivi** (✓), premi Command+Invio su macOS o Ctrl+Invio sugli altri sistemi (funziona anche Invio) o ripeti la scorciatoia, poi attendi la fine della trascrizione e dell’elaborazione Numo. Per scartare la registrazione, scegli **Scarta registrazione** (✕) o premi Esc, poi conferma **Scarta**: non viene inviato nulla.
3. Controlla il risultato. Messaggi Numo, commenti e istruzioni delle routine ricevono testo modificabile; rileggilo prima di inviarlo o salvarlo. I moduli di creazione ricevono campi di bozza ancora da confermare. Nel modulo di nuovo ticket con Smart Fill attivo, la dettatura lascia a Smart Fill il titolo (quando lo scrive Smart Fill), la priorità, l’impegno, le categorie e l’obiettivo, a meno che tu non chieda una di queste proprietà, per esempio «imposta l’impegno su M». La modifica vocale di un ticket esistente applica subito i cambiamenti: verifica i campi e correggi eventuali errori con i normali comandi. La dettatura non concede permessi aggiuntivi.

### Consumo e limiti di registrazione {#voice-limits}

L’audio viene inviato al servizio di trascrizione configurato, poi può essere corretto o interpretato da un modello IA. La pulizia corregge punteggiatura, intercalari e autocorrezioni; per inserire le parole così come sono state sentite, disattiva **Ripulisci le dettature** in **Impostazioni account** > **Preferenze** > **Dettatura vocale**, e nessun modello di pulizia viene chiamato per le tue dettature. Con o senza pulizia, minddy rimuove le frasi che i modelli di trascrizione inventano sul silenzio, come i crediti dei sottotitoli o un «Grazie per la visione» finale. Il feedback pubblico mantiene la propria elaborazione. In **Vocabolario**, subito sotto, aggiungi fino a 50 nomi e termini che la dettatura deve scrivere a modo tuo; compila **Sentito come** per sostituire quella parola in ogni dettatura, anche senza pulizia. Il consumo segue le regole del fornitore e del budget dell’account; registrazione e interpretazione possono generare consumi separati. Il feedback pubblico ha regole proprie di disponibilità e addebito, descritte nella [guida al feedback](/docs/feedback). La demo della pagina iniziale ha un limite separato e non costituisce una quota di dettatura dell’account.

Il servizio di trascrizione per utenti autenticati accetta fino a 10 MiB di audio e 30 richieste per account all’ora. Il registratore condiviso si ferma dopo 20 minuti come precauzione. Preferisci registrazioni brevi per controllare ogni risultato. Conserva il testo esistente fino alla verifica; il registratore non è un backup dell’audio.

### Riprendere dopo un errore {#voice-recovery}

Se l’accesso è negato, abilita il microfono per il sito e per il browser o l’app desktop nel sistema operativo. Se non viene trovato un dispositivo, collega o seleziona un microfono; se è occupato, chiudi l’applicazione che lo usa. Se la registrazione non è supportata, usa un browser compatibile o scrivi il testo.

In caso di silenzio o risultato vuoto, controlla il dispositivo di ingresso e fai una breve registrazione udibile. Dividi le registrazioni troppo grandi. Il messaggio sul limite di richieste indica quanto attendere; aspetta prima di riprovare. Per errori di budget o del fornitore, controlla il consumo IA, le assegnazioni vocali e la configurazione dell’istanza. Se la correzione fallisce ma viene restituita la trascrizione, rileggi e modifica quel testo. Prima di ripetere una modifica fallita, controlla i campi correnti per non applicarla due volte.