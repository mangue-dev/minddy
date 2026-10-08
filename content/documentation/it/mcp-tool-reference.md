---
{
  "id": "mcp-tool-reference",
  "locale": "it",
  "title": "Usare Minddy MCP e scoprire i tool attuali",
  "summary": "/api/mcp usa Streamable HTTP, strumenti stateless e OAuth 2.1.",
  "topic": "Concetti tecnici",
  "type": "reference",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T06"
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and final correction review)",
    "date": "2026-10-08"
  },
  "related": [
    "numo-execution-model",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Usare Minddy MCP e scoprire i tool attuali {#mcp-tool-reference}

/api/mcp usa Streamable HTTP, strumenti stateless e OAuth 2.1. Collega il tuo account tramite il consenso nel browser; le vecchie chiavi mdyk_ non sono accettate. Usa minddy_list_projects per trovare gli UUID, poi leggi gli schemi del server collegato. /llms-full.txt genera i parametri esatti dai registri degli strumenti. Non ricostruirli da un elenco obsoleto. Ogni strumento di progetto ricontrolla l’accesso e restituisce codici di errore stabili.

## Leggere prima di modificare piani {#issue-plans}

minddy_get_issue accetta l’UUID di una issue, un identificatore di issue come DEMO-42 oppure il numero della issue; project_id viene fornito separatamente. plan_tasks indica task_index a partire da zero. minddy_update_plan_task riceve un array tasks con gli stati pending, in_progress, completed o cancelled; un indice non valido fa rifiutare l’intero batch. minddy_append_to_plan aggiunge contenuto, mentre minddy_edit_issue_text sostituisce una coppia old_string/new_string esatta e univoca. Rileggi un piano che può essere cambiato: sostituirlo interamente potrebbe sovrascrivere il progresso di altri. La sezione ## Questions è esclusa dal conteggio delle attività.

## Rispettare revisioni e proprietà {#pages-and-routines}

minddy_list_pages mostra la gerarchia, minddy_search_pages restituisce estratti e minddy_get_page restituisce Markdown, commenti e valori completi. Preferisci modifiche parziali e usa la versione corrente quando sostituisci il contenuto. Mantieni le URL di file e immagini. minddy_create_page con database=true crea un database di pagine. minddy_update_page_database richiede la revisione dello schema, il valore precedente della cella e i token preview/apply per le conversioni. Solo il proprietario può creare, sospendere, ripianificare o eliminare le proprie routine. Leggi prima di creare per evitare duplicati. minddy_add_resource limita i file a 10 MB; gli strumenti delle pagine non inventano URL.

## Verificare con un esempio {#example}

L’esempio modifica la prima attività di un piano già letto. Sostituisci l’UUID del progetto e il ticket con quelli trovati tramite discovery, e usa l’indice dell’ultima lettura. Controlla poi plan_tasks e plan_progress. Per un errore di accesso, verifica account e progetto; per un conflitto, rileggi e applica solo la modifica necessaria. Non ripetere una modifica esterna con esito incerto senza averne verificato il risultato.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
