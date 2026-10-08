---
{
  "id": "git-accounts-and-repositories",
  "locale": "it",
  "title": "Collegare Git e un repository al progetto",
  "summary": "Autorizzare l’account del fornitore, poi far scegliere il repository al proprietario.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "N10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "forge-issue-sync",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "integrations"
  ],
  "tags": [],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/git-accounts-and-repositories-workflow.png",
      "alt": "Account GitHub e GitLab scollegati con controlli di autorizzazione.",
      "caption": "Autorizza prima il tuo account Git. Il proprietario collega poi il repository al progetto separatamente.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "git-accounts-and-repositories-project-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/git-accounts-and-repositories-project-workflow.png",
      "alt": "Impostazioni Git di un progetto senza repository collegato.",
      "caption": "Impostazioni Git di un progetto senza repository collegato. Autorizza GitHub o GitLab prima di scegliere un repository.",
      "revision": 1,
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
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow"
  ]
}
---

## Connessione dell’account e del progetto {#git-accounts-and-repositories}
Collega GitHub o GitLab nelle impostazioni Git dell’account e completa l’autorizzazione nel browser. Concedi solo i repository necessari. Su desktop torna all’app dopo il browser. La connessione è riutilizzabile tra progetti, senza collegare automaticamente ogni repository.

Il proprietario apre Git nelle impostazioni del progetto, sceglie un repository disponibile e conferma. Controlla fornitore, nome completo e account che agirà. I membri non possono sostituire il collegamento riservato al proprietario. Consente contesto e lavoro di codice sul server; la sincronizzazione dei ticket ha un interruttore separato.

![Account GitHub e GitLab scollegati con controlli di autorizzazione.](/documentation/it/git-accounts-and-repositories-workflow.png)


## Repository assente o accesso scaduto {#recovery}
Se l’elenco è vuoto, controlla permessi e autorizzazione di organizzazione o repository. Ricollega un account scaduto invece di incollare token nei ticket. Scollegare richiede il proprietario; leggi la conferma.

Self-hosted può usare un relay gestito configurato o app proprie dell’operatore. Il collegamento al relay è esplicito e non rende locale la piattaforma Git. La disponibilità dipende dalla configurazione. Verifica la politica dell’operatore prima di autorizzare.

![Impostazioni Git di un progetto senza repository collegato.](/documentation/it/git-accounts-and-repositories-project-workflow.png)
