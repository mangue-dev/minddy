---
{
  "id": "ai-keys-and-models",
  "locale": "it",
  "title": "Configurare chiavi IA personali e modelli",
  "summary": "Scegliere fornitori e utilizzi considerando fatturazione e calcolo della sandbox.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/ai-keys-and-models-workflow.png",
      "alt": "Scheda del fornitore IA con minddy Cloud selezionato.",
      "caption": "Il fornitore Cloud selezionato usa il piano dell’account. Il selettore permette di configurare fornitori personali.",
      "revision": 4,
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
      "revision": 4,
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
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Aggiungere e assegnare un fornitore {#ai-keys-and-models}

Apri le impostazioni IA dell’account, aggiungi un provider compatibile e inserisci la sua chiave e l’eventuale URL di base richiesto. Salva e controlla lo stato di conferma. Per le chiamate IA con un’alternativa gestita disponibile, una chiave non confermata o irraggiungibile mantiene l’utilizzo su Minddy. Questo richiede IA gestita configurata; i worker di codice seguono le regole del modello legato al provider riportate sotto. Non incollare mai la chiave in una conversazione o in una schermata.

Assegna le famiglie di modelli per testo, trascrizione ed embedding a chiavi compatibili, oppure lascia che usino Minddy. Per ogni chiave, scegli gli ambiti abilitati: conversazioni Numo, lavoro sul codice, automazioni, voce e feedback. Un ambito o una famiglia senza un’assegnazione utilizzabile continua a consumare il budget di Minddy. Il provider fattura le chiamate effettuate con la sua chiave. Il calcolo nella sandbox server continua ad avere un costo reale e viene registrato nell’utilizzo. Questa registrazione è distinta dall’applicazione di un limite dell’account: un worker con BYOK convalidato non è soggetto alla quota del piano né al limite di calcolo, mentre il lavoro finanziato da Minddy resta soggetto al budget incluso.

![Scheda del fornitore IA con minddy Cloud selezionato.](/documentation/it/ai-keys-and-models-workflow.png)


## Modelli e luogo di esecuzione {#models}

La scelta del modello di codice è legata al suo provider. Dopo la modifica, la disattivazione o la perdita di una chiave personale, la scelta precedente potrebbe non corrispondere più al provider attivo. Un nuovo worker rifiuta quindi di avviarsi finché non scegli un modello compatibile nelle impostazioni IA dell’account; non seleziona automaticamente un modello più economico o un valore predefinito della piattaforma. Un’esecuzione BYOK già fissata non cambia chi paga quando la sua chiave diventa indisponibile.

Qui puoi impostare il modello di codice e il livello di ragionamento predefiniti per i nuovi worker. I worker già esistenti conservano il livello di ragionamento fissato alla loro creazione. Scegli separatamente regione e dimensione per le nuove sandbox. Questi valori predefiniti non sostituiscono il modello selezionato in una conversazione.

Quando configurati, Ollama locale e gli endpoint compatibili con OpenAI possono gestire le conversazioni tramite il bridge desktop. Non possono gestire il lavoro sul codice delegato o le routine eseguite nella sandbox server. Per questi ambiti serve un provider raggiungibile dal server. Quando un provider non serve più, rimuovilo tramite il relativo comando di conferma e verifica l’instradamento risultante prima dell’esecuzione successiva.

![Modello di codice e ragionamento predefiniti.](/documentation/it/ai-keys-and-models-defaults-workflow.png)
