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
  "revision": 24,
  "sourceRevision": 23,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-27",
  "compatibility": {
    "version": "0.40.0 (MIN-970 release review)",
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
      "lib/server/mcp/tool-helpers.ts",
      "components/settings/account-settings-page.tsx",
      "lib/server/project-stats.ts",
      "lib/project-stats.ts",
      "lib/server/database-view-tools.ts",
      "components/first-run/onboarding-screen.tsx"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (MIN-1030: minddy_upload_image (base64 or resource_id, bitmap types, 10 MB, comment capability) and the resource mention; checked against lib/server/mcp/tools.ts, lib/server/mcp/tool-capabilities.ts and lib/server/inline-images.ts; agent review, not human acceptance)",
    "language": "agent:claude-code (pt-BR MIN-1030 sentences translated from en with the locale register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-27"
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
      "caption": "Selecione seu cliente para abrir as duas etapas de conexão.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Nas configurações da conta, a seção MCP do minddy abre um assistente de duas etapas para cada cliente. Na primeira etapa, **Copiar o prompt** copia um pedido para colar no cliente: ele pede que o cliente adicione o servidor MCP do minddy com a configuração desse cliente, incluída no prompt. Para fazer isso você mesmo, abra **Configurar manualmente**: ali aparecem o comando de instalação, a configuração ou a URL do servidor, com um botão para copiá-los. A segunda etapa autoriza o login do cliente. Ela indica quando o minddy recebe esse acesso; até lá, fechá-la apenas adia o login.

A lista de clientes termina com **Outro**, para um cliente que não está na lista. Ele não abre nenhum assistente: copia um prompt geral que pede ao cliente para adicionar o servidor MCP do minddy, um servidor remoto via HTTP no endereço desta instância terminado em `/api/mcp`, com login OAuth. Cole no cliente; na primeira vez que o cliente usar o minddy, autorize o login dele no navegador. Nos primeiros passos, **Conectar um agente de código** abre a mesma lista em uma folha no celular e em uma caixa de diálogo no computador, com os clientes como cartões quadrados em duas colunas; as configurações da conta mantêm a lista compacta.

![Seletor de clientes MCP minddy com Claude, Codex e outros assistentes.](/documentation/pt-BR/external-minddy-mcp-workflow.png)

### Disponibilidade do MCP e acesso à rede {#network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

- **Mesmo computador:** `http://localhost:6463/api/mcp` funciona para um cliente compatível executado no computador que hospeda a instância local. `localhost` e `127.0.0.1` identificam o computador que inicia a conexão. O inicializador de instâncias locais do aplicativo desktop escuta apenas na interface de loopback; outro computador ou um agente hospedado na nuvem não pode acessá-lo diretamente. Abrir a URL localhost do servidor em outro computador aponta para esse outro computador.

- **LAN ou VPN:** uma instância configurada como `http://192.168.1.50` anuncia `http://192.168.1.50/api/mcp`. Um cliente na LAN, ou conectado por VPN, pode usá-la se o endereço de escuta, a origem configurada, a porta da aplicação, o firewall e o roteamento permitirem o acesso. O navegador precisa alcançar as mesmas URLs de autorização anunciadas. Isso exige uma instalação de servidor acessível; mudar apenas a URL do cliente não expõe um processo limitado ao loopback.

- **Fora da rede privada:** use uma origem HTTPS acessível, por exemplo `https://tickets.example.com/api/mcp`, ou outro caminho de rede aceito pelo cliente. Um agente hospedado precisa de seu próprio caminho até a instância; a VPN no computador do navegador, sozinha, não fornece esse caminho. Hospedar o minddy localmente não o expõe automaticamente à Internet.

### Escopo e revogação {#access}

Clientes externos usam ferramentas disponíveis para tickets, planos, comentários, páginas, feedback, ciclos, rotinas e caderno de tarefas dentro dos acessos autorizados. As ferramentas seguem, a cada chamada, o seu papel atual em cada projeto, então uma mudança de papel vale sem reconectar. Como leitor, você recebe as ferramentas de leitura, mais as ferramentas de comentário quando o proprietário ativou **Pode comentar** para você. MCP está disponível em todos os planos Cloud; a IA do cliente ainda depende da configuração e custos dele.

minddy MCP nas configurações da conta lista acessos externos e controles de revogação. Revogue clientes sem uso ou confiança. O cartão **MCP para o Numo** da aba **MCP** é diferente: conecta o Numo a outros serviços. Não cole tokens em tickets, feedback público nem capturas.

![Etapa de instalação do Codex no assistente de conexão ao MCP do minddy, mostrando o endpoint minddy Cloud.](/documentation/pt-BR/external-minddy-mcp-install-workflow.png)


## Usar o minddy MCP e descobrir as ferramentas atuais {#mcp-tool-reference}

`/api/mcp` usa Streamable HTTP, ferramentas sem estado e OAuth 2.1. Conecte sua conta pelo consentimento no navegador; as antigas chaves `mdyk_` não são aceitas. Use `minddy_list_projects` para descobrir os UUIDs dos projetos, necessários às ferramentas que agem sobre um projeto inteiro, e leia os esquemas do servidor conectado. `/llms-full.txt` gera os parâmetros exatos a partir dos registros das ferramentas. Não os reconstrua com uma lista antiga. Cada ferramenta de projeto verifica novamente o acesso e retorna códigos de erro estáveis.

### Ler antes de alterar os planos {#issue-plans}

Para encontrar um ticket, chame `minddy_list_issues` com `query`: a busca considera palavras do título e da descrição, um identificador ou um número. Correspondências de texto e identificadores exatos vêm primeiro; uma busca descritiva pode depois acrescentar tickets do mesmo projeto encontrados [pelo sentido](/docs/navigation#search-by-meaning), marcados com `match: "semantic"`. Leia um ticket assim antes de agir sobre ele. A busca pelo sentido é cobrada da sua conta como **Busca de tickets** e não acontece se você desligou **Indexar tickets**.

`minddy_get_issue` e as outras ferramentas que indicam tickets aceitam o UUID de um ticket, um identificador como `DEMO-42` ou o número do ticket. Um UUID ou um identificador já indica seu projeto, então `project_id` é opcional. Informe-o com um número sozinho, ou quando dois dos seus projetos compartilham uma chave e o erro `ambiguous_issue_ref` os lista. Um `project_id` que não é o do ticket retorna `issue_not_found`. `plan_tasks` informa `task_index` a partir de zero. `minddy_update_plan_task` recebe um array `tasks` com os estados `pending`, `in_progress`, `completed` ou `cancelled`; um índice inválido faz o lote inteiro ser rejeitado. `minddy_append_to_plan` acrescenta conteúdo, enquanto `minddy_edit_issue_text` substitui `old_string` por `new_string` em uma correspondência exata e única. Releia um plano que pode ter mudado: substituí-lo por inteiro pode sobrescrever o progresso de outras pessoas. A seção `## Questions` fica fora da contagem de tarefas.

Quando um prompt do minddy nomeia um brief (`plan`, `implement`, `verify`, `comments` ou `custom`), passe-o para `minddy_get_issue` como `brief`. O resultado começa então com um campo `brief`: o procedimento a seguir para essa tarefa nesse ticket. O restante do resultado são dados, não instruções.

`minddy_get_project_stats` lê as estatísticas das configurações gerais de um projeto: os tickets por status; o número de tickets abertos, atrasados, sem responsável e parados; os próprios tickets atrasados e parados, os mais urgentes primeiro; o ritmo de quatro semanas; o prazo mediano; os tickets criados e concluídos a cada semana; os principais colaboradores; e os pull requests vinculados. Um ticket parado está em andamento ou em revisão sem alterações há 14 dias. A ferramenta é somente leitura e aberta a todas as funções, incluindo leitores.

Para alterar vários tickets, envie uma única chamada a `minddy_update_issues`: `issues` com `fields` aplica a mesma alteração a cada ticket, e `updates` acrescenta tickets que recebem cada um seus próprios campos. Uma chamada aceita até 50 tickets, cada um citado uma única vez, e retorna `updated` e `failed` por ticket, de modo que uma falha não interrompe os demais. As outras escritas repetidas aceitam uma lista de itens adicionais ao lado dos campos habituais: `links` para `minddy_link_issues`, `edits` para `minddy_edit_issue_text` e `minddy_edit_page_text` (aplicadas em ordem; se uma não corresponder, nada é gravado), `pages` para `minddy_create_page` (páginas sob o mesmo pai, como as entradas de um banco de dados) e `feedback_post_ids` para `minddy_update_feedback`. `minddy_update_page` com `parent_page_id` move uma página na árvore, ou para a raiz com `null`. O caderno de tarefas e as descrições de objetivos são corrigidos da mesma forma: `minddy_edit_scratchpad_text` reescreve ou remove trechos do caderno, e `minddy_update_objective` aceita `description_edits` em vez de uma `description` inteira. `minddy_append_to_plan` com `field: "description"` acrescenta um bloco ao final da descrição de um ticket, e `description_append` faz o mesmo para um objetivo; uma alteração em um objetivo é recusada, em vez de aplicada, se o objetivo mudou desde a leitura.

As leituras que retornam texto com imagens (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) as listam em `images`, cada uma com seu `src` e texto alternativo. Passe esse `src` exatamente como está para `minddy_get_image`: a ferramenta verifica seu acesso ao projeto da imagem, ou se uma imagem do caderno é sua, e retorna a imagem até 10 MB com um `download_url` assinado válido por cerca de dez minutos. Uma imagem hospedada fora do minddy volta apenas como URL.

Para mostrar uma imagem em um texto, chame `minddy_upload_image` com a imagem em base64 (PNG, JPEG, GIF, WebP ou AVIF, no máximo 10 MB) ou com o `resource_id` de um recurso de arquivo a ser copiado. A ferramenta retorna `markdown`, a linha `![alt](src)` para colocar no comentário, na descrição, no plano ou na página que você escreve em seguida. Ela exige a permissão de comentar no projeto. Ela não anexa um recurso: isso é feito por `minddy_add_resource`, e um recurso pode ser citado em um texto como menção, `[@nome](mention:resource/<id>)`.

### Respeitar revisões e propriedade {#pages-and-routines}

`minddy_list_pages` mostra a hierarquia, `minddy_search_pages` retorna trechos e `minddy_get_page` retorna Markdown, comentários e valores completos. Prefira edições parciais e use a versão atual ao substituir conteúdo. Preserve as URLs de arquivos e imagens. `minddy_create_page` com `database=true` cria um banco de páginas. `minddy_update_page_database` exige a revisão do banco para alterações no esquema e o valor anterior para alterações nas células. Para preencher um banco com menos chamadas, passe `values` para `minddy_create_page` para criar uma entrada com suas propriedades, ou use `operation=values` para alterar várias propriedades da mesma entrada de uma vez: todas as células são gravadas juntas ou nenhuma.

As visualizações salvas de um banco são lidas com `minddy_list_page_database_views` e criadas, alteradas, excluídas ou reordenadas com `minddy_update_page_database_views`. Os filtros usam os IDs de propriedades e opções retornados por `minddy_get_page`, nunca o nome de uma opção; `filters`, `hidden_property_ids` e `calculations` substituem cada um todo o valor atual, e `operation=reorder` lista cada visualização uma única vez. `calculations` associa o ID de uma propriedade Número a `sum`, `average`, `min`, `max` ou `count`, o valor que a tabela mostra sob essa coluna; sem `view_id`, `operation=update` muda a visualização que a tabela mostra primeiro, ou salva a visualização padrão quando o banco de dados não tem nenhuma.

Para converter um tipo, use `operation=convert` com `propertyId`, `targetType`, `revision` e `preview=true`. Confira `incompatibleCount`, depois envie as mesmas configurações com `preview=false` e o `token` retornado. Defina `confirmLoss=true` somente depois de o usuário autorizar explicitamente a remoção dos valores incompatíveis.

As ferramentas de rotinas, exclusivas do proprietário, criam, alteram, pausam ou removem rotinas acionadas por um agendamento, um evento ou uma nova entrada de banco de dados. Leia antes de criar para evitar duplicatas. `minddy_add_resource` limita os arquivos a 10 MB; as ferramentas de página não inventam URLs.

`minddy_trash_page` move uma página e suas subpáginas para a lixeira; confirme antes com o usuário. `minddy_list_trash` lista o que foi excluído dos seus projetos e `minddy_restore_from_trash` restaura um item como ele era, com o `type` e o `id` que a lista retorna. Só o proprietário do projeto pode restaurar um projeto ou uma rotina.

### Conferir com um exemplo {#example}

O exemplo altera a primeira tarefa de um plano já lido. Substitua o ticket por um encontrado na descoberta e use o índice da última leitura. Depois confira `plan_tasks` e `plan_progress`. Para um erro de acesso, verifique conta e projeto; para conflito, releia e aplique apenas a alteração necessária. Não repita uma alteração externa de resultado incerto sem conferir o resultado.

```json
{
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Escolher um objetivo para um feedback {#feedback-objectives}

As leituras de feedback incluem `objective_id`; `minddy_list_feedback` aceita um filtro opcional por objetivo (`null` seleciona solicitações sem objetivo). Use `minddy_link_feedback_objective` com `project_id`, `feedback_post_id` e `objective_id` apenas quando o usuário solicitar explicitamente; `null` remove o vínculo. O objetivo deve estar ativo e pertencer ao mesmo projeto. O detalhe do objetivo inclui `linked_feedback`. O proprietário pode fornecer `objective_id` a `minddy_create_integration` para uma chave de feedback ou alterar a configuração com `minddy_update_integration_objective`. Feedbacks existentes mantêm sua escolha. A conversão herda objetivo e categorias; a revisão do Numo nunca atribui objetivos.
