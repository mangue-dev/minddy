---
{
  "id": "change-a-database-schema",
  "locale": "pt-BR",
  "title": "Alterar o esquema de um banco de dados com segurança",
  "summary": "Renomeie, reordene ou converta colunas e verifique possíveis perdas de valores.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
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
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-conversion-warning.png",
      "alt": "Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.",
      "caption": "Confira o número real de células incompatíveis antes de confirmar. Cancelar preserva os valores atuais.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Alterar a disposição ou as opções {#change-a-database-schema}

Em Colunas, use o controle com o ícone de olho para mostrar ou ocultar propriedades. Clique em um cabeçalho para renomeá-lo ou arraste os cabeçalhos para reorganizá-los. A coluna com o nome da entrada permanece na primeira posição. As opções de Seleção ou Seleção múltipla podem ser editadas pelo menu da célula ou em Colunas; os nomes e as cores são salvos juntos.

Ocultar uma coluna altera as preferências de exibição e preserva seus valores. Excluir uma coluna personalizada remove seus valores de todas as entradas, sem possibilidade de desfazer. Considere essa consequência antes de confirmar a exclusão.

## Converter o tipo de uma propriedade {#convert-column}

Escolha Editar coluna em uma propriedade personalizada e selecione o novo tipo. A janela converte os valores existentes ao salvar. Se alguns valores forem incompatíveis, o aviso informa quantas células serão esvaziadas. Continue somente se aceitar a perda desses valores, ou cancele para manter o tipo anterior e todos os valores.

A mudança para Data de criação usa a data de criação original de cada entrada e exibe um aviso antes de substituir os valores existentes. Após a conversão, confira entradas representativas, principalmente quando um número, uma seleção ou uma data puderem ser interpretados de outra forma.

As alterações de esquema feitas por um agente usam a revisão atual do banco e um token de prévia da conversão. Alterações simultâneas invalidam essa prévia. Leia o estado atual novamente e gere outra prévia em vez de forçar uma conversão desatualizada. Esvaziar valores incompatíveis exige confirmação explícita.


![Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.](/documentation/pt-BR/database-conversion-warning.png)
