---
{
  "id": "create-a-database",
  "locale": "pt-BR",
  "title": "Criar um banco de dados e suas colunas",
  "summary": "Comece com uma lista vazia, escolha os tipos de propriedades e adicione uma primeira entrada.",
  "topic": "Páginas e bancos de dados",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-property-types.png",
      "alt": "Seletor de tipo de coluna com texto, número, seleções, datas, pessoas e caixa de seleção.",
      "caption": "Escolha um tipo adequado aos valores que serão armazenados.",
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
    "create-a-database-steps"
  ]
}
---

## Criar a lista {#create-a-database}

Como membro do projeto, abra Páginas, use + e escolha um banco de dados. Um banco novo tem o nome das entradas e nenhuma coluna opcional. O aviso “Novo banco de dados” oferece configuração com Numo ou importação de um banco existente. A configuração manual continua disponível sem IA. Escolher a configuração com o Numo abre uma solicitação preparada com este banco de dados como contexto de página, depois que a criação termina. Confira e envie a solicitação para pedir a estrutura de que precisa; abrir a conversa não conclui a configuração. O trabalho real de IA exige um provedor configurado e uso disponível ou uma chave pessoal compatível. Examine o esquema e as entradas resultantes antes de confiar neles.

Abra “Colunas” e escolha “Adicionar coluna”, ou use a coluna + na borda direita da tabela. Dê um nome à coluna e escolha Texto, Número, Seleção, Seleção múltipla, Data de criação, Data, Pessoas ou Caixa de seleção. Use o seletor com pesquisa para encontrar o tipo. Salve, adicione uma entrada e confira se a coluna aparece na tabela e na página da entrada.

## Escolher tipos e respeitar limites {#database-types}

Um banco de dados aceita até 30 colunas de propriedades além do nome da entrada. Seleção permite uma opção; Seleção múltipla permite várias, com até 100 opções por coluna. Células de texto aceitam 2.000 caracteres. Número aceita decimais com sinal, ponto ou vírgula e rejeita letras. Data de criação é o horário original de criação da entrada e não pode ser editada.

Pessoas seleciona membros do projeto, não e-mails arbitrários de contas. Membros recém-mencionados podem receber notificações. Uma entrada de banco de dados também é uma página completa com conteúdo normal, comentários e anexos.

Fórmulas avançadas, automações e visualizações adicionais de banco de dados não estão disponíveis. Escolha uma propriedade de texto ou um documento vinculado quando os dados não couberem em um tipo compatível; não descreva uma fórmula não aceita como uma coluna funcional.


![Seletor de tipo de coluna com texto, número, seleções, datas, pessoas e caixa de seleção.](/documentation/pt-BR/database-property-types.png)
