---
{
  "id": "views-and-filters",
  "locale": "pt-BR",
  "title": "Salvar uma visualização do seu trabalho",
  "summary": "Filtre e ordene problemas sem mudar suas propriedades armazenadas.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-view-filters.png",
      "alt": "Filtros manuais de uma visualização e menu de ordenação.",
      "caption": "Filtre pelas propriedades dos tickets ou escolha uma ordem. O campo de IA é opcional para esses controles manuais.",
      "revision": 1,
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
    "views-and-filters-steps"
  ]
}
---

## Criar e salvar a visualização {#views-and-filters}

Comece em um quadro de projeto ou uma superfície pessoal de problemas entre projetos. Use filtros, ordenação e controles de exibição para escolher o trabalho necessário. Confira o escopo antes de salvar: uma visualização pessoal e uma de projeto não representam o mesmo limite de acesso.

Filtre por propriedades disponíveis, como estado, responsável, prioridade, categorias ou objetivo. Ordene o resultado para deixar clara a próxima ação. No kanban, os problemas continuam agrupados por estado; mudar uma visualização não altera estado nem atribuição.

Salve a visualização com um nome que descreva seu propósito, selecione-a novamente na navegação e verifique os filtros. Edite ou remova a visualização salva quando o propósito mudar. Compartilhá-la é uma operação de publicação separada com regras próprias de permissão e revogação.

![Filtros manuais de uma visualização e menu de ordenação.](/documentation/pt-BR/work-view-filters.png)

## Resolver resultados vazios ou inesperados {#view-recovery}

Confira todos os filtros, o projeto ativo e sua participação quando problemas esperados não aparecerem. Limpe filtros restritivos antes de supor que dados foram excluídos. Após uma edição, um problema pode legitimamente sair de uma visualização filtrada. Pesquise seu identificador ou use um quadro de projeto sem filtros para inspecionar os valores salvos.

Uma visualização salva não é uma cópia de seus problemas. Excluir a visualização remove sua configuração, enquanto excluir problemas selecionados muda o trabalho subjacente do projeto.
