---
{
  "id": "page-editor",
  "locale": "pt-BR",
  "title": "Escrever uma página com blocos e menções",
  "summary": "Use conteúdo estruturado, avisos e links, verificando se as edições foram salvas.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
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
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
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
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-editor.png",
      "alt": "Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.",
      "caption": "Os títulos, os blocos de tarefas e a menção AUR-2 organizam a página. O conteúdo é um exemplo de demonstração.",
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
    "page-editor-steps"
  ]
}
---

## Escrever o documento {#page-editor}

Abra a página e edite título ou corpo como membro do projeto. Use o menu de comandos de barra e os controles de formatação para inserir títulos, parágrafos, listas, tarefas, código, seções recolhíveis e avisos. Um aviso pode ter ícone emoji e cor da paleta; escolha-os para distinguir informação útil, não como a única forma de comunicar uma advertência.

Use menções para vincular problemas, objetivos, pessoas ou páginas relevantes. Referências inversas ajudam leitores a encontrar páginas que apontam para a atual. Um link fornece contexto, não acesso a um objeto privado de outro projeto.


![Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.](/documentation/pt-BR/page-editor.png)

## Salvamento e portabilidade {#editor-save}

Observe o indicador de salvamento antes de sair de uma edição importante. Se outra edição criar um conflito, use os controles de recuperação exibidos e preserve seu texto; não suponha que ambas foram mescladas. O histórico pode ajudar a inspecionar versões salvas anteriormente.

Exportações Markdown e leituras de páginas por agentes preservam ícones e cores dos avisos na representação compatível. Os formatos de exportação diferem na fidelidade e no tratamento de anexos, então confira o documento resultante antes de substituir uma fonte original. Use blocos de código para comandos literais e preserve os pré-requisitos e avisos no texto ao redor.
