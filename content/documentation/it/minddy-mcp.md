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
  "revision": 5,
  "sourceRevision": 5,
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
      "app/llms-full.txt/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 it network guidance and terminology review)",
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-install-workflow.png",
      "alt": "Finestra di installazione di Codex.",
      "caption": "Finestra di installazione di Codex. Usa l’origine della tua istanza; il comando mostrato non è stato eseguito per questa cattura.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        364
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

minddy MCP permette a un assistente esterno di leggere e modificare il lavoro entro i permessi del tuo account. Collega il client tramite OAuth, controlla gli accessi e usa gli schemi correnti degli strumenti prima di intervenire. Le connessioni MCP di Numo verso altri servizi sono una funzione distinta.

## Collegare un assistente esterno a minddy MCP {#external-minddy-mcp}

Apri la pagina pubblica MCP dell’istanza e scegli le istruzioni del client. Usa l’endpoint mostrato, che termina con `/api/mcp`. In self-hosted usa la tua origine, non Cloud. Il client deve supportare MCP remoto e il flusso OAuth descritto.

Accedi nel browser e verifica l’autorizzazione prima di concederla. La connessione agisce come il tuo account minddy senza accedere a progetti esclusi dai tuoi permessi. Inizia leggendo un ticket già accessibile e controlla il progetto restituito.

![Selettore dei client MCP minddy con Claude, Codex e altri assistenti.](/documentation/it/external-minddy-mcp-workflow.png)

### Disponibilità di MCP e accesso alla rete {#network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

- **Stesso computer:** `http://localhost:6463/api/mcp` funziona con un client compatibile eseguito sul computer che ospita l’istanza locale. `localhost` e `127.0.0.1` indicano il computer che avvia la connessione. Il lanciatore di istanze locali dell’app desktop ascolta solo sull’interfaccia di loopback; un altro computer o un agente ospitato nel cloud non può raggiungerlo direttamente. Aprire l’URL localhost del server su un altro computer rimanda a quell’altro computer.

- **LAN o VPN:** un’istanza configurata come `http://192.168.1.50` annuncia `http://192.168.1.50/api/mcp`. Un client nella LAN, o collegato tramite VPN, può usarla se indirizzo di ascolto, origine configurata, porta dell’applicazione, firewall e instradamento consentono l’accesso. Il browser deve raggiungere gli stessi URL di autorizzazione annunciati. Serve un’installazione server raggiungibile; cambiare solo l’URL del client non espone un processo limitato al loopback.

- **Fuori dalla rete privata:** usa un’origine HTTPS raggiungibile, per esempio `https://tickets.example.com/api/mcp`, o un altro percorso di rete supportato dal client. Un agente ospitato deve avere un proprio percorso verso l’istanza; la VPN sul computer del browser da sola non gli fornisce quel percorso. Ospitare minddy localmente non lo espone automaticamente a Internet.

### Ambito e revoca {#access}

I client esterni usano gli strumenti disponibili per ticket, piani, commenti, pagine, feedback, cicli, routine e taccuino entro i permessi autorizzati. MCP è disponibile in tutti i piani Cloud; l’IA del client dipende comunque da configurazione e costi propri.

minddy MCP nelle impostazioni dell’account elenca accessi esterni e controlli di revoca. Revoca client inutilizzati o non più affidabili. MCP per Numo è distinto: collega Numo ad altri servizi. Non incollare token in ticket, feedback pubblici o screenshot.

![Finestra di installazione di Codex.](/documentation/it/external-minddy-mcp-install-workflow.png)


## Usare minddy MCP e scoprire gli strumenti attuali {#mcp-tool-reference}

`/api/mcp` usa Streamable HTTP, strumenti stateless e OAuth 2.1. Collega il tuo account tramite il consenso nel browser; le vecchie chiavi `mdyk_` non sono accettate. Usa `minddy_list_projects` per trovare gli UUID, poi leggi gli schemi del server collegato. `/llms-full.txt` genera i parametri esatti dai registri degli strumenti. Non ricostruirli da un elenco obsoleto. Ogni strumento di progetto ricontrolla l’accesso e restituisce codici di errore stabili.

### Leggere prima di modificare i piani {#issue-plans}

`minddy_get_issue` accetta l’UUID di una issue, un identificatore di issue come `DEMO-42` oppure il numero della issue; `project_id` viene fornito separatamente. `plan_tasks` indica `task_index` a partire da zero. `minddy_update_plan_task` riceve un array `tasks` con gli stati `pending`, `in_progress`, `completed` o `cancelled`; un indice non valido fa rifiutare l’intero batch. `minddy_append_to_plan` aggiunge contenuto, mentre `minddy_edit_issue_text` sostituisce una coppia `old_string`/`new_string` esatta e univoca. Rileggi un piano che può essere cambiato: sostituirlo interamente potrebbe sovrascrivere il progresso di altri. La sezione `## Questions` è esclusa dal conteggio delle attività.

### Rispettare revisioni e proprietà {#pages-and-routines}

`minddy_list_pages` mostra la gerarchia, `minddy_search_pages` restituisce estratti e `minddy_get_page` restituisce Markdown, commenti e valori completi. Preferisci modifiche parziali e usa la versione corrente quando sostituisci il contenuto. Mantieni le URL di file e immagini. `minddy_create_page` con `database=true` crea un database di pagine. `minddy_update_page_database` richiede la revisione dello schema, il valore precedente della cella e i token `preview`/`apply` per le conversioni. Solo il proprietario può creare, sospendere, ripianificare o eliminare le proprie routine. Leggi prima di creare per evitare duplicati. `minddy_add_resource` limita i file a 10 MB; gli strumenti delle pagine non inventano URL.

### Verificare con un esempio {#example}

L’esempio modifica la prima attività di un piano già letto. Sostituisci l’UUID del progetto e il ticket con quelli trovati tramite discovery, e usa l’indice dell’ultima lettura. Controlla poi `plan_tasks` e `plan_progress`. Per un errore di accesso, verifica account e progetto; per un conflitto, rileggi e applica solo la modifica necessaria. Non ripetere una modifica esterna con esito incerto senza averne verificato il risultato.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
