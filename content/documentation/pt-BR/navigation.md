---
{
  "id": "navigation",
  "locale": "pt-BR",
  "title": "Navegação e pesquisa",
  "summary": "Navegue pelo trabalho pessoal e pelos projetos, use abas e painéis e encontre itens acessíveis com a pesquisa e os atalhos de teclado.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-718 hybrid issue search; MIN-726 issue search order; MIN-733 always-on AI features; MIN-737 account settings reorganization",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "lib/use-hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; pt-BR translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-695 badge propagation: source and unit-test review of app-shell-chrome, app-sidebar, mobile-navigation, app-tab-strip and lib/app-tab-indicators; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Issue indexing card, the settings section catalog, the settings filter and the new-tab palette hand-off in lib/settings-sections.ts and lib/settings-section-focus.ts; unchanged evidence retained; no browser walkthrough, no new captures)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (pt-BR changed-passage parity and label review); agent:/root (pt-BR translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR MIN-695 badge paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Encontrar trabalho pessoal e alternar projetos",
    "Encontrar trabalho e usar ações de teclado"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-navigation.png",
      "alt": "Navegação do projeto ao lado do quadro de tickets de demonstração.",
      "caption": "A barra do projeto dá acesso aos tickets, objetivos, páginas e triagem.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-search.png",
      "alt": "Resultados de busca do identificador de um ticket de demonstração.",
      "caption": "A paleta encontra o ticket pelo identificador junto às páginas do projeto; abrir um resultado preserva suas regras de acesso.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

A navegação separa o trabalho pessoal do conteúdo de cada projeto. Pesquisa, painéis e atalhos ajudam você a encontrar os itens acessíveis; no celular, use os controles visíveis, e o app desktop acrescenta abas nativas.

## Encontrar trabalho pessoal e alternar projetos {#navigation}

A navegação principal dá acesso ao seu trabalho pessoal e aos seus projetos. Selecione um projeto para ver seus problemas e destinos secundários, como triagem, objetivos, páginas e configurações do projeto. A linha de retorno sobe um nível de navegação; ela pode mudar o conteúdo da barra lateral enquanto a página principal permanece aberta. Selecione um destino para navegar até ele.

Contadores e alertas acompanham você entre os níveis. O controle que volta para a **Página inicial** mostra o total para triagem nos projetos listados na **Página inicial**, incluindo o atual, e o alerta do Smart Assign quando um dos seus projetos não tem regras. Uma linha de retorno mostra o contador do nível para onde ela volta. Dentro de um projeto, **Triagem** e **Feedback** mantêm os contadores desse projeto. As abas do app para desktop exibem o mesmo selo da entrada correspondente na barra lateral: o alerta na **Página inicial** e os contadores em **Caixa de entrada**, **Revisão de código** e em **Triagem** e **Feedback** de um projeto, atualizados mesmo quando a aba está em segundo plano.

Os ciclos pessoais e as visualizações entre projetos abrangem os projetos aos quais você tem acesso. Objetivos, wiki e feedback de um projeto pertencem a um único projeto. Confira o projeto ativo antes de criar trabalho ou alterar configurações.

![Navegação do projeto ao lado do quadro de tickets de demonstração.](/documentation/pt-BR/work-navigation.png)

### Agir a partir de uma linha da barra lateral {#sidebar-menus}

Clique com o botão direito em uma linha da barra lateral para agir sobre o que ela representa sem abri-la primeiro. As linhas de link também oferecem **Abrir em uma nova aba** e **Copiar link**. Uma ação que move algo para a lixeira sempre aparece por último, depois de um separador.

- A linha **Todos os problemas** oferece **Novo problema**, e a linha **Rotinas** oferece **Nova rotina** quando você é proprietário de um projeto.
- Uma linha de projeto, ou o nome do projeto no topo do painel dele, oferece **Novo** (um problema, objetivo ou página nesse projeto) e **Configurações do projeto**. O proprietário do projeto também vê **Mover para a lixeira**, que pede a mesma confirmação das configurações do projeto. O mesmo menu também oferece **Ocultar projeto**, ou **Mostrar projeto** para um projeto que você ocultou; consulte [Ocultar um projeto para você](/docs/projects#hide-project).
- Uma aba de projeto oferece sua própria criação: **Novo problema** em Problemas, **Novo objetivo** em Objetivos, **Nova página** em Páginas e **Novo feedback** em Feedback, que abre o formulário interno de feedback.
- Uma linha de rotina oferece **Abrir a última execução** e, ao proprietário do projeto, **Executar agora**, **Pausar** ou **Reativar**, **Editar** e **Mover para a lixeira**. Veja [Gerenciar e verificar execuções](/pt-br/documentacao/scheduled-routines#runs).
- Uma linha de pull request oferece as mudanças que o estado atual permite, **Mesclar** quando ela está pronta e ações de correção quando algo a bloqueia. Veja [Revisão e merge](/pt-br/documentacao/code-work#decision).

A ação se aplica à linha em que você clicou, mesmo quando outro projeto ou item está aberto.

### Painéis e navegação no celular {#panels}

No celular, uma barra de carregamento na parte superior indica que a navegação está em andamento, inclusive enquanto os salvamentos pendentes da página são concluídos.

Um problema abre em um painel de detalhes para manter o quadro disponível ao fundo. O Numo abre pelo botão flutuante em um painel de conversa compartilhado. A caixa de entrada abre como um painel popover da navegação com notificações e convites. Os antigos links para telas da caixa de entrada e do Numo levam aos pontos de acesso atuais; essas telas separadas não existem mais.

No celular, abra o menu lateral de navegação para escolher os mesmos destinos. Os painéis usam a largura disponível, então feche ou volte do painel atual para ver a lista novamente. Use os botões visíveis quando um atalho de teclado não estiver disponível.

### Abas do desktop {#tabs}

O aplicativo desktop acrescenta abas nativas e um seletor de servidor ao redor da aplicação. Uma aba permite navegar na aplicação; ela não cria outra conta nem muda sua participação em um projeto. Verifique a instância selecionada ao trocar de servidor. Consulte o guia do desktop para instalação, atalhos nativos e atualizações; as permissões de páginas e problemas continuam valendo.

## Encontrar trabalho e usar ações de teclado {#search-and-shortcuts}

O comando Documentação abre o manual público no seu idioma atual.

Abra a paleta de comandos pelo controle de pesquisa da navegação. Pesquise um título distintivo ou um identificador de problema e escolha um resultado. Os resultados se limitam ao trabalho que sua conta pode acessar; saber um identificador não concede acesso a outro projeto.

Pressione Command+K no macOS ou Ctrl+K no Windows/Linux para abrir a paleta de comandos; Command/Ctrl+P é um atalho alternativo do aplicativo. Fora de texto editável, ? abre a ajuda de atalhos e C abre a criação de problemas. Em um cartão de problema sob o ponteiro ou nos controles de detalhe compatíveis, S abre o estado, P a prioridade, E o esforço, A o responsável, L as categorias, D o prazo e O o objetivo. Essas ações de uma tecla não interceptam a digitação em campos, áreas de texto ou editores de conteúdo. Sequências de navegação como G e depois H (Início) ou G e depois I (Caixa de entrada) usam duas teclas sucessivas. G e depois W leva a Páginas apenas no contexto de um projeto.

Para chegar a uma configuração, digite o nome dela na paleta de comandos ou no campo de filtro no topo da barra lateral das configurações. Os dois encontram cada cartão de configurações e as configurações individuais, como o idioma, o tema, cada paleta, a transparência e os dois interruptores de **Iniciar um ticket**. Escolher um resultado abre a aba de configurações certa, rola até o cartão ou a linha e o destaca. Command+T no macOS ou Ctrl+T no Windows/Linux abre a paleta de nova aba; uma configuração escolhida nela abre em uma nova aba do app. Palavras-chave em inglês e em francês funcionam qualquer que seja o idioma da interface.

Use a ajuda de atalhos de teclado para consultar os comandos disponíveis na sua plataforma. O minddy distingue atalhos da aplicação, ações de propriedades de problemas e atalhos nativos de abas ou janelas do desktop. Confira onde está o foco antes de usar um comando: digitar em um editor e agir no problema ao redor são contextos diferentes.

![Resultados de busca do identificador de um ticket de demonstração.](/documentation/pt-BR/work-search.png)

### Ordem dos problemas na busca {#issue-search-order}

Toda busca de problemas lista os problemas na mesma ordem: a paleta, as menções `@`, os seletores de relações, duplicados e pull requests, a janela **Link para um problema existente** dos feedbacks e a busca usada pelo Numo e pelos agentes MCP. Problemas **Em andamento** e **Em revisão** vêm primeiro, depois os de **Backlog** e **A fazer**. Problemas em **Triagem**, **Concluído**, **Cancelada** e **Duplicado** sempre vêm por último e continuam selecionáveis. Dentro de cada grupo, a melhor correspondência de texto vem primeiro. Um identificador digitado por inteiro, como `MIN-42`, coloca esse problema no topo, seja qual for o status.

### Buscar problemas pelo sentido {#search-by-meaning}

Quando uma busca descreve o trabalho em vez de nomeá-lo, a busca de problemas também encontra problemas de sentido próximo, mesmo que usem outras palavras. Por exemplo, “o login falha depois de redefinir a senha” pode encontrar um problema intitulado “Sessão perdida ao trocar a senha”. Isso vale para a paleta de comandos, as menções `@` em descrições, páginas, comentários e no compositor do Numo, os seletores de relação, **Marcar como duplicado…** na triagem, **Vincular um problema** em um pull request, o menu **Adicionar contexto** → **Problema** do Numo e **Link para um problema existente** no feedback.

Correspondências de texto e identificadores exatos sempre vêm primeiro e mantêm a ordem. Pouco depois que você para de digitar, no máximo cinco problemas encontrados pelo sentido são adicionados depois deles, em **Relacionados pelo sentido**. Um problema já listado não se repete, e a linha destacada não se move. Cada seletor mantém as próprias regras, então só aparecem problemas que ele já podia oferecer: um seletor de relação, por exemplo, continua oferecendo apenas problemas do mesmo projeto que ainda não estão vinculados. A paleta de comandos busca nos projetos que você pode ler, até os 25 atualizados mais recentemente; as ações de seleção em massa dela não usam a busca pelo sentido.

A busca pelo sentido tem estes limites:

- A busca precisa de pelo menos duas palavras, ou de uma palavra com pelo menos seis letras. Identificadores como `MIN-42`, `#42` ou `42`, e buscas muito curtas, usam apenas a busca por texto.
- Ela se apoia no índice que o Preenchimento inteligente monta a partir do título e da descrição dos problemas. Um problema ainda não indexado, ou cujo autor desligou [**Indexar tickets**](/docs/issues#smart-fill-preferences), só é encontrado pelas palavras. Problemas na lixeira nunca aparecem.
- Se você desligou **Indexar tickets** em **Configurações da conta** → **Smart Fill** → **Indexação de tickets**, suas buscas comparam apenas palavras. O mesmo acontece quando seu orçamento de IA acabou ou quando o provedor não responde em poucos segundos. Os resultados de texto permanecem e nenhum erro é exibido.
- Uma busca `@` cujo texto já corresponde a uma pessoa, um projeto ou uma página não é buscada pelo sentido. Em um projeto com mais de 3.000 problemas indexados, só os 3.000 indexados mais recentemente são comparados; os outros são encontrados pelas palavras.

Cada busca nova usa uma chamada de IA, contada na sua parcela **Automações** e exibida no histórico de uso como **Busca de problemas**. Uma busca repetida em cerca de 15 minutos normalmente não é cobrada de novo.

### Usar um controle visível equivalente {#shortcut-alternatives}

Os campos dos problemas têm seletores de propriedades visíveis além das ações de teclado. Use os seletores no celular ou quando o navegador ou sistema operacional interceptar um atalho. Feche uma sobreposição ou devolva o foco à superfície desejada antes de tentar outra ação.

A pesquisa pode encontrar um problema ausente da visualização filtrada atual. Se um resultado não aparecer, confirme projeto, conta e instância e use uma consulta mais distintiva. Não crie uma duplicata apenas porque o quadro atual oculta a tarefa. A documentação pública tem sua própria pesquisa textual localizada, independente do Numo e da configuração de provedores.
