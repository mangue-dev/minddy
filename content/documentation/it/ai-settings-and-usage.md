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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls",
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
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance)",
    "date": "2026-10-11"
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
      "kind": "screenshot",
      "src": "/documentation/it/ai-keys-and-models-workflow.png",
      "alt": "Scheda del fornitore IA con minddy Cloud selezionato.",
      "caption": "Il fornitore Cloud selezionato usa il piano dell’account. Il selettore permette di configurare fornitori personali.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/plans-and-ai-usage-workflow.png",
      "alt": "Pagina di utilizzo IA dell’account dimostrativo.",
      "caption": "Pagina di utilizzo IA dell’account dimostrativo. Budget, categorie e cronologia provengono dall’account; non sono stati avviati acquisti né esecuzioni a pagamento.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Le impostazioni IA dell’account definiscono chiavi personali, ambiti e modelli predefiniti. Controlla l’instradamento dei modelli prima di avviare il lavoro. Su Cloud, usa la fatturazione per distinguere utilizzo incluso, chiamate con chiavi personali, calcolo nella sandbox e limiti delle routine. In self-hosted, disponibilità e costi dipendono dalla configurazione dell’istanza.

Le impostazioni IA separano **IA di Minddy** e **Agente di codice**. L’IA di Minddy configura i provider API per conversazioni Numo, automazioni, voce e feedback. Gli abbonamenti di programmazione si applicano solo agli agenti dei repository; non finanziano l’IA generale di Minddy.

## Configurare chiavi IA personali e modelli {#ai-keys-and-models}

Apri le impostazioni IA dell’account, aggiungi un provider compatibile e inserisci la sua chiave e l’eventuale URL di base richiesto. Salva e controlla lo stato di conferma. Per le chiamate IA con un’alternativa gestita disponibile, una chiave non confermata o irraggiungibile mantiene l’utilizzo su minddy. Questo richiede IA gestita configurata; i worker di codice seguono le regole del modello legato al provider riportate sotto. Non incollare mai la chiave in una conversazione o in una schermata.

Assegna le famiglie di modelli per testo, trascrizione ed embedding a chiavi compatibili, oppure lascia che usino minddy. Per ogni chiave, scegli gli ambiti abilitati: conversazioni Numo, automazioni, voce e feedback. Scegli il finanziamento di OpenCode separatamente in **Agente di codice**. Un ambito o una famiglia senza un’assegnazione utilizzabile continua a consumare il budget di minddy. Il provider fattura le chiamate effettuate con la sua chiave. Il calcolo nella sandbox server continua ad avere un costo reale e viene registrato nell’utilizzo. Questa registrazione è distinta dall’applicazione di un limite dell’account: un worker con BYOK convalidato non è soggetto alla quota del piano né al limite di calcolo, mentre il lavoro finanziato da minddy resta soggetto al budget incluso.

![Scheda del fornitore IA con minddy Cloud selezionato.](/documentation/it/ai-keys-and-models-workflow.png)

### Scegliere l’agente di codice {#native-agent-preview}

**Claude Code è Sperimentale.** Richiede un piano che includa Claude Code; un account Free non basta. L’esecuzione reale con abbonamento e il rinnovo delle sessioni non sono ancora validati. Collegare un account non garantisce che il suo piano possa eseguire il modello selezionato.

Dopo aver ricollegato l’account, chiedi esplicitamente a Numo di continuare l’agente precedente oppure invia un nuovo messaggio nella sua conversazione di codice. Minddy crea una nuova esecuzione con la nuova connessione, mantenendo motore, modello, ragionamento, ramo e contesto disponibile entro il limite di dimensione. L’esecuzione precedente conserva la generazione di connessione registrata; la connessione degli agenti attivi non viene mai sostituita.

In **Agente di codice**, scegli **OpenCode (Minddy Cloud)** oppure OpenCode con il provider di modelli di testo configurato sopra. **Provider IA** sceglie il finanziamento del lavoro sul codice indipendentemente dalle altre funzioni API. Configura qui modello e ragionamento OpenCode. Regione e dimensioni della sandbox sono nella stessa sezione e si applicano agli agenti ospitati.

