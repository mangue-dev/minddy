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
  "revision": 40,
  "sourceRevision": 40,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/numo-watches.ts",
      "lib/server/numo/watch-proposal.ts",
      "components/assistant/watch-proposal-card.tsx",
      "lib/server/numo/watch-prompt.ts",
      "lib/server/assistant/context-compaction.ts",
      "lib/server/assistant/conversation-config.ts",
      "components/assistant/conversation-settings.tsx",
      "components/settings/account-numo-section.tsx",
      "components/assistant/numo-intro.tsx",
      "lib/numo-cited-mentions.ts"
    ]
  },
  "review": {
    "revision": 40,
    "fact": "agent:claude-code (MIN-982: personal reminders paragraph of #reminders, source audit against lib/server/numo/watches.ts, watch-clock.ts, watch-prompt.ts, lib/server/numo-notes.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-969: the composer's `@` menu listing what Numo mentioned in the conversation or in its Home summary under Mentioned by Numo, newest first and at most eight, and offering every non-hidden project's pages with the open project's first, checked against lib/numo-cited-mentions.ts, lib/numo-cited-mentions.test.ts, components/assistant/assistant-shell.tsx, app/(app)/home/page.tsx, lib/use-numo-mentionables.ts and lib/use-numo-mentionables.test.tsx; rest of the article unchanged since the previous review; no figure recaptured, no figure shows the `@` menu); agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-946: AI budget warning sentence of #home-word, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-953: recurring reminders section and the last paragraph of #reminders, source audit against lib/numo-watches.ts, lib/server/numo/watches.ts, watch-clock.ts, watch-proposal.ts, lib/server/assistant/proactive-guard.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: step 2 of #work-with-numo, the default-model paragraph, the compaction paragraph of #continue and the model sentence of #numo-execution-model, source audit against lib/server/assistant/conversation-config.ts, lib/server/assistant/context-compaction.ts, components/assistant/conversation-settings.tsx and messages/*.json; no browser walkthrough; no figure shows the model control or the compaction step; existing figures kept, not recaptured); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-955: the paragraph on what Numo can change in #numo-permissions-and-approvals, source audit against lib/server/assistant/settings-coverage.ts, lib/server/account-settings.ts and the update_member_role tool; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-956: search in earlier conversations paragraph and memory switch sentence of #memory, source audit against lib/server/numo/conversation-search.ts, lib/server/numo/turns.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-907 Numo introduction: the message shown on Home and in an empty Numo panel when there is no summary, checked against components/assistant/numo-intro.tsx, app/(app)/home/page.tsx, components/assistant-panel.tsx, components/assistant/assistant-shell.tsx and messages/*.json; no browser walkthrough; no figure shows Home without a summary; existing figures kept, not recaptured)",
    "language": "agent:claude-code (pt-BR MIN-982 passage translated from en revision 40 with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-969 passage translated from en revision 39 with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-923 passage with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-930 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-953 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-955 passage translated from en; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 Numo introduction paragraph, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 40,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 40,
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
      "revision": 40,
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
      "revision": 40,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 40,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

1. Confira o contexto na área de mensagem. Identifique o ticket quando houver vários itens relevantes. Para adicionar um ticket como contexto, digite `@` na área de mensagem ou use **Adicionar contexto**, que agrupa o contexto nas mesmas seções do menu `@`, os tickets em **Tickets** e seus servidores MCP conectados em **Servidores MCP**; uma descrição também lista tickets encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**.
2. No minddy Cloud, o Numo usa o modelo e o nível de raciocínio escolhidos pela administração da sua instância, como o Smart Fill e o Smart Assign, e o campo de composição não mostra nenhum controle de modelo. Com uma chave pessoal para o Numo, o logotipo do provedor, ao lado do microfone, escolhe o provedor, o modelo e o nível de raciocínio da conversa; ao passar o cursor, você vê o modelo atual. Se o modelo não oferece controle de raciocínio, o controle deslizante fica em **Sem raciocínio**; em um modelo que sempre raciocina, **Sem raciocínio** usa o nível mais leve. O mesmo logotipo leva a conversa de volta ao **minddy Cloud**.
3. Envie um pedido delimitado, por exemplo: “Leia este ticket e proponha critérios de aceitação. Não altere o status”.
4. Leia a resposta e abra os links de tickets ou fontes. Para uma alteração, confira o objeto atualizado. Tickets, objetivos, projetos, páginas e membros que o Numo encontrou aparecem na resposta como menções em formato de pílula: cada uma abre o item correspondente, e uma que você não pode ver aparece como **Indisponível**. O Numo também escreve essas menções no que redige, como descrições e planos de tickets, descrições de objetivos, comentários, páginas e o caderno, só para os itens que identificou; um membro mencionado ali é notificado como em qualquer menção. Ao digitar `@` na área de mensagem, o que o Numo mencionou nesta conversa ou no seu [resumo na **Página inicial**](#home-word) aparece primeiro em **Mencionado pelo Numo**, a partir da última mensagem dele, até oito itens. O menu também oferece as páginas de todos os seus projetos, exceto os ocultos: em um projeto, as páginas dele vêm primeiro, e as outras mostram o nome do projeto.

Em uma conversa nova e vazia, quatro linhas de sugestões acima do campo de mensagem propõem pedidos adequados à página atual, por exemplo **Resumir este ticket** ou **Escrever um plano de implementação** quando um ticket está aberto no painel lateral. Escolher uma linha preenche o campo sem enviá-lo, para que você possa ajustar o pedido antes. As linhas somem assim que o campo tem texto e voltam quando você o esvazia. Elas aparecem no layout de desktop, não em um celular. O campo de mensagem na parte de baixo da **Página inicial** mostra as mesmas linhas, com sugestões como **Escolher meu foco de hoje** ou **Encontrar o que está atrasado**. A **Página inicial** é ela mesma uma conversa com o Numo, igual ao painel sem o cabeçalho: cada visita abre uma nova, a menos que uma resposta ainda esteja em andamento, e ela é separada da que está aberta no painel; a anterior fica no histórico, e o botão **Nova conversa** no canto superior direito começa outra. Depois que o Numo escreve o resumo dele, as linhas da **Página inicial** são as sugestões escritas junto com ele ([o resumo do Numo na Página inicial](#home-word)).

Na **Página inicial**, e no painel do Numo quando ele está ampliado ou com o foco, você pode começar a digitar sem clicar no campo de mensagem: uma sequência rápida de teclas digitada fora de um campo de texto vai para o campo de mensagem, que recebe o foco. Uma tecla sozinha continua executando seu atalho de teclado, por exemplo C para criar um ticket, cerca de 0,2 segundo depois nessas telas. G seguido de uma tecla continua sendo uma sequência de navegação; uma terceira tecla na sequência transforma tudo em texto.

Para perguntar ao Numo sobre um trecho, selecione-o em um editor, como uma página ou a descrição de um ticket, e escolha **Pergunte ao Numo** na barra de ferramentas de seleção, no computador. O painel abre sem enviar nada: ao lado da página ou do ticket de onde veio, o trecho aparece como uma pílula de contexto com suas primeiras palavras, e ao passar o cursor sobre a pílula você vê o trecho inteiro. Digite sua pergunta, por exemplo “Reescreva isto de forma mais concisa” ou “Crie tickets a partir disto”, e envie. O trecho acompanha só essa mensagem. Para deixá-lo de fora, remova a pílula com o X.

O Numo também pode ver as imagens da descrição de um ticket ou objetivo, de um plano, de um comentário, de uma página ou do seu caderno quando o modelo da conversa aceita imagens. Sem essa capacidade, o Numo informa que não conseguiu ver a imagem em vez de descrevê-la.

O Numo também pode escrever um arquivo para baixar: um relatório ou um documento em PDF, uma exportação em CSV, ou um arquivo de texto, Markdown, HTML, JSON, XML, SVG ou de calendário. Peça na sua solicitação; o Numo pode montá-lo a partir dos arquivos que você adicionou à conversa. O arquivo aparece como um cartão abaixo da resposta: selecionar o cartão abre a visualização quando o formato permite, **Baixar** salva o arquivo, e o menu ao lado oferece **Prévia** e **Copiar o conteúdo**. O arquivo fica no armazenamento privado da sua conversa; para compartilhá-lo com o projeto, peça ao Numo para anexá-lo a um ticket, a um objetivo ou a um comentário que ele publicar lá. Um PDF usa as fontes padrão: caracteres fora dos alfabetos da Europa Ocidental e emojis não aparecem.

Se você colar no campo de mensagem um texto com mais de 12.000 caracteres, como logs, ele é anexado à sua mensagem como **Texto colado** em vez de preencher o campo de mensagem. O Numo lê o arquivo inteiro antes de se basear nele, então um CSV feito a partir dos seus logs inclui todas as linhas. Uma mensagem longa que chega ao Numo por outro caminho é anexada do mesmo jeito: a mensagem mantém as primeiras linhas e cita o arquivo.

Quando você pede um acompanhamento, ou uma lista de itens que compartilham campos, como candidaturas com empresa, status e data, o Numo cria um [banco de dados](/docs/databases) com essas colunas e as primeiras entradas em vez de uma página.

Com uma chave pessoal, o modelo padrão do Numo vem de **Configurações da conta → IA → Numo → Conversas**, salvo para esse provedor: o padrão do app ou um modelo que você escolher. A escolha própria de uma conversa tem prioridade. No minddy Cloud não há modelo a escolher. Consulte [configurações de IA e uso](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.](/documentation/pt-BR/work-with-numo-workflow.png)

### Continuar uma conversa {#continue}

A lista mantém as conversas anteriores acessíveis. Continue a conversa com as decisões necessárias. O Numo organiza e acompanha o trabalho: lê e atualiza tickets, planos, páginas e outros conteúdos do minddy e pode ler os pull requests vinculados. Quando você pede, ele também pode comentar um pull request, resolver as conversas de revisão já atendidas e mesclá-lo. Quando o Numo busca tickets, correspondências de texto e identificadores exatos vêm primeiro; uma busca descritiva pode acrescentar tickets do mesmo projeto encontrados pelo sentido, que o Numo deve conferir antes de se basear neles. Ele não escreve código nem faz push de commits. Para que o código seja escrito, copie o prompt do ticket para seu próprio agente de código; consulte [Trabalho de código e pull requests](/docs/code-work#external-coding-agents).

Quando uma conversa fica longa demais para ser reenviada a baixo custo, cerca de 90.000 tokens ou três quartos do que o modelo consegue ler, se for menos, o Numo a compacta antes da chamada seguinte: a resposta mostra **Compactando o contexto…** e depois **Contexto compactado**. O Numo resume as mensagens e os resultados de ferramentas mais antigos e mantém palavra por palavra a sua última mensagem e as trocas mais recentes; as respostas seguintes partem desse resumo. O resumo conta no uso de IA como o resto da resposta. Se falhar, a etapa indica **Não foi possível compactar o contexto** e o Numo responde com a conversa inteira.

Se o Numo pedir informações, envie sua escolha antes de esperar a continuação das ações dependentes. Um cartão de consumo ou erro explica a interrupção. Confira qualquer gravação externa antes de pedir para repetir a ação.

## Entender as permissões do Numo {#numo-permissions-and-approvals}

O Numo age dentro do acesso e do papel do usuário atual. Um pedido no chat não dá a membros acesso a configurações exclusivas do proprietário. O Numo de um leitor, no chat ou por `@Numo` em um comentário que ele tem permissão para publicar, usa apenas ferramentas de leitura e é cobrado do leitor. O proprietário gerencia membros, integrações, repositório e configurações de feedback. As preferências pessoais pertencem à conta atual.

O Numo pode alterar as preferências da sua conta, ocultar ou voltar a mostrar projetos para você e, quando um projeto é seu, as configurações, os membros e as funções deles. Algumas ações continuam sendo suas: as chaves de provedores e os modelos de IA, as conexões Git, o login, a autenticação de dois fatores e os apps conectados, o avatar e o ícone do projeto, a transferência de propriedade, a exportação de dados e a exclusão da conta.

### Autorizar a ação {#authorization}

Descreva a alteração e seu alcance. Ler uma solicitação não autoriza respondê-la publicamente: o Numo só envia respostas públicas a feedback quando solicitado explicitamente. Instruções ou resultados de um MCP remoto não autorizam ações adicionais. Conecte apenas serviços aos quais confia as informações e ações previstas.

Uma solicitação pode chegar a um provedor externo. Desativar a conexão impede novas chamadas, mas não desfaz as enviadas. Confira uma gravação que excedeu o tempo no destino antes de repeti-la.

### Contexto pessoal e agendado {#context}

Conversas não usam conexões MCP pessoais de outro membro. Rotinas usam conexões e orçamento do proprietário. Após uma transferência de propriedade, as rotinas do antigo proprietário no projeto são pausadas; o novo proprietário cria as rotinas que devem continuar. Uma execução anterior não pode continuar usando as credenciais do antigo proprietário. O Numo é executado no servidor: não lê arquivos do seu computador nem usa suas sessões pessoais.

O Numo pode deixar uma mensagem na sua caixa de entrada, com um alerta push, quando uma rotina encontra algo que precisa da sua atenção ou quando você pede um aviso para depois. A mensagem vai só para a conta para a qual o Numo trabalha, que em uma rotina é o proprietário dela. O interruptor Mensagens do Numo nas [preferências de notificação](/docs/notifications-and-inbox#notification-preferences) desativa essas mensagens.

![Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.](/documentation/pt-BR/numo-permissions-and-approvals-workflow.svg)

### Memória do Numo {#memory}

O Numo guarda lembranças curtas sobre você para que você não precise se repetir: uma preferência como "escreva os títulos dos meus tickets em inglês", um fato como "o projeto Mobile está pausado até janeiro" ou uma instrução permanente. Ele salva uma quando você pede ("lembre que…") ou quando você expressa uma preferência que claramente quer ver aplicada da próxima vez, e avisa na resposta. A partir daí, suas lembranças valem em todas as conversas.

Uma lembrança vale para todos os seus projetos ou para um só; quando não sabe qual, o Numo pergunta. Uma lembrança de projeto é usada nas conversas desse projeto e quando o Numo trabalha nesse projeto a partir de outra conversa. Suas lembranças são só suas: os outros membros não as veem e o Numo deles não as usa. Rotinas e `@Numo` em um comentário leem suas lembranças, mas não podem alterá-las. Você pode guardar até 100 lembranças de 1.000 caracteres cada; no limite, o Numo pergunta qual substituir.

O Numo também pode pesquisar nas suas conversas anteriores com ele. Quando você se refere a algo já dito que não está na conversa atual nem nas suas lembranças ("como decidimos na semana passada", "encontre a conversa sobre preços"), ele pesquisa no que você escreveu e no que ele respondeu, lê a conversa que corresponde e diz a qual se refere. Ele pesquisa só nas suas próprias conversas, incluindo as arquivadas: as 100 com atividade mais recente, ou as de um período que você indicar. O que as ferramentas dele retornaram não é pesquisado. Rotinas, `@Numo` em um comentário e o Numo em segundo plano não pesquisam nas suas conversas, e as conversas deles não são pesquisadas.

**Configurações da conta → Numo → Lembranças** lista cada lembrança com o projeto ao qual se aplica. **Editar** altera o texto, **Excluir** a remove e **Esquecer tudo** remove todas; uma exclusão não pode ser desfeita. Você também pode pedir ao Numo para esquecer algo. **Memória do Numo**, no cartão **Numo** acima, desativa a memória: o Numo deixa de ler e salvar lembranças e não pesquisa nas suas conversas anteriores; as lembranças salvas são mantidas.

### Diário do Numo {#journal}

O Numo mantém um diário do que espera por você e do que ele fez por você enquanto você não estava olhando: "a PR #12 espera sua revisão há 3 dias", "fiz a pesquisa na web pedida em MIN-42". Ele escreve uma entrada quando você pede para acompanhar algo ("anota que estou esperando a resposta do cliente") e, em uma rotina ou em um comentário `@Numo`, quando altera seu conteúdo. Ele fecha a entrada quando o assunto se resolve. A conversa mostra então **Anotado no diário** ou **Entrada do diário fechada**. O diário é só seu, não envia notificação, e as entradas fechadas são excluídas em até 180 dias. A **Página inicial** resume o diário ([o resumo do Numo na Página inicial](#home-word)); para ver cada entrada, pergunte ao Numo em uma conversa, ou peça para fechar uma.

### O resumo do Numo na Página inicial {#home-word}

Quando a **Página inicial** abre a conversa nova, o Numo escreve primeiro, abaixo da saudação: poucas frases que resumem o diário dele, com primeiro o que espera por você, depois o que ele fez que afeta seu conteúdo, depois o que ele se oferece para fazer sozinho. Os itens que ele cita, como um ticket ou uma página, abrem com um clique. Quando o Numo preparou algo para você, como um resumo dos seus projetos ou uma pesquisa, o resumo traz o essencial e os números em vez de mandar você para uma conversa. O Numo reescreve o resumo em segundo plano depois de cada turno que escreve ou fecha uma entrada do diário, então ele já está atualizado quando você abre a **Página inicial**, e abrir a página não chama a IA. Se uma entrada que ele cobre for resolvida nesse meio-tempo, a **Página inicial** esconde o resumo até o Numo escrever o próximo. Mostrar o resumo marca como vistas as entradas que ele cobre: um resumo seguinte deixa de fora o que foi resolvido e só volta a citar o que ainda espera por você. Quando seu orçamento de IA está a caminho de acabar antes da renovação, o resumo começa por isso: o dia em que ele acaba no ritmo atual e a parte já consumida, em porcentagem. Quando não há nada aberto nem não visto no diário e o orçamento vai durar, não há resumo.

Quando não há resumo, o Numo se apresenta no lugar dele, abaixo da saudação: uma mensagem curta que cita você e o primeiro projeto em que você pode criar tickets e diz o que o Numo pode fazer nele. Sem um projeto assim, ela diz o que o Numo fará assim que você tiver um. Um painel do Numo vazio abre com a mesma apresentação. O minddy a escreve sem chamar a IA e nunca a salva: ela some quando você envia a primeira mensagem, e o resumo a substitui assim que o Numo escreve um.

Assim que você escreve, a saudação e o resumo ficam no topo da conversa que você começa abaixo deles na **Página inicial**, o resumo como primeira mensagem do Numo; sem resumo, a conversa começa com a sua mensagem. Ele é salvo como a primeira mensagem do Numo nessa conversa: o Numo lê o resumo ao responder, como continuação do que disse, e o painel e o histórico também o mostram. Acima do campo de mensagem, até quatro sugestões escritas com o resumo substituem as linhas de sempre, ou nenhuma quando nada específico se encaixa. Elas também servem como respostas rápidas, por exemplo **Sim, faça isso sozinho daqui em diante**, e cada uma é um pedido completo. Escolher uma preenche o campo sem enviar. Com o Numo em segundo plano desligado, a **Página inicial** abre com a saudação, a apresentação do Numo e as linhas de sempre, sem resumo. Em uma instância sem IA não há conversa: a **Página inicial** mostra a saudação e os avisos da sua conta, como convites pendentes ou o app para desktop.

### Numo em segundo plano {#background}

**Configurações da conta → Numo → Numo em segundo plano** vem ativado por padrão: o Numo trabalha para você enquanto você está fora. Quando algo nos seus projetos tem a ver com você, como um ticket atribuído a você, uma menção ou uma rotina com falha, ou corresponde ao que uma das suas lembranças pede para ele acompanhar, o Numo acorda alguns minutos depois e age com as mesmas ferramentas e o mesmo modelo de uma conversa. Com a lembrança "para cada novo ticket de MIN que precisar de pesquisa na web, faça a pesquisa e publique o resultado como comentário", ele pesquisa cada novo ticket, publica o comentário e anota no diário dele, onde escreve o que fez e o que espera por você. A **Página inicial** resume o que ele anotou. O interruptor precisa da memória do Numo: enquanto a memória estiver desativada, o Numo em segundo plano também fica, e volta junto com ela.

Em um projeto compartilhado, o Numo só altera o que é seu: os tickets atribuídos a você ou criados por você, os objetivos que você lidera, as páginas que você criou. Criar conteúdo ali, ou alterar qualquer outra coisa, precisa de uma lembrança que peça isso. Em todos os projetos, inclusive nos que você trabalha sozinho, ele não manda nada para a lixeira nem restaura nada, não age em nenhum pull request, não chama ferramentas MCP externas, não administra o projeto (configurações, membros, integrações), não altera as configurações da sua conta e não responde publicamente a feedbacks, a menos que uma das suas lembranças permita essa ação. O servidor verifica se a lembrança existe, é sua e vale para o projeto afetado pela ação. O Numo só deixa uma mensagem na sua caixa de entrada quando uma lembrança pede, ou por algo urgente, e nesse caso no máximo duas vezes em 24 horas.

Se você é administrador da instância e está com a autenticação de dois fatores ativada, o Numo em segundo plano também pode [administrar a instância](/docs/instance-administration#numo). Ele lê por conta própria a configuração de modelos de IA e os custos de IA, então você pode dar a ele uma lembrança como "acompanhe os modelos de IA configurados na instância e me avise quando um mais barato der conta". Alterar ou importar a configuração de modelos, procurar uma conta ou mudar o plano dela precisa de uma lembrança que permita essa ação; sem ela, o Numo pergunta no diário dele e a **Página inicial** mostra a pergunta. Sua conta é verificada antes de cada uma dessas ações: assim que perde o papel de administrador ou a autenticação de dois fatores, o Numo também os perde.

Quando uma ação precisa de uma permissão que ele não tem, o Numo pede no diário dele e se oferece para fazer sozinho da próxima vez. Para permitir, diga ao Numo em uma conversa, por exemplo "sim, faça sempre": ele salva uma lembrança e a usa na próxima vez que acordar. Para limitar o Numo, dê a ele uma lembrança como "no projeto Design, só anote no diário", edite ou exclua a lembrança que permitia uma ação, ou desative o interruptor: uma execução que ainda não começou é cancelada, e uma que já começou vai até o fim. A triagem dos seus eventos, cada vez que ele acorda e o resumo do Numo na **Página inicial** contam no seu uso de IA, e um administrador define quantas vezes cada membro pode acordá-lo em 24 horas, 20 por padrão. Cada execução acontece em uma conversa própria, que não aparece na sua lista de conversas e é excluída depois de 30 dias.

### Lembretes do Numo {#reminders}

Peça ao Numo em uma conversa para pensar em algo por você mais tarde: "quando o MIN-42 estiver concluído, me lembre de avisar o cliente", "quando o objetivo 0.40 estiver concluído, crie o ticket da versão" ou "me lembre na sexta às 9:00 de enviar a fatura". O Numo cria um lembrete sobre um ticket (um status, ou um comentário de outra pessoa), um objetivo (um status) ou uma data, e a conversa mostra **Lembrete criado**. Enquanto a condição não é atendida, nada é executado e nada conta no seu uso de IA: o minddy verifica a cada cinco minutos.

Quando a condição é atendida, o lembrete dispara uma única vez. Para algo que você mesmo vai fazer, você recebe uma mensagem do Numo na Caixa de entrada com a sua instrução. Para algo que você pediu ao Numo, a mensagem diz que o Numo está cuidando disso, e o Numo executa a instrução na conversa em que você criou o lembrete (em uma nova se essa conversa foi excluída ou está ocupada), com as ferramentas e permissões que você tem nesse momento; esse turno conta no seu uso de IA. Ninguém acompanha esse turno: o Numo não faz perguntas, não altera a memória dele e não manda nada para a lixeira, não faz merge nem administra nada; na resposta, ele diz o que deixou para você. Se o seu limite de uso foi atingido, ou se o turno falhar, você recebe uma mensagem e o Numo não age. Com **Mensagens do Numo** desativado, nenhuma mensagem chega. Quando o Numo alterou algo com um lembrete, por exemplo um ticket, uma página ou um comentário, ele anota no diário o que fez, e [o resumo do Numo na Página inicial](#home-word) conta para você. Um lembrete que só envia uma mensagem não aparece lá.

Um lembrete cuja condição nunca é atendida expira após 90 dias, e você pode ter 20 ao mesmo tempo. Enquanto o ticket ou objetivo dele está na lixeira, o lembrete espera; ele é cancelado quando o item é excluído de vez ou quando você perde o acesso ao projeto dele.

Um lembrete único dispara uma vez, para um ticket, um objetivo ou uma data; para algo que volta, crie um [lembrete recorrente](#recurring-reminders). Só você cria um lembrete, em uma conversa com o Numo: rotinas, menções `@Numo`, o Numo em segundo plano e a execução de um lembrete não podem criar, alterar nem cancelar nenhum. **Configurações da conta → Numo → Lembretes** lista os lembretes que você mantém, e **Cancelar lembrete** remove um. Para alterar um lembrete, peça ao Numo.

Um lembrete em uma data, único ou recorrente, não precisa de projeto: "todo dia às 9:00, veja na web se um show de X foi anunciado" não tem a ver com nenhum. O Numo então o executa sem projeto no contexto, e suas mensagens e entradas do diário não citam nenhum projeto. **Configurações da conta → Numo → Lembretes** o mostra como **Pessoal**. Um lembrete sobre um ticket ou um objetivo sempre pertence ao projeto desse item.

### Lembretes recorrentes {#recurring-reminders}

Um lembrete também pode voltar periodicamente: "toda noite às 19:00, revise meus tickets e prepare meu dia de amanhã", ou "toda segunda às 9:00, confira os custos dos modelos e me avise se saírem do controle". O Numo programa para todos os dias, de segunda a sexta, um dia por semana ou um dia por mês, em um horário do seu fuso, que ele mantém nas mudanças de horário. Um mês mais curto que o dia escolhido usa o último dia. Um lembrete recorrente não expira, e você pode ter 5 ativos entre os seus 20.

A cada execução, o Numo cumpre a instrução em uma nova conversa, com o nome do lembrete e o dia, com as ferramentas e permissões que você tem nesse momento; essa execução conta no seu uso de IA. Ninguém a acompanha: o Numo não faz perguntas, não altera a memória dele e respeita os limites do [Numo em segundo plano](#background): em um projeto compartilhado, ele só altera o que é seu, e não faz nenhuma ação sensível. As suas lembranças não removem esses limites aqui; só as permissões do próprio lembrete fazem isso. O Numo anota o resultado no diário dele, e [o resumo do Numo na Página inicial](#home-word) conta para você. Nenhuma mensagem anuncia cada execução.

Para que um lembrete recorrente possa fazer mais, peça ao criá-lo. Ele pode ser autorizado a notificar você mesmo sem urgência, alterar conteúdo que não é seu em um projeto compartilhado, agir em pull requests, chamar suas ferramentas MCP externas, responder publicamente a feedbacks, usar a lixeira, remover membros, convites e integrações, alterar as configurações da sua conta, ou administrar seus projetos e, para um administrador, a instância. Nesse caso o Numo não salva nada sozinho: a conversa mostra um cartão que lista o que o lembrete poderá fazer, e **Permitir e criar** salva. As suas permissões são verificadas de novo a cada execução: um lembrete autorizado a administrar a instância não recebe nenhuma ferramenta de administração quando a sua conta deixa de ser administradora, e um lembrete é cancelado quando você perde o acesso ao projeto dele. O Numo não pode adicionar uma permissão a um lembrete nem reescrever um que tem permissões: ele propõe uma substituição, que você confirma em um novo cartão.

Uma execução que o minddy perdeu por mais de seis horas é ignorada. Quando uma execução não termina, ou o seu limite de uso é atingido, você recebe uma mensagem. Depois de 3 execuções seguidas que não terminam, o lembrete é pausado e uma mensagem avisa você. **Configurações da conta → Numo → Lembretes** mostra, para cada lembrete recorrente, a periodicidade, a próxima execução, o que ele pode fazer e a última execução, com um link para essa conversa. **Pausar lembrete** o interrompe e **Retomar lembrete** o reativa na próxima execução.

Um lembrete recorrente é seu; uma rotina pertence a um projeto. Só você vê o seu lembrete e as conversas dele, ele é executado com as suas permissões e no seu uso de IA, e pode ter permissões próprias. Todos os membros do projeto veem uma rotina e as execuções dela, ela é executada no uso e nas conexões do proprietário do projeto, também pode começar com um evento, e nunca chega à administração da instância. Use um lembrete recorrente para os seus hábitos e uma rotina para o trabalho que a equipe compartilha.

## Entender os turnos persistentes do Numo {#numo-execution-model}

Mensagens interativas, ações contextuais e rotinas entram nas conversas do Numo. Com uma chave pessoal, o modelo e o raciocínio da conversa são escolhidos no campo de composição; no minddy Cloud, eles vêm da instância. O Numo age por meio de suas ferramentas do minddy e das conexões MCP pessoais que você adicionou; ele não precisa de repositório. Uma rotina cria uma conversa nova com instruções salvas e contexto do proprietário e projeto. O desktop não precisa permanecer online.

![Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar sua resposta se necessário. Rever eventos e reconciliar escritas incertas.](/documentation/pt-BR/numo-execution-model-flow.svg)

### Separar execução e visualização {#state}

A intenção é registrada em um turno durável com UUID e mensagem. O turno passa de `queued` para `running` e depois para `completed` ou `waiting_input`. `stopping` e `stopped` indicam interrupção; `retryable` e `failed` indicam erro. O fluxo SSE mostra a atividade, mas não controla a execução. Após reconectar, o cliente lê os eventos posteriores à sequência já recebida. Avisos duplicados ou atrasados não iniciam outro trabalho. Contexto não concede acesso: objetos privados continuam privados.

### Tratar alterações incertas {#mutations}

Antes de uma alteração, o sistema registra a operação e seu checkpoint; ele reutiliza resultados já concluídos. Uma leitura interrompida pode ser repetida, enquanto uma alteração com resultado incerto entra em `reconciling` sem nova tentativa automática. Confira o destino antes de gravar novamente. As rotinas respeitam propriedade, orçamento e proteções de custo; outro membro não herda a conexão MCP pessoal anterior.

Interromper o Numo encerra seu turno. Uma ação externa já enviada ainda pode terminar. Uma conversa que aguardava trabalho de código de uma versão anterior é interrompida automaticamente e volta ao estado inativo.

## Conectar um serviço MCP pessoal ao Numo {#numo-mcp-connections}

Nas configurações da conta, abra **MCP** e use o cartão **MCP para o Numo**. Os links para a antiga aba MCP para o Numo levam até ali. Escolha um serviço ou adicione outro servidor MCP HTTPS público. Catálogo e registro não dispensam cadastro ou aprovação do provedor. O Numo pode preparar a conexão em conversa interativa, mas uma rotina autônoma não pode criá-la.

A conexão é feita em um assistente. Um servidor personalizado ou do registro pede primeiro o nome e o endereço HTTPS; um serviço do catálogo abre direto na etapa de login. Um serviço do catálogo, uma conexão salva ou uma entrada do registro que declara um token já conhece o método de login: a etapa o mostra, e **Usar outro método** permite trocá-lo. Caso contrário, escolha **Entrar com OAuth**, **Token Bearer** ou **Sem autenticação**. As **Configurações avançadas** reúnem o transporte (Streamable HTTP por padrão, SSE antigo também é compatível) e os cabeçalhos criptografados. Coloque segredos em credenciais ou cabeçalhos, nunca na URL. Comandos locais e redes privadas não são suportados. Para um app OAuth existente, registre a URL de retorno exibida e informe ID e segredo. Depois de salvar, a última etapa aguarda o login, testa a conexão e mostra quantas ferramentas o Numo encontrou. No desktop, só a página de login do provedor abre no navegador do sistema: você não precisa estar conectado ao minddy nele, e o app conclui a conexão quando você volta.

![Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.](/documentation/pt-BR/numo-mcp-connections-workflow.png)

### Testar e gerenciar {#manage}

O menu permite testar, editar, reconectar, desativar ou remover. Um aviso laranja de autenticação exige reconexão. Campos vazios preservam credenciais; mudar a URL apaga credenciais e cabeçalhos. Remova o token bearer pelo controle específico; `{}` apaga cabeçalhos.

Desativar bloqueia chamadas novas, não enviadas. Limites: 30 segundos, 1 MiB de transporte e 64 KB de resultado. Confira gravações com tempo esgotado no destino antes de repetir. Rotinas usam conexões do proprietário; outros membros não podem usá-las emprestadas.

![Assistente de conexão do Notion mostrando o método de login conhecido pelo catálogo.](/documentation/pt-BR/numo-mcp-connections-config-workflow.png)

## Retomar trabalho do Numo interrompido ou pendente {#recover-numo-work}

Volte à conversa existente e leia as últimas mensagens e os cartões. Diferencie perguntas aguardando resposta, limite da conta, teto da rotina e falha técnica. Fechar o painel não comprova que o trabalho parou.

Se a conexão com o minddy cair antes de o Numo responder, por exemplo quando o app do celular vai para segundo plano, a conversa mostra um cartão de conexão. Quando você volta a ficar online ou volta ao app, o minddy verifica se sua mensagem chegou. Se chegou, o trabalho do Numo continua ou a resposta aparece. Se não, a mensagem sai da conversa e **Reenviar** a envia de novo. **Tentar novamente** verifica na hora.

Em um cartão ativo, responda todas as perguntas obrigatórias e envie o conjunto. Cartões anteriores são registros e não aceitam outra resposta. Pular não fornece os dados ausentes nem autoriza alterações dependentes.

### Orçamento e falhas {#recovery}

O cartão de limite da conta mostra a data de redefinição do limite, quando conhecida, e pode oferecer plano ou chave pessoal. O da rotina leva à gestão: confira o teto por execução. Várias conversas podem rodar ao mesmo tempo; elas compartilham o orçamento da conta. Repetir o pedido não elimina o limite.

Só é possível retomar de um checkpoint se ele tiver sido preservado. Confira alterações nos tickets, páginas e serviços externos antes de repetir: uma gravação pode ter funcionado mesmo com a resposta perdida. Informe o que falta e peça para continuar. Sem checkpoint recuperável, forneça o estado verificado em um novo pedido. Ao relatar falhas persistentes, identifique a conversa sem incluir credenciais.

## Escolher um objetivo para um feedback {#feedback-objectives}

Os objetivos de feedbacks exigem uma escolha explícita. Peça ao Numo para vincular uma solicitação a um objetivo do projeto ou remover esse vínculo; o Numo resolve a solicitação e o objetivo antes de alterá-los. Uma revisão ou categorização geral não autoriza atribuir objetivos. Uma integração pode fornecer o objetivo escolhido pelo proprietário. A conversão herda objetivo e categorias; sem uma escolha, o objetivo fica vazio.
