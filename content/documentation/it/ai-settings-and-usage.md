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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection",
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
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
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
      "revision": 9,
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
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modello di codice e ragionamento predefiniti.",
      "caption": "Modello e ragionamento predefiniti di OpenCode. I nuovi agenti OpenCode usano questi valori; gli agenti in corso mantengono le impostazioni fissate.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        217
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
      "revision": 9,
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
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Le impostazioni IA dell’account definiscono chiavi personali, ambiti e modelli predefiniti. Controlla l’instradamento dei modelli prima di avviare il lavoro. Su Cloud, usa la fatturazione per distinguere utilizzo incluso, chiamate con chiavi personali, calcolo nella sandbox e limiti delle routine. In self-hosted, disponibilità e costi dipendono dalla configurazione dell’istanza.

## Configurare chiavi IA personali e modelli {#ai-keys-and-models}

Apri le impostazioni IA dell’account, aggiungi un provider compatibile e inserisci la sua chiave e l’eventuale URL di base richiesto. Salva e controlla lo stato di conferma. Per le chiamate IA con un’alternativa gestita disponibile, una chiave non confermata o irraggiungibile mantiene l’utilizzo su minddy. Questo richiede IA gestita configurata; i worker di codice seguono le regole del modello legato al provider riportate sotto. Non incollare mai la chiave in una conversazione o in una schermata.

Assegna le famiglie di modelli per testo, trascrizione ed embedding a chiavi compatibili, oppure lascia che usino minddy. Per ogni chiave, scegli gli ambiti abilitati: conversazioni Numo, lavoro sul codice, automazioni, voce e feedback. Un ambito o una famiglia senza un’assegnazione utilizzabile continua a consumare il budget di minddy. Il provider fattura le chiamate effettuate con la sua chiave. Il calcolo nella sandbox server continua ad avere un costo reale e viene registrato nell’utilizzo. Questa registrazione è distinta dall’applicazione di un limite dell’account: un worker con BYOK convalidato non è soggetto alla quota del piano né al limite di calcolo, mentre il lavoro finanziato da minddy resta soggetto al budget incluso.

![Scheda del fornitore IA con minddy Cloud selezionato.](/documentation/it/ai-keys-and-models-workflow.png)

### Scegliere un abbonamento personale per il codice nell’anteprima privata {#native-agent-preview}

Se il tuo account è abilitato all’anteprima privata, le impostazioni IA dell’account mostrano **Abbonamenti personali per il codice**. Scegli **Collega Codex** o **Collega Claude Code** e autorizza l’accesso con il tuo account nella pagina ufficiale del fornitore. Per Codex, inserisci il codice di accesso mostrato in quella pagina. Se Claude richiede un codice di autorizzazione, incolla solo quel codice in Minddy e scegli **Completa connessione**. Devi avere accesso a Codex o un abbonamento Claude che includa Claude Code. **Annulla connessione** interrompe un tentativo in corso.

Dopo la connessione, **Prova nuove sandbox** verifica l’accesso nativo e gli strumenti Minddy in due nuove sandbox ospitate. Controlla il risultato, inclusa l’eliminazione di ogni sandbox. Un test di accesso riuscito non dimostra il rinnovo dell’autenticazione: un messaggio separato indica quando il rinnovo non è stato osservato. La connessione viene salvata per i test successivi; collegati di nuovo se l’accesso scade o non può essere ripristinato. **Disconnetti** rimuove la connessione salvata da Minddy, senza annullare l’abbonamento al fornitore.

Dopo la connessione, seleziona **Codex** o **Claude Code** in **Agente di codice**. Numo usa questa scelta per i nuovi agenti del repository: implementazione di ticket, pianificazione, verifica e lavoro richiesto in conversazioni o routine. Il CLI nativo sceglie modello e ragionamento; i valori del modello API di OpenCode non si applicano. Gli agenti operano in sandbox server ospitate con gli strumenti Minddy. Non servono un computer locale o una sandbox permanente.

L’anteprima nativa espone gli strumenti Minddy controllati tramite MCP. Strumenti integrati nativi del fornitore, immagini in ingresso e sottoagenti non sono disponibili in questi adattatori. Numo legge le capacità dell’adattatore scelto e riceve quelle fissate dell’agente con il risultato. Gestisce le domande dell’agente usando il contesto affidabile della conversazione oppure ti chiede una decisione mancante. Numo può usare i propri strumenti supportati entro la tua autorizzazione; non inventa operazioni non supportate dal motore.

Una connessione mancante, un accesso scaduto o un limite del fornitore interrompe il lavoro nativo. Minddy non passa automaticamente a OpenCode, a un altro provider API o a un altro pagatore. Ricollega l’account selezionato oppure scegli esplicitamente **OpenCode**. Disconnettere l’account o perdere l’accesso all’anteprima mantiene visibile la scelta salvata finché non la cambi. Gli agenti esistenti mantengono il motore scelto all’avvio.

Il tuo abbonamento finanzia l’uso del modello nativo. Le chiamate della conversazione Numo e il calcolo delle sandbox seguono ancora le regole di utilizzo e budget Minddy. L’anteprima è riservata agli account abilitati; l’esecuzione reale di Claude Code con un abbonamento a pagamento non è ancora stata verificata. Una connessione o un test di avvio riuscito non dimostra che funzionino tutti i piani, il rinnovo dell’autenticazione o un’implementazione completa.

### Modelli e luogo di esecuzione {#models}

**OpenCode:** La scelta del modello di codice è legata al suo provider. Dopo la modifica, la disattivazione o la perdita di una chiave personale, la scelta precedente potrebbe non corrispondere più al provider attivo. Un nuovo worker rifiuta quindi di avviarsi finché non scegli un modello compatibile nelle impostazioni IA dell’account; non seleziona automaticamente un modello più economico o un valore predefinito della piattaforma. Un’esecuzione BYOK già fissata non cambia chi paga quando la sua chiave diventa indisponibile.

Con **OpenCode**, imposta qui modello di codice e ragionamento predefiniti per i nuovi agenti. Con **Codex** o **Claude Code**, il CLI sceglie questi valori. Gli agenti esistenti mantengono le impostazioni fissate. Scegli regione e dimensioni della sandbox separatamente. Queste scelte non sostituiscono il modello della conversazione.

Quando configurati, Ollama locale e gli endpoint compatibili con OpenAI possono gestire le conversazioni tramite il bridge desktop. Non possono gestire il lavoro sul codice delegato o le routine eseguite nella sandbox server. Per questi ambiti serve un provider raggiungibile dal server. Quando un provider non serve più, rimuovilo tramite il relativo comando di conferma e verifica l’instradamento risultante prima dell’esecuzione successiva.

![Modello di codice e ragionamento predefiniti.](/documentation/it/ai-keys-and-models-defaults-workflow.png)

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
