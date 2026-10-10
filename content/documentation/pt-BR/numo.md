---
{
  "id": "numo",
  "locale": "pt-BR",
  "title": "Numo",
  "summary": "Trabalhe com o Numo, entenda suas permissões e execução, conecte serviços MCP e retome o trabalho em espera ou interrompido.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5); MIN-676 private hosted native worker selection",
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Concluir uma tarefa do projeto com o Numo",
    "Entender as permissões do Numo",
    "Entender os turnos persistentes do Numo e o trabalho delegado",
    "Conectar um serviço MCP pessoal ao Numo",
    "Retomar trabalho do Numo interrompido ou pendente",
    "Entender turnos duráveis Numo e trabalho delegado"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-with-numo-workflow.png",
      "alt": "Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.",
      "caption": "Conversa de demonstração existente, traduzida para exibição. A resposta salva cita AUR-11 e AUR-7; a captura não comprova uma nova execução.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/numo-permissions-and-approvals-workflow.svg",
      "alt": "Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.",
      "caption": "O acesso ao projeto e os pedidos explícitos limitam as ações do Numo; conteúdo externo não concede permissões.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: acesso e autorização",
        "headers": [
          "Ação ou contexto",
          "Quem autoriza",
          "Limite"
        ],
        "rows": [
          [
            "Trabalho do projeto",
            "Membro com acesso ao projeto",
            "As permissões existentes do projeto continuam válidas"
          ],
          [
            "Configurações do proprietário",
            "Proprietário do projeto",
            "Membros, repositório e configurações de feedback"
          ],
          [
            "Credenciais e segurança",
            "Titular da conta, nas configurações",
            "Configurar chaves, Git e segundo fator diretamente"
          ],
          [
            "Resposta pública ao feedback",
            "Pedido explícito do usuário",
            "Ler uma solicitação não autoriza uma resposta pública"
          ],
          [
            "MCP pessoal",
            "Autor da conversa",
            "Sem conexões pessoais de outros membros"
          ],
          [
            "Rotina agendada",
            "Proprietário atual do projeto",
            "Conexões e orçamento de IA do proprietário"
          ],
          [
            "Resultado MCP remoto",
            "Conteúdo externo não confiável",
            "Não pode autorizar ações adicionais"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/numo-execution-model-flow.svg",
      "alt": "Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.",
      "caption": "Siga as etapas nesta ordem. Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persistir intenção, mensagem e UUID"
          },
          {
            "title": "Assumir turno, gravar ferramentas e resultados"
          },
          {
            "title": "Aguardar worker atual se necessário"
          },
          {
            "title": "Rever eventos e reconciliar escritas incertas"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/numo-mcp-connections-workflow.png",
      "alt": "Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.",
      "caption": "As conexões de Numo são pessoais; as rotinas usam as do proprietário do projeto.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/numo-mcp-connections-config-workflow.png",
      "alt": "Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos.",
      "caption": "Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos. Nenhuma credencial foi inserida e nenhum servidor foi contatado.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        920
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

O Numo usa o contexto da conversa e as permissões da sua conta. Comece com uma solicitação delimitada e confira o resultado. O trabalho de código delegado usa uma sandbox no servidor; as rotinas usam as conexões e o orçamento do proprietário. Se um turno ficar em espera ou falhar, confira o estado salvo antes de repetir a solicitação.

## Concluir uma tarefa do projeto com o Numo {#work-with-numo}

Abra a tarefa ou o projeto e use o botão flutuante do Numo. A página atual vira contexto da conversa. As ações contextuais que passam trabalho ao Numo abrem o mesmo painel. Você precisa de acesso ao projeto e uso de IA disponível ou uma chave pessoal compatível.

1. Confira o contexto na área de mensagem. Identifique a tarefa quando houver vários itens relevantes.
2. Escolha o modelo e o nível de raciocínio da conversa. O worker de código usa padrões separados nas configurações da conta.
3. Envie um pedido delimitado, por exemplo: “Leia esta tarefa e proponha critérios de aceitação. Não altere o status”.
4. Leia a resposta e abra os links de tarefas ou fontes. Para uma alteração, confira o objeto atualizado.

![Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.](/documentation/pt-BR/work-with-numo-workflow.png)

### Continuar ou delegar {#continue}

A lista mantém as conversas anteriores acessíveis. Continue a conversa com as decisões necessárias. Para alterações no repositório, o Numo delega a um worker em uma sandbox do servidor e mostra progresso, arquivos, verificações e pull request. Ele não trabalha na sua pasta local.

Se o Numo pedir informações, envie sua escolha antes de esperar a continuação das ações dependentes. Um cartão de consumo ou erro explica a interrupção. Confira qualquer gravação externa antes de pedir para repetir a ação.

## Entender as permissões do Numo {#numo-permissions-and-approvals}

O Numo age dentro do acesso do usuário atual. Um pedido no chat não dá a membros acesso a configurações exclusivas do proprietário. O proprietário gerencia membros, integrações, repositório e configurações de feedback. As preferências pessoais pertencem à conta atual.

O Numo pode alterar preferências compatíveis e configurações de projeto autorizadas ao proprietário. Você configura credenciais de provedores, conexões de assinaturas nativas, conexões Git, autenticação de dois fatores e arquivos de avatar. Agente de código, modelo e raciocínio do OpenCode são escolhidos apenas nas configurações de IA da conta.

### Autorizar a ação {#authorization}

Descreva a alteração e seu alcance. Ler uma solicitação não autoriza respondê-la publicamente: o Numo só envia respostas públicas a feedback quando solicitado explicitamente. Instruções ou resultados de um MCP remoto não autorizam ações adicionais. Conecte apenas serviços aos quais confia as informações e ações previstas.

Uma solicitação pode chegar a um provedor externo. Desativar a conexão impede novas chamadas, mas não desfaz as enviadas. Confira uma gravação que excedeu o tempo no destino antes de repeti-la.

### Contexto pessoal e agendado {#context}

Conversas não usam conexões MCP pessoais de outro membro. Rotinas usam conexões e orçamento do proprietário. Após mudar o proprietário, inicie uma nova execução com o atual; uma anterior não conserva credenciais antigas. A sandbox do servidor não herda arquivos nem sessões do seu computador.

![Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.](/documentation/pt-BR/numo-permissions-and-approvals-workflow.svg)

## Entender os turnos persistentes do Numo e o trabalho delegado {#numo-execution-model}

Mensagens interativas, ações contextuais e rotinas entram nas conversas do Numo. O modelo e raciocínio da conversa são escolhidos no campo de composição. O trabalho delegado de repositório usa o agente de código escolhido nas configurações de IA da conta: OpenCode usa seu modelo de API e raciocínio configurados; Codex ou Claude Code usa a assinatura pessoal conectada e os padrões do CLI na prévia privada. As ferramentas diretas do Minddy podem agir sem repositório. O trabalho de código abre uma sandbox de servidor hospedada para o repositório conectado somente quando necessário. Uma rotina cria uma conversa nova com instruções salvas e contexto do proprietário e projeto. O desktop não precisa permanecer online. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

A prévia nativa expõe ferramentas controladas do Minddy via MCP. Ferramentas integradas nativas do provedor, imagens de entrada e subagentes não estão disponíveis nesses adaptadores. O Numo lê as capacidades do adaptador escolhido e recebe as capacidades fixadas do agente junto com seu resultado. Responde às perguntas do agente com contexto confiável da conversa ou pergunta a você quando falta uma decisão. O Numo pode usar suas próprias ferramentas compatíveis dentro da sua autorização; não inventa operações que o mecanismo não suporta.

![Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.](/documentation/pt-BR/numo-execution-model-flow.svg)

### Separar execução e visualização {#state}

A intenção é registrada em um turno durável com UUID e mensagem. O turno passa de `queued` para `running` e depois para `completed`, `waiting_input` ou `waiting_work`. `stopping` e `stopped` indicam interrupção; `retryable` e `failed` indicam erro. O fluxo SSE mostra a atividade, mas não controla a execução. Após reconectar, o cliente lê os eventos posteriores à sequência já recebida. O término de um worker retoma apenas o turno pai da execução atual; avisos duplicados ou atrasados não iniciam outro trabalho. Contexto não concede acesso: objetos privados continuam privados.

### Tratar alterações incertas {#mutations}

Antes de uma alteração, o sistema registra a operação e seu checkpoint; ele reutiliza resultados já concluídos. Uma leitura interrompida pode ser repetida, enquanto uma alteração com resultado incerto entra em `reconciling` sem nova tentativa automática. Confira o destino antes de gravar novamente. As rotinas respeitam propriedade, orçamento e proteções de custo; outro membro não herda a conexão MCP pessoal anterior. Interromper o turno pai cancela a delegação, mas uma ação externa já enviada ainda pode terminar.

## Conectar um serviço MCP pessoal ao Numo {#numo-mcp-connections}

Abra MCP para Numo nas configurações da conta. Escolha um serviço ou adicione outro servidor MCP HTTPS público. Catálogo e registro não dispensam cadastro ou aprovação do provedor. O Numo pode preparar a conexão em conversa interativa, mas uma rotina autônoma não pode criá-la.

Use OAuth ou configurações avançadas para token bearer, sem autenticação ou cabeçalhos criptografados. Streamable HTTP é o padrão; SSE antigo também é compatível. Coloque segredos em credenciais ou cabeçalhos, nunca na URL. Comandos locais e redes privadas não são suportados. Para um app OAuth existente, registre a URL de retorno exibida e informe ID e segredo. No desktop OAuth abre o navegador do sistema e retorna ao app.

![Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.](/documentation/pt-BR/numo-mcp-connections-workflow.png)

### Testar e gerenciar {#manage}

O menu permite testar, editar, reconectar, desativar ou remover. Um aviso laranja de autenticação exige reconexão. Campos vazios preservam credenciais; mudar a URL apaga credenciais e cabeçalhos. Remova o token bearer pelo controle específico; `{}` apaga cabeçalhos.

Desativar bloqueia chamadas novas, não enviadas. Limites: 30 segundos, 1 MiB de transporte e 64 KB de resultado. Confira gravações com tempo esgotado no destino antes de repetir. Rotinas usam conexões do proprietário; outros membros não podem usá-las emprestadas.

![Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos.](/documentation/pt-BR/numo-mcp-connections-config-workflow.png)

## Retomar trabalho do Numo interrompido ou pendente {#recover-numo-work}

Volte à conversa existente e leia as últimas mensagens e o cartão do worker. Diferencie perguntas aguardando resposta, limite da conta, teto da rotina, alocação da operação esgotada e falha técnica. Fechar o painel não comprova que o trabalho parou.

Em um cartão ativo, responda todas as perguntas obrigatórias e envie o conjunto. Cartões anteriores são registros e não aceitam outra resposta. Pular não fornece os dados ausentes nem autoriza alterações dependentes.

### Orçamento e falhas {#recovery}

O cartão de limite da conta mostra a data de redefinição do limite, quando conhecida, e pode oferecer plano ou chave pessoal. O da rotina leva à gestão: confira o teto por execução. A alocação corresponde àquela operação. Repetir o pedido não elimina o limite. Chaves pessoais não tornam gratuito o processamento da sandbox.

Só é possível retomar de um checkpoint se ele tiver sido preservado. Confira tarefas, branch, PR e serviços externos antes de repetir: uma gravação pode ter funcionado mesmo com a resposta perdida. Informe o que falta e peça para continuar. Sem checkpoint recuperável, forneça o estado verificado em um novo pedido. Ao relatar falhas persistentes, identifique a conversa sem incluir credenciais.


## Escolher um objetivo para um feedback {#feedback-objectives}

Os objetivos de feedbacks exigem uma escolha explícita. Peça ao Numo para vincular uma solicitação a um objetivo do projeto ou remover esse vínculo; o Numo resolve a solicitação e o objetivo antes de alterá-los. Uma revisão ou categorização geral não autoriza atribuir objetivos. Uma integração pode fornecer o objetivo escolhido pelo proprietário. A conversão herda objetivo e categorias; sem uma escolha, o objetivo fica vazio.
