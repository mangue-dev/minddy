---
{
  "id": "database-cells-and-entries",
  "locale": "pt-BR",
  "title": "Editar valores e páginas de entradas de banco de dados",
  "summary": "Salve células, selecione linhas e expanda uma entrada preservando edições pendentes.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
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
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-entry.png",
      "alt": "Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.",
      "caption": "Abra um registro para ler o texto completo e editar os valores conforme o tipo.",
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
    "database-cells-and-entries-steps"
  ]
}
---

## Editar um valor {#database-cells-and-entries}

Clique em uma célula da tabela ou na propriedade acima do corpo de uma entrada. Enter salva, Escape cancela e Shift+Enter insere uma linha de texto. Sair do editor salva. Um número inválido mantém o editor aberto até ser corrigido; uma falha de salvamento reverte o valor e mostra um erro.

Use uma célula de Seleção para uma opção ou Seleção múltipla para várias. Pesquise opções existentes ou crie uma nova pelo menu. Abra “Editar opções” para mudar nomes ou cores, depois salve em conjunto ou cancele. Data, Pessoas e Caixa de seleção usam seus controles correspondentes; Data de criação continua somente leitura.

## Abrir, selecionar e inserir entradas {#entry-actions}

Abra uma entrada para editar sua página completa em um painel flutuante. “Expandir” abre como página completa depois que os salvamentos pendentes do documento terminarem. Se o salvamento falhar, o painel permanece aberto para resolver. Uma entrada vazia fica no banco até ser excluída.

Use caixas de seleção de linhas para selecionar e Shift-clique para um intervalo. A alça abre ações e pode reordenar entradas em ordem manual. O + na margem insere abaixo de uma entrada; Option/Alt insere acima. A inserção adjacente volta à ordem manual e limpa filtros para deixar a nova entrada visível.

## Preferências de exibição {#database-display}

Pesquise, filtre, ordene e oculte colunas na única visualização de lista. Essas preferências ficam salvas no seu dispositivo; a ordem manual é compartilhada com a árvore de páginas. Role horizontalmente com gesto de trackpad, Shift e roda do mouse, toque ou barra inferior. Uma prévia de texto cortada não encurta o valor armazenado. Entradas com valores de colunas podem ser reordenadas dentro do banco, mas não movidas para fora.


![Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.](/documentation/pt-BR/database-entry.png)
