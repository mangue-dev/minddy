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
  "revision": 23,
  "sourceRevision": 22,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/use-hidden-projects.ts",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "components/objective-relations-section.tsx",
      "components/create-issue-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "lib/palette-workspace-groups.ts",
      "components/inbox-content.tsx",
      "lib/inbox-launcher.ts",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "components/mobile-navigation.tsx",
      "components/mobile-nav-actions.tsx",
      "lib/keyboard/typeahead.ts"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (pointer to the Numo type-ahead on Home and in the expanded Numo panel, checked against lib/keyboard/typeahead.ts and lib/keyboard/keyboard-context.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show this behavior)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
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
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-search.png",
      "alt": "Resultados de busca do identificador de um ticket de demonstração.",
      "caption": "A paleta encontra o ticket pelo identificador junto às páginas do projeto; abrir um resultado preserva suas regras de acesso.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        788,
        320
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

A navegação principal dá acesso ao seu trabalho pessoal e aos seus projetos. Selecione um projeto para ver seus tickets e destinos secundários, como triagem, objetivos, páginas e configurações do projeto. A linha de retorno sobe um nível de navegação; ela pode mudar o conteúdo da barra lateral enquanto a página principal permanece aberta. Selecione um destino para navegar até ele. Em uma lista como triagem, objetivos, feedback, revisão de código ou rotinas, o campo de filtro no topo da barra lateral busca em todos os itens, quaisquer que sejam os filtros que restringem a lista; o texto de exemplo dele indica o total.

Contadores e alertas acompanham você entre os níveis. O controle que volta para a **Página inicial** mostra o total para triagem nos projetos listados na **Página inicial**, incluindo o atual, e o alerta do Smart Assign quando um dos seus projetos não tem regras. Uma linha de retorno mostra o contador do nível para onde ela volta como selo sobre a seta, em âmbar enquanto o alerta do Smart Assign se aplica. Dentro de um projeto, **Triagem** e **Feedback** mantêm os contadores desse projeto. As abas do app para desktop exibem o mesmo selo da entrada correspondente na barra lateral: o alerta na **Página inicial** e os contadores em **Caixa de entrada**, **Revisão de código** e em **Triagem** e **Feedback** de um projeto, atualizados mesmo quando a aba está em segundo plano.

Os ciclos pessoais e as visualizações entre projetos abrangem os projetos aos quais você tem acesso. Objetivos, páginas e feedback de um projeto pertencem a um único projeto. Confira o projeto ativo antes de criar trabalho ou alterar configurações.

![Navegação do projeto ao lado do quadro de tickets de demonstração.](/documentation/pt-BR/work-navigation.png)

### Agir a partir de uma linha da barra lateral {#sidebar-menus}

Clique com o botão direito em uma linha da barra lateral para agir sobre o que ela representa sem abri-la primeiro. As linhas de link também oferecem **Abrir em uma nova aba** e **Copiar link**. Uma ação que move algo para a lixeira sempre aparece por último, depois de um separador.

