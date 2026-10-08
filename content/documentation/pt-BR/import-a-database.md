---
{
  "id": "import-a-database",
  "locale": "pt-BR",
  "title": "Importar um banco de dados com o conteúdo das entradas",
  "summary": "Confira o mapeamento do esquema e a quantidade de páginas antes de carregar um banco vazio.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-import-review.png",
      "alt": "Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.",
      "caption": "Confira os registros analisados e o número de colunas antes de importar para o banco vazio.",
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
    "import-a-database-steps"
  ]
}
---

## Escolher a importação {#import-a-database}

Crie um banco de dados sem colunas opcionais nem entradas existentes. No banner do novo banco, escolha Importar um banco existente. Envie um ZIP do Notion no formato Markdown & CSV com subpáginas, um CSV de banco de dados ou um arquivo de banco de dados do Minddy. Se o arquivo contiver vários bancos, selecione aquele que deseja importar.

Antes de confirmar, confira os nomes e tipos de coluna sugeridos e depois a quantidade de páginas. Quando a assistência à importação está configurada, o Numo pode sugerir tipos com base em uma amostra pequena; o mapeamento manual continua disponível. Propriedades de origem sem suporte são mantidas como texto. Valores incompatíveis bloqueiam a importação em vez de serem apagados sem aviso.

## O que é preservado e o que precisa ser conferido {#database-import-result}

A importação inclui o conteúdo das entradas, os documentos aninhados e os arquivos locais presentes no arquivo enviado. Um arquivo do Minddy também preserva o esquema exato e as cores das opções e remapeia os links internos para páginas e arquivos. Pessoas podem ser associadas a membros do projeto de destino. Uma exportação do Notion não contém o esquema original, as cores das opções nem as definições das fórmulas; essas informações ausentes não podem ser recuperadas.

Os arquivos podem ter no máximo 20 MB compactados, 50 MB descompactados e 1.000 páginas. Cada anexo mantém o limite de 10 MB dos arquivos de página. A gravação no banco de dados é transacional. Repetir a mesma tentativa no diálogo aberto mantém seu identificador de solicitação; assim, uma tentativa já concluída é retornada sem duplicar linhas. Carregar outro arquivo ou reabrir um novo diálogo pode criar uma tentativa diferente. Após um resultado de rede incerto, confira o destino antes de recomeçar; um banco já preenchido deixa de cumprir o requisito de destino vazio.

Após a conclusão, confira algumas entradas, valores, páginas aninhadas e anexos. Mantenha o arquivo original até terminar essa verificação. Se a importação falhar, leia o primeiro erro e corrija o formato ou o mapeamento antes de tentar novamente. Não preencha o banco de destino manualmente supondo que ele continuará atendendo ao requisito de estar vazio.


![Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.](/documentation/pt-BR/database-import-review.png)
