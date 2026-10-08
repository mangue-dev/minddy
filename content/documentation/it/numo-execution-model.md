---
{
  "id": "numo-execution-model",
  "locale": "it",
  "title": "Comprendere turni duraturi Numo e lavoro delegato",
  "summary": "Messaggi, azioni e routine alimentano le conversazioni Numo.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/it/numo-execution-model-flow.svg",
      "alt": "Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.",
      "caption": "Segui le fasi in questo ordine. Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-execution-model-flow"
  ]
}
---

## Comprendere turni duraturi Numo e lavoro delegato {#numo-execution-model}

Messaggi, azioni e routine alimentano le conversazioni Numo. Modello e livello di ragionamento della conversazione si scelgono nel composer; il lavoro sul codice delegato usa il modello di codice e il livello di ragionamento predefiniti dell’account. Gli strumenti diretti non richiedono un repository. Una sandbox server del repository collegato viene aperta solo quando serve lavorare sul codice. Una routine crea una nuova conversazione con le istruzioni e il contesto del proprietario e del progetto. Non è necessario mantenere il desktop online.

![Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.](/documentation/it/numo-execution-model-flow.svg)

## Separare esecuzione e visualizzazione {#state}

L’intenzione viene registrata in un turno duraturo con UUID e messaggio. Il turno passa da queued a running, quindi a completed, waiting_input o waiting_work. stopping e stopped indicano un arresto; retryable e failed indicano un errore. Il flusso SSE mostra l’attività, ma non governa l’esecuzione. Dopo una riconnessione, il client legge gli eventi successivi alla sequenza già ricevuta. La conclusione di un worker riprende solo il turno padre dell’esecuzione corrente; notifiche duplicate o tardive non avviano altro lavoro. Il contesto non concede accesso: gli oggetti privati rimangono privati.

## Gestire modifiche incerte {#mutations}

Prima di una modifica, il sistema registra l’operazione e il relativo checkpoint; riutilizza i risultati già completati. Una lettura interrotta può essere ripetuta, mentre una modifica con esito incerto entra in reconciling senza un nuovo tentativo automatico. Controlla la destinazione prima di scrivere ancora. Le routine rispettano proprietà, budget e protezioni di costo; un altro membro non eredita la precedente connessione MCP personale. Arrestare il turno padre interrompe la delega, ma un’azione esterna già inviata può comunque terminare.
