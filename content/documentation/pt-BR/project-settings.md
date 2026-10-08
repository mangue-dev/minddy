---
{
  "id": "project-settings",
  "locale": "pt-BR",
  "title": "Configurar um projeto",
  "summary": "Altere nome, chave e aparência como proprietário e entenda o acesso dos membros.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-general.png",
      "alt": "Configurações gerais do projeto com nome, chave, ícone e ação separada para a lixeira.",
      "caption": "Confira o nome e a chave antes de salvar. Mover o projeto para a lixeira é uma ação separada.",
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
    "project-settings-steps"
  ]
}
---

## Abrir as configurações do projeto {#project-settings}

Abra o projeto e depois suas configurações. A propriedade do projeto determina o acesso às configurações administrativas. Os membros podem consultar a seção geral e sair do projeto, mas não recebem os controles de edição do proprietário.

Como proprietário, informe um nome não vazio e uma chave de projeto válida, depois salve. A chave é normalizada para maiúsculas e usa de 2 a 5 letras ou dígitos. Revise os identificadores resultantes depois de alterá-la. Use os controles de ícone e aparência para distinguir o projeto na navegação; essas escolhas visuais não mudam a participação no projeto.

As outras seções gerenciam colaboradores, problemas recorrentes, Git, importação, integrações, automação e feedback. Siga o guia correspondente antes de habilitar um provedor ou trabalho automático. As preferências da conta, como o idioma da interface, são separadas da configuração do projeto.


![Configurações gerais do projeto com nome, chave, ícone e ação separada para a lixeira.](/documentation/pt-BR/project-general.png)

## Sair e excluir {#project-removal}

Um membro pode usar a ação de sair para remover seu próprio acesso. Peça ao proprietário um novo convite se precisar do projeto mais tarde. Sair não exclui o projeto para todos.

A exclusão do projeto é uma ação do proprietário na zona de perigo. Leia as consequências e a confirmação antes de usá-la, especialmente se o projeto contiver problemas, páginas, arquivos ou integrações. Se um salvamento normal falhar, preserve os valores desejados, leia o erro e atualize o projeto antes de tentar novamente. Evite repetir uma ação destrutiva enquanto o primeiro resultado for incerto.
