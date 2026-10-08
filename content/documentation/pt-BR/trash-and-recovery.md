---
{
  "id": "trash-and-recovery",
  "locale": "pt-BR",
  "title": "Restaurar trabalho excluído",
  "summary": "Encontre um objeto excluído, restaure suas dependências e diferencie a remoção permanente.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md"
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
    "privacy-and-account-deletion",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-trash.png",
      "alt": "Ticket de demonstração recuperável com trinta dias restantes na lixeira.",
      "caption": "As ações da linha permitem restaurá-lo. Esvaziar a lixeira é uma operação permanente separada.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Encontrar e restaurar um item {#trash-and-recovery}

Abra a lixeira pelo menu da conta. Ela contém trabalho excluído recuperável, incluindo problemas, objetivos, feedback, rotinas, projetos e páginas compatíveis. Confira tipo do item, momento da exclusão e retenção restante exibida antes de escolher restaurar.

Restaure primeiro o pai ou contêiner necessário quando o item depender dele. Por exemplo, restaure um banco de dados excluído antes de uma entrada excluída separadamente. Reabra o destino restaurado e inspecione conteúdo e propriedades. Itens excluídos permanecem recuperáveis por 30 dias antes de a retenção removê-los permanentemente. Somente o proprietário pode restaurar ou remover permanentemente um projeto ou uma rotina. Membros podem restaurar ou remover os outros objetos compatíveis do projeto enquanto mantiverem acesso.

![Ticket de demonstração recuperável com trinta dias restantes na lixeira.](/documentation/pt-BR/reader-trash.png)

## Exclusão permanente e recuperação com falha {#permanent-removal}

A remoção permanente e o esvaziamento da lixeira não podem ser desfeitos. Leia a confirmação e a quantidade de itens antes de continuar; esses controles não são formas comuns de ocultar trabalho terminado. Um item além da retenção disponível pode deixar de ser recuperável pela interface.

Se a restauração falhar, leia o erro e confira se o projeto ou pai existe e se você ainda tem acesso. Não remova permanentemente nem recrie objetos repetidamente para resolver um conflito de restauração. Exporte dados importantes antes de excluir a conta; a exclusão da conta tem consequências diferentes de colocar um objeto na lixeira recuperável.
