---
{
  "id": "minddy-mcp",
  "locale": "pt-BR",
  "title": "MCP do Minddy",
  "summary": "Conecte um assistente externo ao Minddy, controle seu acesso e conheça as ferramentas MCP disponíveis e os procedimentos de atualização seguros.",
  "topic": "Numo e integrações",
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
    "Conectar um assistente externo ao MCP do Minddy",
    "Usar o Minddy MCP e descobrir as ferramentas atuais",
    "Usar Minddy MCP e descobrir ferramentas atuais"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-workflow.png",
      "alt": "Seletor de clientes MCP Minddy com Claude, Codex e outros assistentes.",
      "caption": "Selecione seu cliente para exibir o comando ou a configuração de instalação.",
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
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-install-workflow.png",
      "alt": "Diálogo de instalação do Codex na instância local.",
      "caption": "Diálogo de instalação do Codex na instância local. Use a origem da sua instância; o comando exibido não foi executado para esta captura.",
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
      "src": "/documentation/pt-BR/external-minddy-mcp-accesses-workflow.png",
      "alt": "Lista de aplicativos conectados sem autorização ativa.",
      "caption": "Revise aqui os aplicativos autorizados. A conta de demonstração não tem autorizações ativas; nenhuma autorização ou revogação foi executada.",
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

O Minddy MCP permite que um assistente externo leia e altere o trabalho dentro das permissões da sua conta. Conecte o cliente por OAuth, confira os acessos e consulte os esquemas atuais das ferramentas antes de fazer alterações. As conexões MCP do Numo com outros serviços são um recurso separado.

## Conectar um assistente externo ao MCP do Minddy {#external-minddy-mcp}

Abra a página pública MCP da instância e escolha as instruções do cliente. Use o endpoint exibido, terminado em `/api/mcp`. Em self-hosted use sua própria origem, não a do Cloud. O cliente precisa aceitar MCP remoto e o fluxo OAuth descrito.

Entre pelo navegador e confira a autorização antes de concedê-la. A conexão age como sua conta Minddy, sem acesso a projetos fora das suas permissões. Comece lendo uma tarefa já acessível e confira o projeto retornado.

![Seletor de clientes MCP Minddy com Claude, Codex e outros assistentes.](/documentation/pt-BR/external-minddy-mcp-workflow.png)

### Escopo e revogação {#access}

Clientes externos usam ferramentas disponíveis para tarefas, planos, comentários, páginas, feedback, ciclos, rotinas e caderno dentro dos acessos autorizados. MCP está disponível em todos os planos Cloud; a IA do cliente ainda depende da configuração e custos dele.

Minddy MCP nas configurações da conta lista acessos externos e controles de revogação. Revogue clientes sem uso ou confiança. MCP para Numo é diferente: conecta o Numo a outros serviços. Não cole tokens em tarefas, feedback público nem capturas.

![Diálogo de instalação do Codex na instância local.](/documentation/pt-BR/external-minddy-mcp-install-workflow.png)

![Lista de aplicativos conectados sem autorização ativa.](/documentation/pt-BR/external-minddy-mcp-accesses-workflow.png)

## Usar o Minddy MCP e descobrir as ferramentas atuais {#mcp-tool-reference}

/api/mcp usa Streamable HTTP, ferramentas sem estado e OAuth 2.1. Conecte sua conta pelo consentimento no navegador; as antigas chaves mdyk_ não são aceitas. Use minddy_list_projects para descobrir UUIDs e leia os esquemas do servidor conectado. /llms-full.txt gera os parâmetros exatos a partir dos registros das ferramentas. Não os reconstrua com uma lista antiga. Cada ferramenta de projeto verifica novamente o acesso e retorna códigos de erro estáveis.

### Ler antes de alterar os planos {#issue-plans}

minddy_get_issue aceita o UUID de uma issue, um identificador de issue como DEMO-42 ou o número da issue; project_id é informado separadamente. plan_tasks informa task_index a partir de zero. minddy_update_plan_task recebe um array tasks com os estados pending, in_progress, completed ou cancelled; um índice inválido faz o lote inteiro ser rejeitado. minddy_append_to_plan acrescenta conteúdo, enquanto minddy_edit_issue_text substitui old_string por new_string em uma correspondência exata e única. Releia um plano que pode ter mudado: substituí-lo por inteiro pode sobrescrever o progresso de outras pessoas. A seção ## Questions fica fora da contagem de tarefas.

### Respeitar revisões e propriedade {#pages-and-routines}

minddy_list_pages mostra a hierarquia, minddy_search_pages retorna trechos e minddy_get_page retorna Markdown, comentários e valores completos. Prefira edições parciais e use a versão atual ao substituir conteúdo. Preserve as URLs de arquivos e imagens. minddy_create_page com database=true cria um banco de páginas. minddy_update_page_database exige a revisão do esquema, o valor anterior da célula e os tokens preview/apply para conversões. Somente o proprietário pode criar, pausar, reagendar ou remover suas rotinas. Leia antes de criar para evitar duplicatas. minddy_add_resource limita os arquivos a 10 MB; as ferramentas de página não inventam URLs.

### Conferir com um exemplo {#example}

O exemplo altera a primeira tarefa de um plano já lido. Substitua o UUID do projeto e a issue pelos valores encontrados na descoberta e use o índice da última leitura. Depois confira plan_tasks e plan_progress. Para um erro de acesso, verifique conta e projeto; para conflito, releia e aplique apenas a alteração necessária. Não repita uma alteração externa de resultado incerto sem conferir o resultado.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
