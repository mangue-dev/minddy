---
{
  "id": "project-members",
  "locale": "pt-BR",
  "title": "Convidar pessoas para um projeto",
  "summary": "Use o e-mail da conta desejada, aceite convites e gerencie o acesso ao projeto.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
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
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-members.png",
      "alt": "Convite por email e três membros de demonstração, com o proprietário identificado.",
      "caption": "Convide pelo email da conta e identifique o proprietário antes de remover o acesso de um membro.",
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
    "project-members-steps"
  ]
}
---

## Enviar e aceitar um convite {#project-members}

O proprietário do projeto gerencia a participação nas configurações de membros. Peça à pessoa colaboradora o e-mail que ela usa nesta instância, envie o convite e confira seu estado pendente. O mesmo e-mail em outra instância não concede acesso aqui.

A pessoa convidada entra com essa conta e abre a caixa de entrada. Aceite o convite pendente para participar ou recuse se não esperava esse projeto. O diálogo inicial de entrada ajuda a compartilhar seu e-mail com o proprietário; ele não permite entrar em projetos sem convite.


![Convite por email e três membros de demonstração, com o proprietário identificado.](/documentation/pt-BR/project-members.png)

## Responsabilidades do proprietário e dos membros {#member-permissions}

| Pessoa | Acesso habitual ao projeto |
| --- | --- |
| Membro | Trabalhar com problemas, páginas e espaços de colaboração do projeto; gerenciar as próprias preferências da conta. |
| Proprietário | Os percursos de membro mais configurações do projeto, convites e configurações de integração ou automação exclusivas do proprietário. |
| Visitante de link público | Somente o conteúdo publicado explicitamente pelo link; sem participação no projeto. |

Revise a lista de membros antes de remover alguém. A linha do proprietário não oferece uma ação de remoção, e esses controles não transferem a propriedade do projeto. O proprietário pode cancelar um convite pendente antes da aceitação; o estado pendente não revela se aquele endereço já tem uma conta. A remoção encerra o acesso como membro; ela não recupera exportações, capturas de tela ou cópias já recebidas. As credenciais pessoais de Git, IA e MCP continuam pertencendo à conta e não são transferidas apenas porque a propriedade do projeto mudou.

## Resolver a falta de acesso {#invitation-recovery}

Se um convite não aparecer, compare o e-mail convidado com a conta conectada e verifique a URL da instância. Peça ao proprietário que confira os convites pendentes em vez de criar contas repetidamente. Se as permissões mudarem durante uma sessão aberta, recarregue o destino e confira a participação antes de repetir uma gravação. Não compartilhe a sessão de outra pessoa para contornar um erro de acesso.
