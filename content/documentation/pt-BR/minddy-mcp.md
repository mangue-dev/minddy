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
  "revision": 14,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:MIN-768 (MCP setup moved to wizards: changed passages checked against components/settings/account-mcp-clients.tsx and mcp-connect-panel.tsx; 1 screenshot recaptured on 2026-10-21 from the local candidate and inspected; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures)",
    "language": "agent:MIN-768 (pt-BR translation of the changed passages with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Etapa de instalação do Codex no assistente de conexão ao MCP do minddy, mostrando o endpoint minddy Cloud.",
      "caption": "Este exemplo se conecta ao minddy Cloud. Para uma instância autogerenciada, use a origem da sua própria instância; o comando exibido não foi executado para esta captura.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        288
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

Entre pelo navegador e confira a autorização antes de concedê-la. A conexão age como sua conta minddy, sem acesso a projetos fora das suas permissões. Comece lendo um ticket que você já consegue abrir e confira o projeto retornado.

Nas configurações da conta, a seção MCP do minddy abre um assistente de duas etapas para cada cliente: copie o comando de instalação, a configuração ou a URL do servidor e depois autorize o login do cliente. A segunda etapa indica quando o minddy recebe esse acesso; até lá, fechá-la apenas adia o login.

![Seletor de clientes MCP minddy com Claude, Codex e outros assistentes.](/documentation/pt-BR/external-minddy-mcp-workflow.png)

### Disponibilidade do MCP e acesso à rede {#network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

- **Mesmo computador:** `http://localhost:6463/api/mcp` funciona para um cliente compatível executado no computador que hospeda a instância local. `localhost` e `127.0.0.1` identificam o computador que inicia a conexão. O inicializador de instâncias locais do aplicativo desktop escuta apenas na interface de loopback; outro computador ou um agente hospedado na nuvem não pode acessá-lo diretamente. Abrir a URL localhost do servidor em outro computador aponta para esse outro computador.

- **LAN ou VPN:** uma instância configurada como `http://192.168.1.50` anuncia `http://192.168.1.50/api/mcp`. Um cliente na LAN, ou conectado por VPN, pode usá-la se o endereço de escuta, a origem configurada, a porta da aplicação, o firewall e o roteamento permitirem o acesso. O navegador precisa alcançar as mesmas URLs de autorização anunciadas. Isso exige uma instalação de servidor acessível; mudar apenas a URL do cliente não expõe um processo limitado ao loopback.

- **Fora da rede privada:** use uma origem HTTPS acessível, por exemplo `https://tickets.example.com/api/mcp`, ou outro caminho de rede aceito pelo cliente. Um agente hospedado precisa de seu próprio caminho até a instância; a VPN no computador do navegador, sozinha, não fornece esse caminho. Hospedar o minddy localmente não o expõe automaticamente à Internet.

### Escopo e revogação {#access}

Clientes externos usam ferramentas disponíveis para tickets, planos, comentários, páginas, feedback, ciclos, rotinas e caderno de tarefas dentro dos acessos autorizados. As ferramentas seguem, a cada chamada, o seu papel atual em cada projeto, então uma mudança de papel vale sem reconectar. Como leitor, você recebe as ferramentas de leitura, mais as ferramentas de comentário quando o proprietário ativou **Pode comentar** para você. MCP está disponível em todos os planos Cloud; a IA do cliente ainda depende da configuração e custos dele.

minddy MCP nas configurações da conta lista acessos externos e controles de revogação. Revogue clientes sem uso ou confiança. O cartão **MCP para o Numo** da aba **IA e Numo** é diferente: conecta o Numo a outros serviços. Não cole tokens em tickets, feedback público nem capturas.

![Etapa de instalação do Codex no assistente de conexão ao MCP do minddy, mostrando o endpoint minddy Cloud.](/documentation/pt-BR/external-minddy-mcp-install-workflow.png)


## Usar o minddy MCP e descobrir as ferramentas atuais {#mcp-tool-reference}

`/api/mcp` usa Streamable HTTP, ferramentas sem estado e OAuth 2.1. Conecte sua conta pelo consentimento no navegador; as antigas chaves `mdyk_` não são aceitas. Use `minddy_list_projects` para descobrir UUIDs e leia os esquemas do servidor conectado. `/llms-full.txt` gera os parâmetros exatos a partir dos registros das ferramentas. Não os reconstrua com uma lista antiga. Cada ferramenta de projeto verifica novamente o acesso e retorna códigos de erro estáveis.

