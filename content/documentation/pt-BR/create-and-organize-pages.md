---
{
  "id": "create-and-organize-pages",
  "locale": "pt-BR",
  "title": "Criar uma wiki do projeto",
  "summary": "Crie páginas e subpáginas, organize a hierarquia e destaque favoritos compartilhados.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-create-menu.png",
      "alt": "Menu de criação com Nova página e Novo banco de dados.",
      "caption": "Use os controles de páginas do projeto para escolher um documento ou um banco de dados.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps"
  ]
}
---

## Criar e organizar páginas {#create-and-organize-pages}

Abra Páginas em um projeto do qual você participa. Use o menu + e escolha uma página para um documento ou um banco de dados para uma lista estruturada. Dê um título útil e escreva a especificação, decisão ou procedimento que a página precisa preservar.

Crie subpáginas para documentos relacionados e use os controles da árvore para mover ou reordenar. Uma página não pode se tornar descendente de si mesma. Duplicar uma página cria conteúdo novo, não uma referência atualizada ao original. Revise a ramificação duplicada antes de editar ou compartilhar.

## Favoritos e exclusão {#page-tree}

Marque uma página como favorita para destacá-la no topo da árvore do projeto. Esses favoritos são compartilhados no projeto, ao contrário de uma nota privada do caderno. Vincule uma página a uma tarefa quando o documento atual for contexto da tarefa; o título do recurso acompanha renomeações da página.

A exclusão envia para a lixeira as páginas que permitem recuperação. Confira a ramificação selecionada antes de excluir e use a recuperação em vez de recriar uma página perdida quando o conteúdo precisa ser mantido. Entradas com valores de banco de dados armazenados podem ser reordenadas dentro do banco, mas não movidas para fora. Se um movimento for rejeitado, inspecione hierarquia e tipo de entrada em vez de forçar por tentativas repetidas.


![Menu de criação com Nova página e Novo banco de dados.](/documentation/pt-BR/page-create-menu.png)
