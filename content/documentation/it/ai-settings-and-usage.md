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
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "lib/billing-plans.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modello di codice e ragionamento predefiniti.",
      "caption": "Modello di codice e ragionamento predefiniti. I nuovi worker usano questi valori; quelli già in esecuzione mantengono le impostazioni fissate.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/plans-and-ai-usage-workflow.png",
      "alt": "Pagina di utilizzo IA dell’account dimostrativo.",
      "caption": "Pagina di utilizzo IA dell’account dimostrativo. Budget, categorie e cronologia provengono dall’account; non sono stati avviati acquisti né esecuzioni a pagamento.",
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
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Le impostazioni IA dell’account definiscono chiavi personali, ambiti e modelli predefiniti. Su Cloud, la fatturazione mostra piano e utilizzo incluso; chiamate con chiavi personali e calcolo nella sandbox seguono le distinzioni descritte sotto. In self-hosted, disponibilità e costi dipendono dalla configurazione dell’istanza.

## Configurare chiavi IA personali e modelli {#ai-keys-and-models}

Apri le impostazioni IA dell’account, aggiungi un provider compatibile e inserisci la sua chiave e l’eventuale URL di base richiesto. Salva e controlla lo stato di conferma. Per le chiamate IA con un’alternativa gestita disponibile, una chiave non confermata o irraggiungibile mantiene l’utilizzo su minddy. Questo richiede IA gestita configurata; i worker di codice seguono le regole del modello legato al provider riportate sotto. Non incollare mai la chiave in una conversazione o in una schermata.

Assegna le famiglie di modelli per testo, trascrizione ed embedding a chiavi compatibili, oppure lascia che usino minddy. Per ogni chiave, scegli gli ambiti abilitati: conversazioni Numo, lavoro sul codice, automazioni, voce e feedback. Un ambito o una famiglia senza un’assegnazione utilizzabile continua a consumare il budget di minddy. Il provider fattura le chiamate effettuate con la sua chiave. Il calcolo nella sandbox server continua ad avere un costo reale e viene registrato nell’utilizzo. Questa registrazione è distinta dall’applicazione di un limite dell’account: un worker con BYOK convalidato non è soggetto alla quota del piano né al limite di calcolo, mentre il lavoro finanziato da minddy resta soggetto al budget incluso.

![Scheda del fornitore IA con minddy Cloud selezionato.](/documentation/it/ai-keys-and-models-workflow.png)

### Modelli e luogo di esecuzione {#models}

La scelta del modello di codice è legata al suo provider. Dopo la modifica, la disattivazione o la perdita di una chiave personale, la scelta precedente potrebbe non corrispondere più al provider attivo. Un nuovo worker rifiuta quindi di avviarsi finché non scegli un modello compatibile nelle impostazioni IA dell’account; non seleziona automaticamente un modello più economico o un valore predefinito della piattaforma. Un’esecuzione BYOK già fissata non cambia chi paga quando la sua chiave diventa indisponibile.

Qui puoi impostare il modello di codice e il livello di ragionamento predefiniti per i nuovi worker. I worker già esistenti conservano il livello di ragionamento fissato alla loro creazione. Scegli separatamente regione e dimensione per le nuove sandbox. Questi valori predefiniti non sostituiscono il modello selezionato in una conversazione.

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
