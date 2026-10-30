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
  "revision": 26,
  "sourceRevision": 25,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-30",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "components/home/home-numo-composer.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts"
    ]
  },
  "review": {
    "revision": 26,
    "fact": "agent:claude-code (recovery section: no per-operation allocation card any more and concurrent conversations share the account budget, checked against lib/server/numo/turns.ts, app/api/assistant/chat/route.ts and supabase/migrations/20270109200096_numo_turns_without_budget_reservation.sql; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured)",
    "language": "agent:claude-code (pt-BR changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-30"
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
    "Entender os turnos persistentes do Numo",
    "Conectar um serviço MCP pessoal ao Numo",
    "Retomar trabalho do Numo interrompido ou pendente",
    "Entender turnos duráveis Numo"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-with-numo-workflow.png",
      "alt": "Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.",
      "caption": "Conversa de demonstração existente, traduzida para exibição. A resposta salva cita AUR-11 e AUR-7; a captura não comprova uma nova execução.",
      "revision": 26,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 26,
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
      "alt": "Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar sua resposta se necessário. Rever eventos e reconciliar escritas incertas.",
      "caption": "Siga as etapas nesta ordem. Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar sua resposta se necessário. Rever eventos e reconciliar escritas incertas.",
      "revision": 26,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Aguardar sua resposta se necessário"
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
      "revision": 26,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "alt": "Assistente de conexão do Notion mostrando o método de login conhecido pelo catálogo.",
      "caption": "Etapa de login de um serviço do catálogo. Nenhuma credencial foi inserida e nenhum servidor foi contatado.",
      "revision": 26,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        354
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

O Numo usa o contexto da conversa e as permissões da sua conta. Comece com uma solicitação delimitada, confira o resultado e use as seções de permissões e execução para entender o trabalho agendado; as rotinas usam as conexões e o orçamento do proprietário. Se um turno ficar em espera ou falhar, confira o estado salvo antes de repetir a solicitação.

## Concluir uma tarefa do projeto com o Numo {#work-with-numo}

Abra o ticket ou o projeto e use o botão flutuante do Numo. A página atual vira contexto da conversa. As ações contextuais que passam trabalho ao Numo abrem o mesmo painel. Você precisa de acesso ao projeto e uso de IA disponível ou uma chave pessoal compatível.

1. Confira o contexto na área de mensagem. Identifique o ticket quando houver vários itens relevantes. Para adicionar um ticket como contexto, digite `@` na área de mensagem ou use **Adicionar contexto** → **Ticket**; uma descrição também lista tickets encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**.
2. Escolha o provedor, o modelo e o nível de raciocínio da conversa pelo logotipo do provedor, ao lado do microfone; ao passar o cursor, você vê o modelo atual. Essas escolhas valem para a conversa. Se o modelo não oferece controle de raciocínio, o controle deslizante fica em **Sem raciocínio**; em um modelo que sempre raciocina, **Sem raciocínio** usa o nível mais leve.
3. Envie um pedido delimitado, por exemplo: “Leia este ticket e proponha critérios de aceitação. Não altere o status”.
4. Leia a resposta e abra os links de tickets ou fontes. Para uma alteração, confira o objeto atualizado. Tickets, objetivos, projetos, páginas e membros que o Numo encontrou aparecem na resposta como menções em formato de pílula: cada uma abre o item correspondente, e uma que você não pode ver aparece como **Indisponível**. O Numo também escreve essas menções no que redige, como descrições e planos de tickets, descrições de objetivos, comentários, páginas e o caderno, só para os itens que identificou; um membro mencionado ali é notificado como em qualquer menção.

Em uma conversa nova e vazia, quatro linhas de sugestões acima do campo de mensagem propõem pedidos adequados à página atual, por exemplo **Resumir este ticket** ou **Escrever um plano de implementação** quando um ticket está aberto no painel lateral. Escolher uma linha preenche o campo sem enviá-lo, para que você possa ajustar o pedido antes. As linhas somem assim que o campo tem texto e voltam quando você o esvazia. Elas aparecem no layout de desktop, não em um celular. O campo de mensagem na parte de baixo da **Página inicial** mostra as mesmas linhas, com sugestões como **Escolher meu foco de hoje** ou **Encontrar o que está atrasado**; se você enviar de lá, o painel abre no layout ampliado.

Na **Página inicial**, e no painel do Numo quando ele está ampliado ou com o foco, você pode começar a digitar sem clicar no campo de mensagem: uma sequência rápida de teclas digitada fora de um campo de texto vai para o campo de mensagem, que recebe o foco. Uma tecla sozinha continua executando seu atalho de teclado, por exemplo C para criar um ticket, cerca de 0,2 segundo depois nessas telas. G seguido de uma tecla continua sendo uma sequência de navegação; uma terceira tecla na sequência transforma tudo em texto.

Para perguntar ao Numo sobre um trecho, selecione-o em um editor, como uma página ou a descrição de um ticket, e escolha **Pergunte ao Numo** na barra de ferramentas de seleção, no computador. O painel abre sem enviar nada: ao lado da página ou do ticket de onde veio, o trecho aparece como uma pílula de contexto com suas primeiras palavras, e ao passar o cursor sobre a pílula você vê o trecho inteiro. Digite sua pergunta, por exemplo “Reescreva isto de forma mais concisa” ou “Crie tickets a partir disto”, e envie. O trecho acompanha só essa mensagem. Para deixá-lo de fora, remova a pílula com o X.

O Numo também pode ver as imagens da descrição de um ticket ou objetivo, de um plano, de um comentário, de uma página ou do seu caderno quando o modelo da conversa aceita imagens. Sem essa capacidade, o Numo informa que não conseguiu ver a imagem em vez de descrevê-la.

O Numo também pode escrever um arquivo para baixar: um relatório ou um documento em PDF, uma exportação em CSV, ou um arquivo de texto, Markdown, HTML, JSON, XML, SVG ou de calendário. Peça na sua solicitação; o Numo pode montá-lo a partir dos arquivos que você adicionou à conversa. O arquivo aparece como um cartão abaixo da resposta: selecionar o cartão abre a visualização quando o formato permite, **Baixar** salva o arquivo, e o menu ao lado oferece **Visualização** e **Copiar o conteúdo**. O arquivo fica no armazenamento privado da sua conversa; para compartilhá-lo com o projeto, peça ao Numo para anexá-lo a um ticket, a um objetivo ou a um comentário que ele publicar lá. Um PDF usa as fontes padrão: caracteres fora dos alfabetos da Europa Ocidental e emojis não aparecem.

O modelo padrão do Numo vem de **Configurações da conta → IA e Numo → Modelo padrão do Numo**: o padrão do app ou um modelo pessoal do provedor ativo. Uma escolha explícita na conversa tem prioridade. Consulte [configurações de IA e uso](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.](/documentation/pt-BR/work-with-numo-workflow.png)

### Continuar uma conversa {#continue}

A lista mantém as conversas anteriores acessíveis. Continue a conversa com as decisões necessárias. O Numo organiza e acompanha o trabalho: lê e atualiza tickets, planos, páginas e outros conteúdos do Minddy e pode ler os pull requests vinculados. Quando você pede, ele também pode comentar um pull request, resolver as conversas de revisão já atendidas e mesclá-lo. Quando o Numo busca tickets, correspondências de texto e identificadores exatos vêm primeiro; uma busca descritiva pode acrescentar tickets do mesmo projeto encontrados pelo sentido, que o Numo deve conferir antes de se basear neles. Ele não escreve código nem faz push de commits. Para que o código seja escrito, copie o prompt do ticket para seu próprio agente de código; consulte [Trabalho de código e pull requests](/docs/code-work#external-coding-agents).

Se o Numo pedir informações, envie sua escolha antes de esperar a continuação das ações dependentes. Um cartão de consumo ou erro explica a interrupção. Confira qualquer gravação externa antes de pedir para repetir a ação.

## Entender as permissões do Numo {#numo-permissions-and-approvals}

O Numo age dentro do acesso e do papel do usuário atual. Um pedido no chat não dá a membros acesso a configurações exclusivas do proprietário. O Numo de um leitor, no chat ou por `@Numo` em um comentário que ele tem permissão para publicar, usa apenas ferramentas de leitura e é cobrado do leitor. O proprietário gerencia membros, integrações, repositório e configurações de feedback. As preferências pessoais pertencem à conta atual.

O Numo pode alterar preferências compatíveis e configurações de projeto autorizadas ao proprietário. Você configura credenciais de provedores, conexões Git, autenticação de dois fatores e arquivos de avatar.

### Autorizar a ação {#authorization}

Descreva a alteração e seu alcance. Ler uma solicitação não autoriza respondê-la publicamente: o Numo só envia respostas públicas a feedback quando solicitado explicitamente. Instruções ou resultados de um MCP remoto não autorizam ações adicionais. Conecte apenas serviços aos quais confia as informações e ações previstas.

Uma solicitação pode chegar a um provedor externo. Desativar a conexão impede novas chamadas, mas não desfaz as enviadas. Confira uma gravação que excedeu o tempo no destino antes de repeti-la.

### Contexto pessoal e agendado {#context}

Conversas não usam conexões MCP pessoais de outro membro. Rotinas usam conexões e orçamento do proprietário. Após uma transferência de propriedade, as rotinas do antigo proprietário no projeto são pausadas; o novo proprietário cria as rotinas que devem continuar. Uma execução anterior não pode continuar usando as credenciais do antigo proprietário. O Numo é executado no servidor: não lê arquivos do seu computador nem usa suas sessões pessoais.

![Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.](/documentation/pt-BR/numo-permissions-and-approvals-workflow.svg)

## Entender os turnos persistentes do Numo {#numo-execution-model}

Mensagens interativas, ações contextuais e rotinas entram nas conversas do Numo. O modelo e raciocínio da conversa são escolhidos no campo de composição. O Numo age por meio de suas ferramentas do Minddy e das conexões MCP pessoais que você adicionou; ele não precisa de repositório. Uma rotina cria uma conversa nova com instruções salvas e contexto do proprietário e projeto. O desktop não precisa permanecer online.

![Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar sua resposta se necessário. Rever eventos e reconciliar escritas incertas.](/documentation/pt-BR/numo-execution-model-flow.svg)

### Separar execução e visualização {#state}

A intenção é registrada em um turno durável com UUID e mensagem. O turno passa de `queued` para `running` e depois para `completed` ou `waiting_input`. `stopping` e `stopped` indicam interrupção; `retryable` e `failed` indicam erro. O fluxo SSE mostra a atividade, mas não controla a execução. Após reconectar, o cliente lê os eventos posteriores à sequência já recebida. Avisos duplicados ou atrasados não iniciam outro trabalho. Contexto não concede acesso: objetos privados continuam privados.

### Tratar alterações incertas {#mutations}

Antes de uma alteração, o sistema registra a operação e seu checkpoint; ele reutiliza resultados já concluídos. Uma leitura interrompida pode ser repetida, enquanto uma alteração com resultado incerto entra em `reconciling` sem nova tentativa automática. Confira o destino antes de gravar novamente. As rotinas respeitam propriedade, orçamento e proteções de custo; outro membro não herda a conexão MCP pessoal anterior.

Interromper o Numo encerra seu turno. Uma ação externa já enviada ainda pode terminar. Uma conversa que aguardava trabalho de código de uma versão anterior é interrompida automaticamente e volta ao estado inativo.

## Conectar um serviço MCP pessoal ao Numo {#numo-mcp-connections}

Nas configurações da conta, abra **IA e Numo** e use o cartão **MCP para o Numo**. Os links para a antiga aba MCP para o Numo levam até ali. Escolha um serviço ou adicione outro servidor MCP HTTPS público. Catálogo e registro não dispensam cadastro ou aprovação do provedor. O Numo pode preparar a conexão em conversa interativa, mas uma rotina autônoma não pode criá-la.

A conexão é feita em um assistente. Um servidor personalizado ou do registro pede primeiro o nome e o endereço HTTPS; um serviço do catálogo abre direto na etapa de login. Um serviço do catálogo, uma conexão salva ou uma entrada do registro que declara um token já conhece o método de login: a etapa o mostra, e **Usar outro método** permite trocá-lo. Caso contrário, escolha **Entrar com OAuth**, **Token Bearer** ou **Sem autenticação**. As **Configurações avançadas** reúnem o transporte (Streamable HTTP por padrão, SSE antigo também é compatível) e os cabeçalhos criptografados. Coloque segredos em credenciais ou cabeçalhos, nunca na URL. Comandos locais e redes privadas não são suportados. Para um app OAuth existente, registre a URL de retorno exibida e informe ID e segredo. Depois de salvar, a última etapa aguarda o login, testa a conexão e mostra quantas ferramentas o Numo encontrou. No desktop OAuth abre o navegador do sistema e retorna ao app.

![Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.](/documentation/pt-BR/numo-mcp-connections-workflow.png)

### Testar e gerenciar {#manage}

O menu permite testar, editar, reconectar, desativar ou remover. Um aviso laranja de autenticação exige reconexão. Campos vazios preservam credenciais; mudar a URL apaga credenciais e cabeçalhos. Remova o token bearer pelo controle específico; `{}` apaga cabeçalhos.

Desativar bloqueia chamadas novas, não enviadas. Limites: 30 segundos, 1 MiB de transporte e 64 KB de resultado. Confira gravações com tempo esgotado no destino antes de repetir. Rotinas usam conexões do proprietário; outros membros não podem usá-las emprestadas.

![Assistente de conexão do Notion mostrando o método de login conhecido pelo catálogo.](/documentation/pt-BR/numo-mcp-connections-config-workflow.png)

## Retomar trabalho do Numo interrompido ou pendente {#recover-numo-work}

Volte à conversa existente e leia as últimas mensagens e os cartões. Diferencie perguntas aguardando resposta, limite da conta, teto da rotina e falha técnica. Fechar o painel não comprova que o trabalho parou.

Em um cartão ativo, responda todas as perguntas obrigatórias e envie o conjunto. Cartões anteriores são registros e não aceitam outra resposta. Pular não fornece os dados ausentes nem autoriza alterações dependentes.

### Orçamento e falhas {#recovery}

O cartão de limite da conta mostra a data de redefinição do limite, quando conhecida, e pode oferecer plano ou chave pessoal. O da rotina leva à gestão: confira o teto por execução. Várias conversas podem rodar ao mesmo tempo; elas compartilham o orçamento da conta. Repetir o pedido não elimina o limite.

Só é possível retomar de um checkpoint se ele tiver sido preservado. Confira alterações nos tickets, páginas e serviços externos antes de repetir: uma gravação pode ter funcionado mesmo com a resposta perdida. Informe o que falta e peça para continuar. Sem checkpoint recuperável, forneça o estado verificado em um novo pedido. Ao relatar falhas persistentes, identifique a conversa sem incluir credenciais.

## Escolher um objetivo para um feedback {#feedback-objectives}

Os objetivos de feedbacks exigem uma escolha explícita. Peça ao Numo para vincular uma solicitação a um objetivo do projeto ou remover esse vínculo; o Numo resolve a solicitação e o objetivo antes de alterá-los. Uma revisão ou categorização geral não autoriza atribuir objetivos. Uma integração pode fornecer o objetivo escolhido pelo proprietário. A conversão herda objetivo e categorias; sem uma escolha, o objetivo fica vazio.
