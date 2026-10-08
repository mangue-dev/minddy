---
{
  "id": "plans-and-ai-usage",
  "locale": "it",
  "title": "Capire piani Cloud e consumo IA",
  "summary": "Controllare capacità attuale e distinguere quota, fornitori e infrastruttura.",
  "topic": "Account e applicazioni",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 2,
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
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/plans-and-ai-usage-workflow.png",
      "alt": "Pagina di utilizzo IA dell’account dimostrativo.",
      "caption": "Pagina di utilizzo IA dell’account dimostrativo. Budget, categorie e cronologia provengono dall’account; non sono stati avviati acquisti né esecuzioni a pagamento.",
      "revision": 3,
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
    "plans-and-ai-usage-workflow"
  ]
}
---

## Confrontare l’account attuale {#plans-and-ai-usage}

Cloud offre i piani Free, Go e Pro. Tutti includono MCP, conversazioni Numo, azioni contestuali, lavoro sul codice e routine. Cambiano capacità, utilizzo IA incluso, modelli e spazio di archiviazione. Apri Fatturazione per vedere il budget e i consumi correnti e confronta la pagina pubblica dei prezzi prima di scegliere un piano; i dati pubblicati lì costituiscono il riferimento attuale.

Usa il comando di acquisto o di gestione dell’abbonamento offerto al tuo account. Prima di accettare, controlla l’importo, il periodo di fatturazione e la conferma del provider. Un cambio di piano riuscito deve risultare nella fatturazione dell’account: verificalo, invece di considerare la chiusura della finestra di pagamento come una prova.


## Consumo del budget {#consumption}

L’utilizzo IA incluso copre ragionamento, chiamate agli strumenti Minddy, automazioni, chiamate al modello del worker e calcolo nella sandbox server. Il limite mensile dell’IA inclusa si applica al lavoro finanziato da Minddy. Il tetto per esecuzione di una routine è un limite distinto che può mettere in pausa quell’esecuzione; il lavoro completato rimane nella conversazione. Questi limiti non autorizzano addebiti automatici per il superamento del budget. Controlla la scheda del limite e la data di ripristino del budget quando è disponibile.

Le chiavi personali compatibili fanno fatturare al provider le chiamate ai modelli anziché consumare l’utilizzo IA incluso. Un worker che usa una chiave BYOK convalidata non è soggetto alla quota del piano né al limite di calcolo dell’account. Il calcolo nella sandbox continua ad avere un costo reale e viene registrato nell’utilizzo; questa registrazione non significa che il limite mensile del piano si applichi a quell’esecuzione BYOK. Le famiglie o gli ambiti non assegnati le cui chiamate sono finanziate da Minddy restano soggetti al rispettivo budget Minddy. L’auto-hosting comporta costi d’infrastruttura e di provider opzionali determinati dall’installazione; eseguire lo stesso nucleo non lo trasforma in un abbonamento Cloud.

## Capacità della versione candidata {#plan-capacities}

Questi valori predefiniti descrivono la versione candidata 0.11.1 identificata. Prima di acquistare, verifica la pagina dei prezzi e l’account reali: i prezzi configurati per il pagamento e le deroghe dell’account possono differire. Il conteggio degli ospiti esclude il proprietario del progetto. Lo spazio occupato dai file viene imputato al proprietario del progetto che li riceve.

| Piano | Progetti | Ticket per progetto | Ospiti per progetto | Spazio | IA mensile inclusa (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimitati | Illimitati | Illimitati | 20 GiB | 5 |
| Pro | Illimitati | Illimitati | Illimitati | 100 GiB | 15 |

![Pagina di utilizzo IA dell’account dimostrativo.](/documentation/it/plans-and-ai-usage-workflow.png)
