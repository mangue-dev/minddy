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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-search.png",
      "alt": "Resultados de busca do identificador de um ticket de demonstração.",
      "caption": "A paleta encontra o ticket pelo identificador junto às páginas do projeto; abrir um resultado preserva suas regras de acesso.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
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

Os ciclos pessoais e as visualizações entre projetos abrangem os projetos aos quais você tem acesso. Objetivos, wiki e feedback de um projeto pertencem a um único projeto. Confira o projeto ativo antes de criar trabalho ou alterar configurações.

![Navegação do projeto ao lado do quadro de tickets de demonstração.](/documentation/pt-BR/work-navigation.png)

### Painéis e navegação no celular {#panels}

Um problema abre em um painel de detalhes para manter o quadro disponível ao fundo. O Numo abre pelo botão flutuante em um painel de conversa compartilhado. A caixa de entrada abre como um painel popover da navegação com notificações e convites. Os antigos links para telas próprias da caixa de entrada e do Numo levam aos pontos de acesso atuais; eles não representam telas separadas atuais.

No celular, abra o menu lateral de navegação para escolher os mesmos destinos. Os painéis usam a largura disponível, então feche ou volte do painel atual para ver a lista novamente. Use os botões visíveis quando um atalho de teclado não estiver disponível.

### Abas do desktop {#tabs}

O aplicativo desktop acrescenta abas nativas e um seletor de servidor ao redor da aplicação. Uma aba é uma superfície de navegação, não uma conta diferente nem uma participação diferente em um projeto. Verifique a instância selecionada ao trocar de servidor. Consulte o guia do desktop para instalação, atalhos nativos e atualizações; as permissões de páginas e problemas continuam valendo.

## Encontrar trabalho e usar ações de teclado {#search-and-shortcuts}

Abra a paleta de comandos pelo controle de pesquisa da navegação. Pesquise um título distintivo ou um identificador de problema e escolha um resultado. Os resultados se limitam ao trabalho que sua conta pode acessar; saber um identificador não concede acesso a outro projeto.

Pressione Command+K no macOS ou Ctrl+K no Windows/Linux para abrir a paleta de comandos; Command/Ctrl+P é um atalho alternativo do aplicativo. Fora de texto editável, ? abre a ajuda de atalhos e C abre a criação de problemas. Em um cartão de problema sob o ponteiro ou nos controles de detalhe compatíveis, S abre o estado, P a prioridade, E o esforço, A o responsável, L as categorias, D o prazo e O o objetivo. Essas ações de uma tecla não interceptam a digitação em campos, áreas de texto ou editores de conteúdo. Sequências de navegação como G e depois H (Início) ou G e depois I (Caixa de entrada) usam duas teclas sucessivas. G e depois W leva a Páginas apenas no contexto de um projeto.

Use a ajuda de atalhos de teclado para consultar os comandos disponíveis na sua plataforma. O minddy distingue atalhos da aplicação, ações de propriedades de problemas e atalhos nativos de abas ou janelas do desktop. Confira onde está o foco antes de usar um comando: digitar em um editor e agir no problema ao redor são contextos diferentes.

![Resultados de busca do identificador de um ticket de demonstração.](/documentation/pt-BR/work-search.png)

### Usar um controle visível equivalente {#shortcut-alternatives}

Os campos dos problemas têm seletores de propriedades visíveis além das ações de teclado. Use os seletores no celular ou quando o navegador ou sistema operacional interceptar um atalho. Feche uma sobreposição ou devolva o foco à superfície desejada antes de tentar outra ação.

A pesquisa pode encontrar um problema ausente da visualização filtrada atual. Se um resultado não aparecer, confirme projeto, conta e instância e use uma consulta mais distintiva. Não crie uma duplicata apenas porque o quadro atual oculta a tarefa. A documentação pública tem sua própria pesquisa textual localizada, independente do Numo e da configuração de provedores.
