---
{
  "id": "minddy-mcp",
  "locale": "it",
  "title": "MCP di minddy",
  "summary": "Collega un assistente esterno a minddy, controlla gli accessi e scopri gli strumenti MCP disponibili e le procedure di modifica sicure.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Collegare un assistente esterno a minddy MCP",
    "Usare minddy MCP e scoprire gli strumenti attuali",
    "Collegare un assistente esterno al MCP minddy",
    "Usare minddy MCP e scoprire i tool attuali"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-workflow.png",
      "alt": "Selettore dei client MCP minddy con Claude, Codex e altri assistenti.",
      "caption": "Scegli il client per visualizzare il comando o la configurazione di installazione.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-install-workflow.png",
      "alt": "Finestra di installazione di Codex nell’istanza locale.",
      "caption": "Finestra di installazione di Codex nell’istanza locale. Usa l’origine della tua istanza; il comando mostrato non è stato eseguito per questa cattura.",
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
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-accesses-workflow.png",
      "alt": "Elenco delle applicazioni connesse senza autorizzazioni attive.",
      "caption": "Controlla qui le applicazioni autorizzate. L’account dimostrativo non ha autorizzazioni attive; non sono state eseguite autorizzazioni né revoche.",
      "revision": 2,
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
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

minddy MCP permette a un assistente esterno di leggere e modificare il lavoro entro i permessi del tuo account. Collega il client tramite OAuth, controlla gli accessi e usa gli schemi correnti degli strumenti prima di intervenire. Le connessioni MCP di Numo verso altri servizi sono una funzione distinta.

## Collegare un assistente esterno a minddy MCP {#external-minddy-mcp}

Apri la pagina pubblica MCP dell’istanza e scegli le istruzioni del client. Usa l’endpoint mostrato, che termina con `/api/mcp`. In self-hosted usa la tua origine, non Cloud. Il client deve supportare MCP remoto e il flusso OAuth descritto.

Accedi nel browser e verifica l’autorizzazione prima di concederla. La connessione agisce come il tuo account minddy senza accedere a progetti esclusi dai tuoi permessi. Inizia leggendo un ticket già accessibile e controlla il progetto restituito.

![Selettore dei client MCP minddy con Claude, Codex e altri assistenti.](/documentation/it/external-minddy-mcp-workflow.png)

### Ambito e revoca {#access}

I client esterni usano gli strumenti disponibili per ticket, piani, commenti, pagine, feedback, cicli, routine e taccuino entro i permessi autorizzati. MCP è disponibile in tutti i piani Cloud; l’IA del client dipende comunque da configurazione e costi propri.

minddy MCP nelle impostazioni dell’account elenca accessi esterni e controlli di revoca. Revoca client inutilizzati o non più affidabili. MCP per Numo è distinto: collega Numo ad altri servizi. Non incollare token in ticket, feedback pubblici o screenshot.

![Finestra di installazione di Codex nell’istanza locale.](/documentation/it/external-minddy-mcp-install-workflow.png)

![Elenco delle applicazioni connesse senza autorizzazioni attive.](/documentation/it/external-minddy-mcp-accesses-workflow.png)

## Usare minddy MCP e scoprire gli strumenti attuali {#mcp-tool-reference}

/api/mcp usa Streamable HTTP, strumenti stateless e OAuth 2.1. Collega il tuo account tramite il consenso nel browser; le vecchie chiavi mdyk_ non sono accettate. Usa minddy_list_projects per trovare gli UUID, poi leggi gli schemi del server collegato. /llms-full.txt genera i parametri esatti dai registri degli strumenti. Non ricostruirli da un elenco obsoleto. Ogni strumento di progetto ricontrolla l’accesso e restituisce codici di errore stabili.

### Leggere prima di modificare i piani {#issue-plans}

minddy_get_issue accetta l’UUID di una issue, un identificatore di issue come DEMO-42 oppure il numero della issue; project_id viene fornito separatamente. plan_tasks indica task_index a partire da zero. minddy_update_plan_task riceve un array tasks con gli stati pending, in_progress, completed o cancelled; un indice non valido fa rifiutare l’intero batch. minddy_append_to_plan aggiunge contenuto, mentre minddy_edit_issue_text sostituisce una coppia old_string/new_string esatta e univoca. Rileggi un piano che può essere cambiato: sostituirlo interamente potrebbe sovrascrivere il progresso di altri. La sezione ## Questions è esclusa dal conteggio delle attività.

### Rispettare revisioni e proprietà {#pages-and-routines}

minddy_list_pages mostra la gerarchia, minddy_search_pages restituisce estratti e minddy_get_page restituisce Markdown, commenti e valori completi. Preferisci modifiche parziali e usa la versione corrente quando sostituisci il contenuto. Mantieni le URL di file e immagini. minddy_create_page con database=true crea un database di pagine. minddy_update_page_database richiede la revisione dello schema, il valore precedente della cella e i token preview/apply per le conversioni. Solo il proprietario può creare, sospendere, ripianificare o eliminare le proprie routine. Leggi prima di creare per evitare duplicati. minddy_add_resource limita i file a 10 MB; gli strumenti delle pagine non inventano URL.

### Verificare con un esempio {#example}

L’esempio modifica la prima attività di un piano già letto. Sostituisci l’UUID del progetto e il ticket con quelli trovati tramite discovery, e usa l’indice dell’ultima lettura. Controlla poi plan_tasks e plan_progress. Per un errore di accesso, verifica account e progetto; per un conflitto, rileggi e applica solo la modifica necessaria. Non ripetere una modifica esterna con esito incerto senza averne verificato il risultato.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
