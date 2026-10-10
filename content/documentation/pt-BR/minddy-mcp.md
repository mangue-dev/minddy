---
{
  "id": "minddy-mcp",
  "locale": "pt-BR",
  "title": "MCP do minddy",
  "summary": "Conecte um assistente externo ao minddy, controle seu acesso e conheça as ferramentas MCP disponíveis e os procedimentos de atualização seguros.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
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
      "lib/server/oauth/metadata.ts",
      "content/documentation/reviews/premerge-en-fr-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-it-pt-BR-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun); agent:/root with agent:/root/review_it_pt (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 pt-BR network guidance and terminology review); agent:/root/review_it_pt with agent:/root (pt-BR pre-merge wording, correction and retained-meaning review); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained)",
    "date": "2026-10-10"
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
    "Conectar um assistente externo ao MCP do minddy",
    "Usar o minddy MCP e descobrir as ferramentas atuais",
    "Usar minddy MCP e descobrir ferramentas atuais"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-workflow.png",
      "alt": "Seletor de clientes MCP minddy com Claude, Codex e outros assistentes.",
      "caption": "Selecione seu cliente para exibir o comando ou a configuração de instalação.",
      "revision": 7,
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
      "src": "/documentation/pt-BR/external-minddy-mcp-install-workflow.png",
      "alt": "Diálogo de instalação do Codex mostrando o endpoint minddy Cloud.",
      "caption": "Este exemplo se conecta ao minddy Cloud. Para uma instância autogerenciada, use a origem da sua própria instância; o comando exibido não foi executado para esta captura.",
      "revision": 7,
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

O minddy MCP permite que um assistente externo leia e altere o trabalho dentro das permissões da sua conta. Conecte o cliente por OAuth, confira os acessos e consulte os esquemas atuais das ferramentas antes de fazer alterações. As conexões MCP do Numo com outros serviços são um recurso separado.

## Conectar um assistente externo ao MCP do minddy {#external-minddy-mcp}

Abra a página pública MCP da instância e escolha as instruções do cliente. Use o endpoint exibido, terminado em `/api/mcp`. Em self-hosted use sua própria origem, não a do Cloud. O cliente precisa aceitar MCP remoto e o fluxo OAuth descrito.

Entre pelo navegador e confira a autorização antes de concedê-la. A conexão age como sua conta minddy, sem acesso a projetos fora das suas permissões. Comece lendo uma tarefa já acessível e confira o projeto retornado.

![Seletor de clientes MCP minddy com Claude, Codex e outros assistentes.](/documentation/pt-BR/external-minddy-mcp-workflow.png)

### Disponibilidade do MCP e acesso à rede {#network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

- **Mesmo computador:** `http://localhost:6463/api/mcp` funciona para um cliente compatível executado no computador que hospeda a instância local. `localhost` e `127.0.0.1` identificam o computador que inicia a conexão. O inicializador de instâncias locais do aplicativo desktop escuta apenas na interface de loopback; outro computador ou um agente hospedado na nuvem não pode acessá-lo diretamente. Abrir a URL localhost do servidor em outro computador aponta para esse outro computador.

- **LAN ou VPN:** uma instância configurada como `http://192.168.1.50` anuncia `http://192.168.1.50/api/mcp`. Um cliente na LAN, ou conectado por VPN, pode usá-la se o endereço de escuta, a origem configurada, a porta da aplicação, o firewall e o roteamento permitirem o acesso. O navegador precisa alcançar as mesmas URLs de autorização anunciadas. Isso exige uma instalação de servidor acessível; mudar apenas a URL do cliente não expõe um processo limitado ao loopback.

- **Fora da rede privada:** use uma origem HTTPS acessível, por exemplo `https://tickets.example.com/api/mcp`, ou outro caminho de rede aceito pelo cliente. Um agente hospedado precisa de seu próprio caminho até a instância; a VPN no computador do navegador, sozinha, não fornece esse caminho. Hospedar o minddy localmente não o expõe automaticamente à Internet.

### Escopo e revogação {#access}

Clientes externos usam ferramentas disponíveis para tarefas, planos, comentários, páginas, feedback, ciclos, rotinas e caderno dentro dos acessos autorizados. MCP está disponível em todos os planos Cloud; a IA do cliente ainda depende da configuração e custos dele.

minddy MCP nas configurações da conta lista acessos externos e controles de revogação. Revogue clientes sem uso ou confiança. MCP para Numo é diferente: conecta o Numo a outros serviços. Não cole tokens em tarefas, feedback público nem capturas.

![Diálogo de instalação do Codex mostrando o endpoint minddy Cloud.](/documentation/pt-BR/external-minddy-mcp-install-workflow.png)


## Usar o minddy MCP e descobrir as ferramentas atuais {#mcp-tool-reference}

`/api/mcp` usa Streamable HTTP, ferramentas sem estado e OAuth 2.1. Conecte sua conta pelo consentimento no navegador; as antigas chaves `mdyk_` não são aceitas. Use `minddy_list_projects` para descobrir UUIDs e leia os esquemas do servidor conectado. `/llms-full.txt` gera os parâmetros exatos a partir dos registros das ferramentas. Não os reconstrua com uma lista antiga. Cada ferramenta de projeto verifica novamente o acesso e retorna códigos de erro estáveis.

### Ler antes de alterar os planos {#issue-plans}

`minddy_get_issue` aceita o UUID de uma issue, um identificador de issue como `DEMO-42` ou o número da issue; `project_id` é informado separadamente. `plan_tasks` informa `task_index` a partir de zero. `minddy_update_plan_task` recebe um array `tasks` com os estados `pending`, `in_progress`, `completed` ou `cancelled`; um índice inválido faz o lote inteiro ser rejeitado. `minddy_append_to_plan` acrescenta conteúdo, enquanto `minddy_edit_issue_text` substitui `old_string` por `new_string` em uma correspondência exata e única. Releia um plano que pode ter mudado: substituí-lo por inteiro pode sobrescrever o progresso de outras pessoas. A seção `## Questions` fica fora da contagem de tarefas.

### Respeitar revisões e propriedade {#pages-and-routines}

`minddy_list_pages` mostra a hierarquia, `minddy_search_pages` retorna trechos e `minddy_get_page` retorna Markdown, comentários e valores completos. Prefira edições parciais e use a versão atual ao substituir conteúdo. Preserve as URLs de arquivos e imagens. `minddy_create_page` com `database=true` cria um banco de páginas. `minddy_update_page_database` exige a revisão do banco para alterações no esquema e o valor anterior para alterações nas células.

Para converter um tipo, use `operation=convert` com `propertyId`, `targetType`, `revision` e `preview=true`. Confira `incompatibleCount`, depois envie as mesmas configurações com `preview=false` e o `token` retornado. Defina `confirmLoss=true` somente depois de o usuário autorizar explicitamente a remoção dos valores incompatíveis.

Somente o proprietário pode criar, pausar, reagendar ou remover suas rotinas. Leia antes de criar para evitar duplicatas. `minddy_add_resource` limita os arquivos a 10 MB; as ferramentas de página não inventam URLs.

### Conferir com um exemplo {#example}

O exemplo altera a primeira tarefa de um plano já lido. Substitua o UUID do projeto e a issue pelos valores encontrados na descoberta e use o índice da última leitura. Depois confira `plan_tasks` e `plan_progress`. Para um erro de acesso, verifique conta e projeto; para conflito, releia e aplique apenas a alteração necessária. Não repita uma alteração externa de resultado incerto sem conferir o resultado.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Escolher um objetivo para um feedback {#feedback-objectives}

As leituras de feedback incluem `objective_id`; `minddy_list_feedback` aceita um filtro opcional por objetivo (`null` seleciona solicitações sem objetivo). Use `minddy_link_feedback_objective` com `project_id`, `feedback_post_id` e `objective_id` apenas quando o usuário solicitar explicitamente; `null` remove o vínculo. O objetivo deve estar ativo e pertencer ao mesmo projeto. O detalhe do objetivo inclui `linked_feedback`. O proprietário pode fornecer `objective_id` a `minddy_create_integration` para uma chave de feedback ou alterar a configuração com `minddy_update_integration_objective`. Feedbacks existentes mantêm sua escolha. A conversão herda objetivo e categorias; a revisão do Numo nunca atribui objetivos.