### Ler antes de alterar os planos {#issue-plans}

Para encontrar um ticket, chame `minddy_list_issues` com `query`: a busca considera palavras do título e da descrição, um identificador ou um número. Correspondências de texto e identificadores exatos vêm primeiro; uma busca descritiva pode depois acrescentar tickets do mesmo projeto encontrados [pelo sentido](/docs/navigation#search-by-meaning), marcados com `match: "semantic"`. Leia um ticket assim antes de agir sobre ele. A busca pelo sentido é cobrada da sua conta como **Busca de tickets** e não acontece se você desligou **Indexar tickets**.

`minddy_get_issue` aceita o UUID de um ticket, um identificador de ticket como `DEMO-42` ou o número do ticket; `project_id` é informado separadamente. `plan_tasks` informa `task_index` a partir de zero. `minddy_update_plan_task` recebe um array `tasks` com os estados `pending`, `in_progress`, `completed` ou `cancelled`; um índice inválido faz o lote inteiro ser rejeitado. `minddy_append_to_plan` acrescenta conteúdo, enquanto `minddy_edit_issue_text` substitui `old_string` por `new_string` em uma correspondência exata e única. Releia um plano que pode ter mudado: substituí-lo por inteiro pode sobrescrever o progresso de outras pessoas. A seção `## Questions` fica fora da contagem de tarefas.

As leituras que retornam texto com imagens (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) as listam em `images`, cada uma com seu `src` e texto alternativo. Passe esse `src` exatamente como está para `minddy_get_image`: a ferramenta verifica seu acesso ao projeto da imagem, ou se uma imagem do caderno é sua, e retorna a imagem até 10 MB com um `download_url` assinado válido por cerca de dez minutos. Uma imagem hospedada fora do minddy volta apenas como URL.

### Respeitar revisões e propriedade {#pages-and-routines}

`minddy_list_pages` mostra a hierarquia, `minddy_search_pages` retorna trechos e `minddy_get_page` retorna Markdown, comentários e valores completos. Prefira edições parciais e use a versão atual ao substituir conteúdo. Preserve as URLs de arquivos e imagens. `minddy_create_page` com `database=true` cria um banco de páginas. `minddy_update_page_database` exige a revisão do banco para alterações no esquema e o valor anterior para alterações nas células.

Para converter um tipo, use `operation=convert` com `propertyId`, `targetType`, `revision` e `preview=true`. Confira `incompatibleCount`, depois envie as mesmas configurações com `preview=false` e o `token` retornado. Defina `confirmLoss=true` somente depois de o usuário autorizar explicitamente a remoção dos valores incompatíveis.

As ferramentas de rotinas, exclusivas do proprietário, criam, alteram, pausam ou removem rotinas acionadas por um agendamento, um evento ou uma nova entrada de banco de dados. Leia antes de criar para evitar duplicatas. `minddy_add_resource` limita os arquivos a 10 MB; as ferramentas de página não inventam URLs.

### Conferir com um exemplo {#example}

O exemplo altera a primeira tarefa de um plano já lido. Substitua o UUID do projeto e o ticket pelos valores encontrados na descoberta e use o índice da última leitura. Depois confira `plan_tasks` e `plan_progress`. Para um erro de acesso, verifique conta e projeto; para conflito, releia e aplique apenas a alteração necessária. Não repita uma alteração externa de resultado incerto sem conferir o resultado.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Escolher um objetivo para um feedback {#feedback-objectives}

As leituras de feedback incluem `objective_id`; `minddy_list_feedback` aceita um filtro opcional por objetivo (`null` seleciona solicitações sem objetivo). Use `minddy_link_feedback_objective` com `project_id`, `feedback_post_id` e `objective_id` apenas quando o usuário solicitar explicitamente; `null` remove o vínculo. O objetivo deve estar ativo e pertencer ao mesmo projeto. O detalhe do objetivo inclui `linked_feedback`. O proprietário pode fornecer `objective_id` a `minddy_create_integration` para uma chave de feedback ou alterar a configuração com `minddy_update_integration_objective`. Feedbacks existentes mantêm sua escolha. A conversão herda objetivo e categorias; a revisão do Numo nunca atribui objetivos.
