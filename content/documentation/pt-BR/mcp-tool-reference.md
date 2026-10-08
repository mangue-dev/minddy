---
{
  "id": "mcp-tool-reference",
  "locale": "pt-BR",
  "title": "Usar Minddy MCP e descobrir ferramentas atuais",
  "summary": "/api/mcp usa Streamable HTTP, ferramentas sem estado e OAuth 2.1.",
  "topic": "Conceitos técnicos",
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

## Usar Minddy MCP e descobrir ferramentas atuais {#mcp-tool-reference}

/api/mcp usa Streamable HTTP, ferramentas sem estado e OAuth 2.1. Conecte sua conta pelo consentimento no navegador; as antigas chaves mdyk_ não são aceitas. Use minddy_list_projects para descobrir UUIDs e leia os esquemas do servidor conectado. /llms-full.txt gera os parâmetros exatos a partir dos registros das ferramentas. Não os reconstrua com uma lista antiga. Cada ferramenta de projeto verifica novamente o acesso e retorna códigos de erro estáveis.

## Ler antes de mudar planos {#issue-plans}

minddy_get_issue aceita o UUID de uma issue, um identificador de issue como DEMO-42 ou o número da issue; project_id é informado separadamente. plan_tasks informa task_index a partir de zero. minddy_update_plan_task recebe um array tasks com os estados pending, in_progress, completed ou cancelled; um índice inválido faz o lote inteiro ser rejeitado. minddy_append_to_plan acrescenta conteúdo, enquanto minddy_edit_issue_text substitui old_string por new_string em uma correspondência exata e única. Releia um plano que pode ter mudado: substituí-lo por inteiro pode sobrescrever o progresso de outras pessoas. A seção ## Questions fica fora da contagem de tarefas.

## Respeitar revisão e propriedade {#pages-and-routines}

minddy_list_pages mostra a hierarquia, minddy_search_pages retorna trechos e minddy_get_page retorna Markdown, comentários e valores completos. Prefira edições parciais e use a versão atual ao substituir conteúdo. Preserve as URLs de arquivos e imagens. minddy_create_page com database=true cria um banco de páginas. minddy_update_page_database exige a revisão do esquema, o valor anterior da célula e os tokens preview/apply para conversões. Somente o proprietário pode criar, pausar, reagendar ou remover suas rotinas. Leia antes de criar para evitar duplicatas. minddy_add_resource limita os arquivos a 10 MB; as ferramentas de página não inventam URLs.

## Conferir com um exemplo {#example}

O exemplo altera a primeira tarefa de um plano já lido. Substitua o UUID do projeto e a issue pelos valores encontrados na descoberta e use o índice da última leitura. Depois confira plan_tasks e plan_progress. Para um erro de acesso, verifique conta e projeto; para conflito, releia e aplique apenas a alteração necessária. Não repita uma alteração externa de resultado incerto sem conferir o resultado.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
