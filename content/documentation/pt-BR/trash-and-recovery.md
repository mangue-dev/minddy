---
{
  "id": "trash-and-recovery",
  "locale": "pt-BR",
  "title": "Lixeira e recuperação",
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
  "revision": 7,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/productivity.md",
      "lib/server/trash.ts",
      "components/app-sidebar.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Restaurar trabalho excluído"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-trash.png",
      "alt": "Ticket de demonstração recuperável com trinta dias restantes na lixeira.",
      "caption": "As ações da linha permitem restaurá-lo. Esvaziar a lixeira é uma operação permanente separada.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Encontrar e restaurar um item {#trash-and-recovery}

Abra a lixeira pelo menu da conta. Ela contém trabalho excluído recuperável, incluindo tickets, objetivos, feedback, rotinas, projetos e páginas compatíveis. Confira tipo do item, momento da exclusão e retenção restante exibida antes de escolher restaurar.

Restaure primeiro o pai ou contêiner necessário quando o item depender dele. Por exemplo, restaure um banco de dados excluído antes de uma entrada excluída separadamente. Reabra o destino restaurado e inspecione conteúdo e propriedades. Itens excluídos permanecem recuperáveis por 30 dias antes de a retenção removê-los permanentemente. Somente o proprietário pode restaurar ou remover permanentemente um projeto ou uma rotina. O proprietário e os Membros podem restaurar ou remover os outros objetos compatíveis do projeto enquanto mantiverem acesso. Um Leitor não pode alterar um projeto, então os itens de um projeto que você apenas lê não aparecem na sua lixeira.

![Ticket de demonstração recuperável com trinta dias restantes na lixeira.](/documentation/pt-BR/reader-trash.png)

## Exclusão permanente e recuperação com falha {#permanent-removal}

A remoção permanente e o esvaziamento da lixeira não podem ser desfeitos. Leia a confirmação e a quantidade de itens antes de continuar; esses controles não são formas comuns de ocultar trabalho terminado. Um item além da retenção disponível pode deixar de ser recuperável pela interface.

Se a restauração falhar, leia o erro e confira se o projeto ou pai existe e se você ainda tem acesso. Não remova permanentemente nem recrie objetos repetidamente para resolver um conflito de restauração. Exporte dados importantes antes de excluir a conta; a exclusão da conta tem consequências diferentes de colocar um objeto na lixeira recuperável.
