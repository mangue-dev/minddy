---
{
  "id": "import-export-and-print-pages",
  "locale": "pt-BR",
  "title": "Importar, exportar ou imprimir uma página",
  "summary": "Escolha o formato de saída e confira o conteúdo, a hierarquia e os anexos.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-export.png",
      "alt": "Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.",
      "caption": "Escolha Markdown para baixar o documento ou Imprimir / PDF para abrir a visualização de impressão.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Escolher a operação do documento {#import-export-and-print-pages}

Abra o menu do documento da página e escolha Exportar. Selecione Markdown para uma página (.md) ou um ramo (.zip), PDF para abrir a visualização de impressão ou o arquivo de banco de dados quando a página for um banco de dados. Confira o escopo oferecido antes de confirmar: uma página, seu ramo e um arquivo de banco de dados contêm elementos diferentes.

Abra a exportação e confira os títulos, os blocos de aviso, os links e os anexos necessários para quem vai ler. A ação PDF abre uma visualização de impressão legível sem toda a navegação do aplicativo. Use os controles de impressão do navegador para imprimir ou salvar um PDF. O menu do documento não oferece uma ação de importação geral. As importações aceitas começam em um banco vazio, conforme a guia de importação de bancos de dados.


![Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.](/documentation/pt-BR/page-export.png)

## Arquivos de banco de dados e limites {#export-fidelity}

Um arquivo de banco de dados (.zip) inclui seu ramo: Markdown e CSV, o esquema exato e as cores das opções, valores, conteúdos, datas e horários, páginas aninhadas e os dados dos arquivos. Importe-o em um banco novo e vazio para restaurar essa estrutura. Os filtros, a ordenação e as preferências de colunas ocultas específicas do dispositivo permanecem no dispositivo original.

Uma exportação não transfere senhas, credenciais de provedores de conta nem assinaturas. Para mover o trabalho de uma conta entre instâncias, use o guia de transferência de dados da conta. Se um formato importado não conseguir preservar um bloco ou uma propriedade externa, confira o resultado antes de usá-lo como substituto. Não exclua o original só porque foi criado um arquivo para download.
