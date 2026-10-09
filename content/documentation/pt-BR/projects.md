---
{
  "id": "projects",
  "locale": "pt-BR",
  "title": "Projetos e membros",
  "summary": "Configure um projeto, convide colaboradores e gerencie os membros com as permissões necessárias.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configurar um projeto",
    "Convidar pessoas para um projeto"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-general.png",
      "alt": "Configurações gerais do projeto com nome, chave, ícone e ação separada para a lixeira.",
      "caption": "Confira o nome e a chave antes de salvar. Mover o projeto para a lixeira é uma ação separada.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-members.png",
      "alt": "Convite por email e três membros de demonstração, com o proprietário identificado.",
      "caption": "Convide pelo email da conta e identifique o proprietário antes de remover o acesso de um membro.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Um projeto reúne problemas, objetivos, páginas e membros. O proprietário gerencia as configurações administrativas e os convites; os membros trabalham no conteúdo e podem sair do projeto.

## Configurar um projeto {#project-settings}

Abra o projeto e depois suas configurações. A propriedade do projeto determina o acesso às configurações administrativas. Os membros podem consultar a seção geral e sair do projeto, mas não recebem os controles de edição do proprietário.

Como proprietário, informe um nome não vazio e uma chave de projeto válida, depois salve. A chave é normalizada para maiúsculas e usa de 2 a 5 letras ASCII. Revise os identificadores resultantes depois de alterá-la. Use os controles de ícone e aparência para distinguir o projeto na navegação; essas escolhas visuais não mudam a participação no projeto.

As outras seções gerenciam colaboradores, problemas recorrentes, Git, importação, integrações, automação e feedback. Siga o guia correspondente antes de habilitar um provedor ou trabalho automático. As preferências da conta, como o idioma da interface, são separadas da configuração do projeto.


![Configurações gerais do projeto com nome, chave, ícone e ação separada para a lixeira.](/documentation/pt-BR/project-general.png)

### Sair e excluir {#project-removal}

Um membro pode usar a ação de sair para remover seu próprio acesso. Peça ao proprietário um novo convite se precisar do projeto mais tarde. Sair não exclui o projeto para todos.

A exclusão do projeto é uma ação do proprietário na zona de perigo. Leia as consequências e a confirmação antes de usá-la, especialmente se o projeto contiver problemas, páginas, arquivos ou integrações. Se um salvamento normal falhar, preserve os valores desejados, leia o erro e atualize o projeto antes de tentar novamente. Evite repetir uma ação destrutiva enquanto o primeiro resultado for incerto.

## Convidar pessoas para um projeto {#project-members}

O proprietário do projeto gerencia a participação nas configurações de membros. Peça à pessoa colaboradora o e-mail que ela usa nesta instância, envie o convite e confira seu estado pendente. O mesmo e-mail em outra instância não concede acesso aqui.

A pessoa convidada entra com essa conta e abre a caixa de entrada. Aceite o convite pendente para participar ou recuse se não esperava esse projeto. O diálogo inicial de entrada ajuda a compartilhar seu e-mail com o proprietário; ele não permite entrar em projetos sem convite.


![Convite por email e três membros de demonstração, com o proprietário identificado.](/documentation/pt-BR/project-members.png)

### Responsabilidades do proprietário e dos membros {#member-permissions}

| Pessoa | Acesso habitual ao projeto |
| --- | --- |
| Membro | Trabalhar com problemas, páginas e espaços de colaboração do projeto; gerenciar as próprias preferências da conta. |
| Proprietário | As atividades dos membros, mais configurações do projeto, convites e configurações de integração ou automação exclusivas do proprietário. |
| Visitante de link público | Somente o conteúdo publicado explicitamente pelo link; sem participação no projeto. |

Revise a lista de membros antes de remover alguém. A linha do proprietário não oferece uma ação de remoção, e esses controles não transferem a propriedade do projeto. O proprietário pode cancelar um convite pendente antes da aceitação; o estado pendente não revela se aquele endereço já tem uma conta. A remoção encerra o acesso como membro; ela não recupera exportações, capturas de tela ou cópias já recebidas. As credenciais pessoais de Git, IA e MCP continuam pertencendo à conta e não são transferidas apenas porque a propriedade do projeto mudou.

### Resolver a falta de acesso {#invitation-recovery}

Se um convite não aparecer, compare o e-mail convidado com a conta conectada e verifique a URL da instância. Peça ao proprietário que confira os convites pendentes em vez de criar contas repetidamente. Se as permissões mudarem durante uma sessão aberta, recarregue o destino e confira a participação antes de repetir uma gravação. Não compartilhe a sessão de outra pessoa para contornar um erro de acesso.