Scegli prima **Codex** o **Claude Code** per mostrare solo i relativi controlli di connessione. La scelta non collega l’account e non avvia lavoro. I controlli attuali di accesso Codex descrivono il prototipo tecnico storico; non usarli in Minddy ospitato finché un’integrazione autorizzata non sostituisce questo meccanismo. Per gli account Claude abilitati, **Collega Claude Code** avvia l’autorizzazione nel browser. Autorizza solo nella pagina ufficiale Claude e incolla soltanto il suo codice di autorizzazione in Minddy, poi scegli **Completa connessione** quando richiesto. **Annulla connessione** interrompe un tentativo. **Disconnetti** rimuove l’accesso salvato da Minddy; non annulla l’abbonamento e non conferma la revoca OAuth remota.

L’autenticazione Codex tramite abbonamento nei servizi ospitati non è disponibile per uso generale. OpenAI esclude esplicitamente l’autenticazione app-server da questi servizi e li indirizza a Sign in with ChatGPT. Minddy deve usare un’integrazione autorizzata prima del lancio. I test tecnici limitati non dimostrano l’autorizzazione del provider o il recupero dopo la scadenza naturale dei token. L’esecuzione a pagamento di Claude Code resta non testata. Rimuovere i badge dall’interfaccia non cambia queste condizioni. [OpenAI app-server](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).

Le conversazioni degli agenti nativi mostrano motore, modello e ragionamento salvati, oppure i valori predefiniti senza una scelta esplicita. Non offrono controlli API OpenCode o allegati immagine. Le conversazioni OpenCode mantengono i controlli API.

Prima di delegare, Numo riceve la scelta attuale dell’account e le capacità dell’adattatore selezionato. Una volta avviato l’agente, il suo motore e le sue capacità salvati hanno la precedenza per quella esecuzione, anche dopo modifiche alle impostazioni dell’account. Numo nomina questo agente quando spiega il lavoro delegato. Se non può leggere la scelta dell’account, controlla le impostazioni anziché indovinarla.

L’adattatore nativo espone gli strumenti Minddy controllati tramite MCP. Strumenti integrati nativi del fornitore, immagini in ingresso e sottoagenti non sono disponibili in questi adattatori. Gestisce le domande dell’agente usando il contesto affidabile della conversazione oppure ti chiede una decisione mancante. Numo può usare i propri strumenti supportati entro la tua autorizzazione; non inventa operazioni non supportate dal motore.

Una connessione mancante, un accesso scaduto o un limite del fornitore interrompe il lavoro nativo. Minddy non passa automaticamente a OpenCode, a un altro provider API o a un altro pagatore. Scegli esplicitamente **OpenCode** per usare il percorso API. Codex ospitato deve attendere l’integrazione autorizzata; un nuovo accesso tramite codice non è un recupero consentito. Per Claude, ricollega l’account selezionato quando l’accesso è disponibile. Disconnettere l’account o perdere l’accesso mantiene la scelta salvata finché non la cambi. Gli agenti esistenti mantengono il motore registrato.

Gli abbonamenti nativi finanziano solo i modelli di codice; le chiamate API di Numo e il calcolo delle sandbox restano contabilizzati separatamente.

### Modelli e luogo di esecuzione {#models}

**OpenCode:** La scelta del modello di codice è legata al suo provider. Dopo la modifica, la disattivazione o la perdita di una chiave personale, la scelta precedente potrebbe non corrispondere più al provider attivo. Un nuovo worker rifiuta quindi di avviarsi finché non scegli un modello compatibile nelle impostazioni IA dell’account; non seleziona automaticamente un modello più economico o un valore predefinito della piattaforma. Un’esecuzione BYOK già fissata non cambia chi paga quando la sua chiave diventa indisponibile.

In **Agente di codice**, scegli modello e ragionamento per i nuovi agenti. **Automatico** lascia all’agente selezionato il valore predefinito. **Aggiorna modelli** legge il catalogo della CLI Codex collegata, inclusi i livelli di ragionamento supportati. Non usa l’elenco API di OpenRouter. Aggiorna dopo un cambio di connessione o per vedere le opzioni attuali. Il tuo account può limitare un modello elencato da Codex; l’esecuzione ne conferma l’accesso. Claude Code offre gli alias **Sonnet**, **Opus** e **Haiku**, che seguono le raccomandazioni della CLI installata. L’esecuzione con un abbonamento Claude non è ancora stata testata. L’aggiornamento avvia brevemente una sandbox e poi la distrugge; il calcolo viene registrato separatamente dai modelli usati con l’abbonamento.

