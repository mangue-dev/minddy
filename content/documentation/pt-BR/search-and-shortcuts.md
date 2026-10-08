---
{
  "id": "search-and-shortcuts",
  "locale": "pt-BR",
  "title": "Encontrar trabalho e usar ações de teclado",
  "summary": "Pesquise trabalho acessível, consulte a ajuda de atalhos e mantenha o foco no objeto desejado.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "navigation",
    "views-and-filters",
    "desktop-app"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-search.png",
      "alt": "Resultados de busca do identificador de um ticket de demonstração.",
      "caption": "A paleta encontra o ticket pelo identificador junto às páginas do projeto; abrir um resultado preserva suas regras de acesso.",
      "revision": 2,
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
    "search-and-shortcuts-steps"
  ]
}
---

## Pesquisar um objeto {#search-and-shortcuts}

Abra a paleta de comandos pelo controle de pesquisa da navegação. Pesquise um título distintivo ou um identificador de problema e escolha um resultado. Os resultados se limitam ao trabalho que sua conta pode acessar; saber um identificador não concede acesso a outro projeto.

Pressione Command+K no macOS ou Ctrl+K no Windows/Linux para abrir a paleta de comandos; Command/Ctrl+P é um atalho alternativo do aplicativo. Fora de texto editável, ? abre a ajuda de atalhos e C abre a criação de problemas. Em um cartão de problema sob o ponteiro ou nos controles de detalhe compatíveis, S abre o estado, P a prioridade, E o esforço, A o responsável, L as categorias, D o prazo e O o objetivo. Essas ações de uma tecla não interceptam a digitação em campos, áreas de texto ou editores de conteúdo. Sequências de navegação como G e depois H (Início) ou G e depois I (Caixa de entrada) usam duas teclas sucessivas. G e depois W leva a Páginas apenas no contexto de um projeto.

Use a ajuda de atalhos de teclado para consultar os comandos disponíveis na sua plataforma. O Minddy distingue atalhos da aplicação, ações de propriedades de problemas e atalhos nativos de abas ou janelas do desktop. Confira onde está o foco antes de usar um comando: digitar em um editor e agir no problema ao redor são contextos diferentes.

![Resultados de busca do identificador de um ticket de demonstração.](/documentation/pt-BR/work-search.png)

## Usar um controle visível equivalente {#shortcut-alternatives}

Os campos dos problemas têm seletores de propriedades visíveis além das ações de teclado. Use os seletores no celular ou quando o navegador ou sistema operacional interceptar um atalho. Feche uma sobreposição ou devolva o foco à superfície desejada antes de tentar outra ação.

A pesquisa pode encontrar um problema ausente da visualização filtrada atual. Se um resultado não aparecer, confirme projeto, conta e instância e use uma consulta mais distintiva. Não crie uma duplicata apenas porque o quadro atual oculta a tarefa. A documentação pública tem sua própria pesquisa textual localizada, independente do Numo e da configuração de provedores.
