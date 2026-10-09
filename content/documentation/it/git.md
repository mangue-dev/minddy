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
      "kind": "diagram",
      "src": "/documentation/it/git-connection-flow.svg",
      "alt": "Il collegamento dell’account personale e quello del repository al progetto sono due passaggi distinti.",
      "caption": "Autorizza prima l’account, poi collega un repository come proprietario del progetto.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Collegare un account, poi un repository",
        "items": [
          {
            "title": "Account Git personale",
            "detail": "Autorizza GitHub o GitLab per i repository di cui hai bisogno."
          },
          {
            "title": "Proprietario del progetto",
            "detail": "Scegli un repository disponibile nelle impostazioni Git del progetto."
          },
          {
            "title": "Repository collegato",
            "detail": "Aurora → aurora/web. La sincronizzazione dei ticket è una scelta separata."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/it/forge-issue-sync-mapping.svg",
      "alt": "Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.",
      "caption": "Gli eventi GitHub preservano le modifiche recenti ed evitano consegne duplicate. Le corrispondenze GitLab richiedono una verifica separata.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Sincronizzazione dei ticket GitHub",
        "items": [
          {
            "title": "Configurazione del proprietario",
            "detail": "Collegare il repository, concedere lettura/scrittura Issues e attivare la sincronizzazione."
          },
          {
            "title": "Eventi in ingresso",
            "detail": "Deduplicare gli ID di consegna; i dati più vecchi non sovrascrivono modifiche locali più recenti."
          },
          {
            "title": "Importazione e corrispondenze",
            "detail": "I ticket importati entrano nel triage. Titolo/corpo diventano titolo/descrizione; le etichette forniscono categorie, priorità e impegno riconosciuti."
          },
          {
            "title": "Stato sincronizzato",
            "detail": "Gli stati aperto/chiuso si riflettono in entrambe le direzioni. Confrontare gli orari in caso di modifiche concorrenti."
          }
        ],
        "note": "I commenti conservano l’identità remota senza duplicati. Le corrispondenze GitLab possono differire."
      }
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
        816,
        278
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

La connessione Git personale autorizza l’accesso al provider; il collegamento del repository e la sincronizzazione dei ticket sono impostazioni del progetto. Il proprietario le configura per GitHub.com o GitLab.com. Controlla separatamente accesso, direzione della sincronizzazione e conflitti.

## Collegare Git e un repository al progetto {#git-accounts-and-repositories}

Collega GitHub o GitLab nelle impostazioni Git dell’account e completa l’autorizzazione nel browser. Concedi solo i repository necessari. Su desktop torna all’app dopo il browser. La connessione è riutilizzabile tra progetti, senza collegare automaticamente ogni repository.

Il proprietario apre Git nelle impostazioni del progetto, sceglie un repository disponibile e conferma. Controlla fornitore, nome completo e account che agirà. I membri non possono sostituire il collegamento riservato al proprietario. Consente contesto e lavoro di codice sul server; la sincronizzazione dei ticket ha un interruttore separato.

![Il collegamento dell’account personale e quello del repository al progetto sono due passaggi distinti.](/documentation/it/git-connection-flow.svg)

### Repository assente o accesso scaduto {#recovery}

Se l’elenco è vuoto, controlla permessi e autorizzazione di organizzazione o repository. Ricollega un account scaduto invece di incollare token nei ticket. Scollegare richiede il proprietario; leggi la conferma.

Self-hosted può usare un relay gestito configurato o app proprie dell’operatore. Il collegamento al relay è esplicito e non rende locale la piattaforma Git. La disponibilità dipende dalla configurazione. Verifica la politica dell’operatore prima di autorizzare.


## Sincronizzare ticket della piattaforma Git {#forge-issue-sync}

Come proprietario, apri Git dopo aver collegato il repository. Attiva la sincronizzazione con i diritti di scrittura necessari. I ticket importati arrivano al triage. Verifica il recupero iniziale indicato e titolo, descrizione e stato di un ticket remoto noto.

Aperto e chiuso si riflettono in entrambe le direzioni. In GitHub titolo e corpo diventano titolo e descrizione; le etichette forniscono categorie, priorità e impegno riconosciuti; viene usato il primo assegnatario collegato e la scadenza della milestone. I commenti mantengono autore, identità, URL e date remoti. I blocchi richiedono entrambi i ticket nello stesso progetto importato. Restano gli URL degli allegati; byte caricati e campi GitHub Projects non hanno equivalente nativo.

### Permessi, conflitti e disattivazione {#forge-issue-sync-recovery}

La GitHub App richiede lettura/scrittura di Issues e iscrizioni Issues, Issue comments e Issue dependencies. Le installazioni esistenti devono accettare nuovi permessi. Queste corrispondenze non garantiscono tutti i campi GitLab.

Eventi GitHub datati più vecchi non sovrascrivono modifiche locali recenti. Identità di consegna e commenti evitano duplicati. Confronta date e consulta eventi del fornitore e log operatore se manca il recupero iniziale. Disattiva nello stesso controllo del proprietario; esamina separatamente il lavoro già importato.

![Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.](/documentation/it/forge-issue-sync-mapping.svg)

![Repository dimostrativo GitHub collegato, con la sincronizzazione delle issue disattivata.](/documentation/it/forge-issue-sync-workflow.png)