Con Codex o Claude Code, cambiare modello reimposta il ragionamento su **Automatico** per non mantenere un livello incompatibile del modello precedente. Scegli poi un livello supportato. OpenCode, Codex e Claude Code conservano preferenze separate. Gli agenti esistenti mantengono motore, modello e ragionamento salvati all’avvio, anche alla ripresa. Queste scelte non cambiano il modello delle conversazioni Numo. Regione e dimensione della sandbox restano nella stessa sezione.

Quando configurati, Ollama locale e gli endpoint compatibili con OpenAI possono gestire le conversazioni tramite il bridge desktop. Non possono gestire il lavoro sul codice delegato o le routine eseguite nella sandbox server. Per questi ambiti serve un provider raggiungibile dal server. Quando un provider non serve più, rimuovilo tramite il relativo comando di conferma e verifica l’instradamento risultante prima dell’esecuzione successiva.


## Capire i piani Cloud e il consumo IA {#plans-and-ai-usage}

Cloud offre i piani Free, Go e Pro. Tutti includono MCP, conversazioni Numo, azioni contestuali, lavoro sul codice e routine. Cambiano capacità, utilizzo IA incluso, modelli e spazio di archiviazione. Apri Fatturazione per vedere il budget e i consumi correnti e confronta la pagina pubblica dei prezzi prima di scegliere un piano; i dati pubblicati lì costituiscono il riferimento attuale.

Usa il comando di acquisto o di gestione dell’abbonamento offerto al tuo account. Prima di accettare, controlla l’importo, il periodo di fatturazione e la conferma del provider. Un cambio di piano riuscito deve risultare nella fatturazione dell’account: verificalo, invece di considerare la chiusura della finestra di pagamento come una prova.

### Consumo del budget {#consumption}

L’utilizzo IA incluso copre ragionamento, chiamate agli strumenti minddy, automazioni, chiamate al modello del worker e calcolo nella sandbox server. Il limite mensile dell’IA inclusa si applica al lavoro finanziato da minddy. Il tetto per esecuzione di una routine è un limite distinto che può mettere in pausa quell’esecuzione; il lavoro completato rimane nella conversazione. Questi limiti non autorizzano addebiti automatici per il superamento del budget. Controlla la scheda del limite e la data di ripristino del budget quando è disponibile.

Le chiavi personali compatibili fanno fatturare al provider le chiamate ai modelli anziché consumare l’utilizzo IA incluso. Un worker che usa una chiave BYOK convalidata non è soggetto alla quota del piano né al limite di calcolo dell’account. Il calcolo nella sandbox continua ad avere un costo reale e viene registrato nell’utilizzo; questa registrazione non significa che il limite mensile del piano si applichi a quell’esecuzione BYOK. Le famiglie o gli ambiti non assegnati le cui chiamate sono finanziate da minddy restano soggetti al rispettivo budget minddy. L’auto-hosting comporta costi d’infrastruttura e di provider opzionali determinati dall’installazione; eseguire lo stesso nucleo non lo trasforma in un abbonamento Cloud.

### Capacità della versione candidata {#plan-capacities}

Questi valori predefiniti descrivono la versione candidata 0.11.1 identificata. Prima di acquistare, verifica la pagina dei prezzi e l’account reali: i prezzi configurati per il pagamento e le deroghe dell’account possono differire. Il conteggio degli ospiti esclude il proprietario del progetto. Lo spazio occupato dai file viene imputato al proprietario del progetto che li riceve.

| Piano | Progetti | Ticket per progetto | Ospiti per progetto | Spazio | IA mensile inclusa (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimitati | Illimitati | Illimitati | 20 GiB | 5 |
| Pro | Illimitati | Illimitati | Illimitati | 100 GiB | 15 |

![Pagina di utilizzo IA dell’account dimostrativo.](/documentation/it/plans-and-ai-usage-workflow.png)

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