- A linha **Todos os tickets** oferece **Novo ticket**, e a linha **Rotinas** oferece **Nova rotina** quando você é proprietário de um projeto.
- Uma linha de projeto, ou o nome do projeto no topo do painel dele, oferece **Novo** (um ticket, objetivo ou página nesse projeto) e **Configurações do projeto**. O proprietário do projeto também vê **Mover para a lixeira**, que pede a mesma confirmação das configurações do projeto. O mesmo menu também oferece **Ocultar projeto**, ou **Mostrar projeto** para um projeto que você ocultou; consulte [Ocultar um projeto para você](/docs/projects#hide-project).
- Uma aba de projeto oferece sua própria criação: **Novo ticket** em Tickets, **Novo objetivo** em Objetivos, **Nova página** em Páginas e **Novo feedback** em Feedback, que abre o formulário interno de feedback.
- Uma linha de triagem oferece **Aceitar**, **Recusar** e **Marcar como duplicado…**, que pedem a mesma confirmação ou o mesmo seletor do painel de triagem, depois a cópia do identificador e **Mover para a lixeira**. Um leitor só pode copiar o identificador. Veja [Analisar trabalho recebido na triagem](/docs/issues#triage-incoming-work).
- Uma linha de objetivo oferece **Status**, **Visualizar tickets** no quadro do projeto e **Mover para a lixeira**. Um leitor vê apenas **Visualizar tickets**.
- Uma linha de feedback oferece **Status**, a menos que um ticket vinculado o defina, **Link para um ticket existente**, **Mesclar em…** quando outra solicitação pode recebê-la, e **Mover para a lixeira**. Cada ação abre a solicitação e pede a mesma confirmação do painel dela.
- Uma linha de rotina oferece **Abrir a última execução** e, ao proprietário do projeto, **Executar agora**, **Pausar** ou **Retomar**, **Editar** e **Mover para a lixeira**. Veja [Gerenciar e verificar execuções](/pt-br/documentacao/scheduled-routines#runs).
- Uma linha de pull request oferece as mudanças que o estado atual permite, **Mesclar** quando ela está pronta e ações de correção quando algo a bloqueia. Veja [Revisão e mesclagem](/pt-br/documentacao/code-work#decision).

A ação se aplica à linha em que você clicou, mesmo quando outro projeto ou item está aberto.

### Painéis e navegação no celular {#panels}

Um ticket abre em um painel de detalhes para manter o quadro disponível ao fundo. Uma página aberta por uma menção ou um link abre da mesma forma, em um painel lateral com **Expandir** para chegar à página inteira. O Numo abre pelo botão flutuante em um painel de conversa compartilhado. A caixa de entrada abre como um painel popover da navegação com notificações e convites. Os antigos links para telas da caixa de entrada e do Numo levam aos pontos de acesso atuais; essas telas separadas não existem mais.

No celular, abra o menu lateral de navegação para escolher os mesmos destinos. A barra na parte inferior da tela reúne, da esquerda para a direita, o menu lateral de navegação, o Numo, a pesquisa, o caderno de tarefas e **Novo**; a **Página inicial** fica no menu lateral. Uma barra de carregamento na parte superior indica que a navegação está em andamento, inclusive enquanto os salvamentos pendentes da página são concluídos. Os painéis usam a largura disponível, então feche ou volte do painel atual para ver a lista novamente. Use os botões visíveis quando um atalho de teclado não estiver disponível.

### Abas do desktop {#tabs}

O aplicativo desktop acrescenta abas nativas e um seletor de servidor ao redor da aplicação. Uma aba permite navegar na aplicação; ela não cria outra conta nem muda sua participação em um projeto. Verifique a instância selecionada ao trocar de servidor. Consulte o guia do desktop para instalação, atalhos nativos e atualizações; as permissões de páginas e tickets continuam valendo.

## Encontrar trabalho e usar ações de teclado {#search-and-shortcuts}

Abra a paleta de comandos pelo controle de pesquisa da navegação. Pesquise um título distintivo ou um identificador de ticket e escolha um resultado. Os resultados se limitam ao trabalho que sua conta pode acessar; saber um identificador não concede acesso a outro projeto. O comando Documentação abre o manual público no seu idioma atual.

Assim que você digita, a paleta também encontra rotinas, pull requests, visualizações e notificações da **Caixa de entrada**; elas não aparecem na lista exibida antes da digitação. Rotinas e pull requests aparecem quando seu plano os inclui, e os pull requests abrangem os 100 atualizados mais recentemente nos seus repositórios vinculados. As visualizações abrangem **Todos os tickets** e o projeto em que você está. Escolher uma rotina, um pull request ou uma visualização o abre. Escolher uma notificação abre a **Caixa de entrada** na aba que a lista, **Não lidas** ou **Todas**, rola até ela e a destaca por um instante; ela continua não lida até você abri-la. Os projetos que você ocultou ficam fora desses resultados.

O que você vincula também é escolhido na paleta. Adicionar uma relação, vincular um ticket a um pull request ou um pull request a um ticket e anexar uma página como recurso a abrem apenas com os itens que você pode escolher, e o campo de busca diz o que você está escolhendo. Para uma relação, escolha primeiro o tipo no menu; a paleta lista depois os tickets e objetivos que podem recebê-la. Escolher um item o vincula; Esc fecha a paleta sem vincular nada.

Pressione Command+K no macOS ou Ctrl+K no Windows/Linux para abrir a paleta de comandos; Command/Ctrl+P é um atalho alternativo do aplicativo. Fora de texto editável, ? abre a ajuda de atalhos e C abre a criação de tickets. Em um cartão de ticket sob o ponteiro ou nos controles de detalhe compatíveis, S abre o estado, P a prioridade, E o esforço, A o responsável, L as categorias, D o prazo e O o objetivo. R adiciona uma relação nos mesmos lugares, na página de um objetivo e no formulário de novo ticket: escolha o tipo de relação e depois o outro ticket ou objetivo. Se o cartão fizer parte de uma seleção, essas teclas alteram todos os tickets selecionados; responsável, objetivo, categorias e relações só se aplicam aos tickets selecionados do projeto desse cartão. Shift+C leva a um campo de comentário pronto para digitar, com a conversa rolada até a mensagem mais recente: o de um cartão de ticket sob o ponteiro ou de uma linha sob o ponteiro na lista de objetivos, feedback, pull requests, páginas ou triagem, ou, sem nada sob o ponteiro, o do ticket, objetivo, feedback, pull request ou página na tela. Uma página abre para isso o painel **Atividade**. Shift+C age só nesse item, mesmo que o cartão faça parte de uma seleção. Na página de um objetivo e no formulário de novo objetivo, S abre o estado, A o responsável, D a data prevista e C a cor; ali, C não cria um ticket. Essas ações de uma tecla não interceptam a digitação em campos, áreas de texto ou editores de conteúdo. Sequências de navegação como G e depois H (Início) ou G e depois I (Caixa de entrada) usam duas teclas sucessivas. G e depois W leva a Páginas apenas no contexto de um projeto. Na **Página inicial** e no painel do Numo ampliado, uma sequência rápida de teclas vai para o campo de mensagem do Numo, e uma tecla sozinha executa seu atalho após uma breve pausa ([escrever para o Numo](/docs/numo#work-with-numo)).

Para chegar a uma configuração, digite o nome dela na paleta de comandos ou no campo de filtro no topo da barra lateral das configurações. Os dois encontram cada cartão de configurações e as configurações individuais, como o idioma, o tema, cada paleta, a transparência e os dois interruptores de **Iniciar um ticket**. Escolher um resultado abre a aba de configurações certa, rola até o cartão ou a linha e o destaca. Command+T no macOS ou Ctrl+T no Windows/Linux abre a paleta de nova aba; uma configuração escolhida nela abre em uma nova aba do app. Dentro de um projeto, ela também oferece **Nova página**, que cria uma página nesse projeto e a abre em uma nova aba. Palavras-chave em inglês e em francês funcionam qualquer que seja o idioma da interface.

Command+F no macOS ou Ctrl+F no Windows/Linux busca na página ou no caderno de tarefas na tela com a [barra de localizar e substituir](/pt-br/documentacao/pages#find-and-replace) do minddy. Em outras telas, e quando outra caixa de diálogo está aberta sobre a página, ele abre a busca do navegador.

Use a ajuda de atalhos de teclado para consultar os comandos disponíveis na sua plataforma. O minddy distingue atalhos da aplicação, ações de propriedades de tickets e atalhos nativos de abas ou janelas do desktop. Confira onde está o foco antes de usar um comando: digitar em um editor e agir no ticket ao redor são contextos diferentes.

![Resultados de busca do identificador de um ticket de demonstração.](/documentation/pt-BR/work-search.png)

### Ordem dos tickets na busca {#issue-search-order}

Toda busca de tickets lista os tickets na mesma ordem: a paleta, as menções `@`, os seletores de relações, duplicados e pull requests, a janela **Link para um ticket existente** dos feedbacks e a busca usada pelo Numo e pelos agentes MCP. Tickets **Em andamento** e **Em revisão** vêm primeiro, depois os de **Backlog** e **A fazer**. Tickets em **Triagem**, **Concluído**, **Cancelado** e **Duplicado** sempre vêm por último e continuam selecionáveis. Dentro de cada grupo, a melhor correspondência de texto vem primeiro. Um identificador digitado por inteiro, como `MIN-42`, coloca esse ticket no topo, seja qual for o status.

### Buscar tickets pelo sentido {#search-by-meaning}

Quando uma busca descreve o trabalho em vez de nomeá-lo, a busca de tickets também encontra tickets de sentido próximo, mesmo que usem outras palavras. Por exemplo, “o login falha depois de redefinir a senha” pode encontrar um ticket intitulado “Sessão perdida ao trocar a senha”. Isso vale para a paleta de comandos, as menções `@` em descrições, páginas, comentários e no compositor do Numo, os seletores de relação, **Marcar como duplicado…** na triagem, **Vincular um ticket** em um pull request, o menu **Adicionar contexto** → **Ticket** do Numo e **Link para um ticket existente** no feedback.

Correspondências de texto e identificadores exatos sempre vêm primeiro e mantêm a ordem. Pouco depois que você para de digitar, no máximo cinco tickets encontrados pelo sentido são adicionados depois deles, em **Relacionados pelo sentido**. Enquanto eles não chegam, uma linha **Buscando pelo sentido…** indica que a busca ainda está em andamento (na paleta de comandos, só quando nenhum resultado de texto corresponde). Se nenhum for encontrado, ela mostra **Nenhum ticket relacionado pelo sentido**; um menu `@` sem correspondência de texto fecha em vez disso. Um ticket já listado não se repete, e a linha destacada não se move. Cada seletor mantém as próprias regras, então só aparecem tickets que ele já podia oferecer: um seletor de relação, por exemplo, continua oferecendo apenas tickets do mesmo projeto que ainda não estão vinculados. A paleta de comandos busca nos projetos que você pode ler, até os 25 atualizados mais recentemente; as ações de seleção em massa dela não usam a busca pelo sentido.

A busca pelo sentido tem estes limites:

- A busca precisa de pelo menos duas palavras, ou de uma palavra com pelo menos seis letras. Identificadores como `MIN-42`, `#42` ou `42`, e buscas muito curtas, usam apenas a busca por texto.
- Ela se apoia no índice que o Preenchimento inteligente monta a partir do título e da descrição dos tickets. Um ticket ainda não indexado, ou cujo autor desligou [**Indexar tickets**](/docs/issues#smart-fill-preferences), só é encontrado pelas palavras. Tickets na lixeira nunca aparecem.
- Se você desligou **Indexar tickets** em **Configurações da conta** → **Smart Fill** → **Indexação de tickets**, suas buscas comparam apenas palavras. O mesmo acontece quando seu orçamento de IA acabou ou quando o provedor não responde em poucos segundos. Os resultados de texto permanecem e nenhum erro é exibido.
- Uma busca `@` cujo texto já corresponde a uma pessoa, um projeto ou uma página não é buscada pelo sentido. Em um projeto com mais de 3.000 tickets indexados, só os 3.000 indexados mais recentemente são comparados; os outros são encontrados pelas palavras.

Cada busca nova usa uma chamada de IA, contada na sua parcela **Automações** e exibida no histórico de uso como **Busca de tickets**. Uma busca repetida em cerca de 15 minutos normalmente não é cobrada de novo.

### Usar um controle visível equivalente {#shortcut-alternatives}

Os campos dos tickets têm seletores de propriedades visíveis além das ações de teclado. Use os seletores no celular ou quando o navegador ou sistema operacional interceptar um atalho. Feche uma sobreposição ou devolva o foco à superfície desejada antes de tentar outra ação.

A pesquisa pode encontrar um ticket ausente da visualização filtrada atual. Se um resultado não aparecer, confirme projeto, conta e instância e use uma consulta mais distintiva. Não crie uma duplicata apenas porque o quadro atual oculta o ticket. A documentação pública tem sua própria pesquisa textual localizada, independente do Numo e da configuração de provedores.
