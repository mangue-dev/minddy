---
{
  "id": "git",
  "locale": "it",
  "title": "Repository Git e sincronizzazione dei ticket",
  "summary": "Collega un account Git, associa un repository al progetto e configura la sincronizzazione dei ticket con il provider.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "owner",
    "member",
    "integrator"
  ],
  "workflows": [
    "N10",
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "docs/github-issue-sync.md",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "git-accounts-and-repositories",
    "integrations",
    "forge-issue-sync"
  ],
  "tags": [
    "Collegare Git e un repository al progetto",
    "Sincronizzare ticket della piattaforma Git"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/git-accounts-and-repositories-workflow.png",
      "alt": "Account GitHub e GitLab scollegati con controlli di autorizzazione.",
      "caption": "Autorizza prima il tuo account Git. Il proprietario collega poi il repository al progetto separatamente.",
      "revision": 2,
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/it/forge-issue-sync-mapping.png",
      "alt": "Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.",
      "caption": "Gli eventi GitHub preservano le modifiche recenti ed evitano consegne duplicate. Le corrispondenze GitLab richiedono una verifica separata.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/forge-issue-sync-workflow.png",
      "alt": "Repository dimostrativo GitHub collegato, con la sincronizzazione delle issue disattivata.",
      "caption": "Il repository dimostrativo è collegato a GitHub. La sincronizzazione delle issue è ancora disattivata: controlla l’ambito e il backlog esistente prima di attivarla. Questa schermata non dimostra un’importazione sincronizzata.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

La connessione Git personale autorizza l’accesso al provider; il collegamento del repository e la sincronizzazione dei ticket sono impostazioni del progetto. Il proprietario le configura per GitHub.com o GitLab.com. Controlla separatamente accesso, direzione della sincronizzazione e conflitti.

## Collegare Git e un repository al progetto {#git-accounts-and-repositories}

Collega GitHub o GitLab nelle impostazioni Git dell’account e completa l’autorizzazione nel browser. Concedi solo i repository necessari. Su desktop torna all’app dopo il browser. La connessione è riutilizzabile tra progetti, senza collegare automaticamente ogni repository.

Il proprietario apre Git nelle impostazioni del progetto, sceglie un repository disponibile e conferma. Controlla fornitore, nome completo e account che agirà. I membri non possono sostituire il collegamento riservato al proprietario. Consente contesto e lavoro di codice sul server; la sincronizzazione dei ticket ha un interruttore separato.

![Account GitHub e GitLab scollegati con controlli di autorizzazione.](/documentation/it/git-accounts-and-repositories-workflow.png)

### Repository assente o accesso scaduto {#recovery}

Se l’elenco è vuoto, controlla permessi e autorizzazione di organizzazione o repository. Ricollega un account scaduto invece di incollare token nei ticket. Scollegare richiede il proprietario; leggi la conferma.

Self-hosted può usare un relay gestito configurato o app proprie dell’operatore. Il collegamento al relay è esplicito e non rende locale la piattaforma Git. La disponibilità dipende dalla configurazione. Verifica la politica dell’operatore prima di autorizzare.

![Impostazioni Git di un progetto senza repository collegato.](/documentation/it/git-accounts-and-repositories-project-workflow.png)

## Sincronizzare ticket della piattaforma Git {#forge-issue-sync}

Come proprietario, apri Git dopo aver collegato il repository. Attiva la sincronizzazione con i diritti di scrittura necessari. I ticket importati arrivano al triage. Verifica il recupero iniziale indicato e titolo, descrizione e stato di un ticket remoto noto.

Aperto e chiuso si riflettono in entrambe le direzioni. In GitHub titolo e corpo diventano titolo e descrizione; le etichette forniscono categorie, priorità e impegno riconosciuti; viene usato il primo assegnatario collegato e la scadenza della milestone. I commenti mantengono autore, identità, URL e date remoti. I blocchi richiedono entrambi i ticket nello stesso progetto importato. Restano gli URL degli allegati; byte caricati e campi GitHub Projects non hanno equivalente nativo.

### Permessi, conflitti e disattivazione {#forge-issue-sync-recovery}

La GitHub App richiede lettura/scrittura di Issues e iscrizioni Issues, Issue comments e Issue dependencies. Le installazioni esistenti devono accettare nuovi permessi. Queste corrispondenze non garantiscono tutti i campi GitLab.

Eventi GitHub datati più vecchi non sovrascrivono modifiche locali recenti. Identità di consegna e commenti evitano duplicati. Confronta date e consulta eventi del fornitore e log operatore se manca il recupero iniziale. Disattiva nello stesso controllo del proprietario; esamina separatamente il lavoro già importato.

![Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.](/documentation/it/forge-issue-sync-mapping.png)

![Repository dimostrativo GitHub collegato, con la sincronizzazione delle issue disattivata.](/documentation/it/forge-issue-sync-workflow.png)
