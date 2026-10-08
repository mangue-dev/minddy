---
{
  "id": "automation-settings",
  "locale": "it",
  "title": "Automazione dei ticket",
  "summary": "Configura le automazioni dell’account e distingui le regole del progetto riservate al proprietario.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurare il lavoro automatico sui ticket"
  ],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/automation-settings-workflow.png",
      "alt": "Preimpostazione di automazione senza alcuna opzione selezionata.",
      "caption": "Senza preimpostazione selezionata, questo account non avvia lavoro automatico.",
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
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/automation-settings-projects-workflow.png",
      "alt": "Selezione dei progetti per le automazioni dell’account.",
      "caption": "Selezione dei progetti per le automazioni dell’account. Entrambi i progetti dimostrativi sono disattivati; non viene avviata alcuna automazione.",
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
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Scelte dell’account {#automation-settings}

Apri la sezione Automazioni nelle impostazioni dell’account. Scegli una configurazione predefinita, leggi la spiegazione e la stima di utilizzo, imposta il ritardo di avvio e scegli quali dimensioni di impegno consentono i passaggi automatici. Le stime dipendono dal budget disponibile e non sono prezzi fissi. Prima di abilitare il lavoro sul codice, controlla il modello del worker nelle impostazioni IA dell’account. La stessa pagina elenca gli interruttori di automazione per i progetti di cui sei proprietario; un membro non può abilitare il progetto di un altro proprietario.

![Preimpostazione di automazione senza alcuna opzione selezionata.](/documentation/it/automation-settings-workflow.png)

## Distinguere i meccanismi {#mechanisms}

Smart Fill compila priorità, impegno, categorie e obiettivo mancanti; non sceglie stato, assegnatario o scadenza. Le preferenze dell’account distinguono la compilazione alla creazione dai ticket idonei nel triage dei progetti di cui sei proprietario. L’autoassegnazione alla creazione o all’avvio è una preferenza distinta; quella all’avvio riguarda solo i ticket non assegnati.

Smart Assign è un’impostazione del proprietario del progetto con regole per ciascun membro. Smart Triage usa regole statiche del progetto ed è distinto dalla compilazione IA e dall’esecuzione di codice. Prima di salvare, verifica destinatari e condizioni di attivazione di ogni regola.

Abilita solo i passaggi che vuoi eseguire senza una nuova richiesta manuale. I passaggi IA richiedono un provider configurato e utilizzabile e devono superare i controlli del budget applicabili a quella chiamata. Le chiavi personali compatibili e convalidate possono esentare le loro chiamate dalla quota IA inclusa dell’account e trasferire al provider la fatturazione dei modelli. Non rendono gratuito il calcolo nella sandbox: il suo costo continua a essere registrato separatamente, e il budget per esecuzione di una routine rimane un limite distinto. Se parte un’attività inattesa, esamina la cronologia del ticket e la conversazione, poi disattiva l’interruttore pertinente dell’account o del progetto prima di creare altri ticket di prova.

![Selezione dei progetti per le automazioni dell’account.](/documentation/it/automation-settings-projects-workflow.png)
