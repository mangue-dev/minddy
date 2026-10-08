---
{
  "id": "create-an-issue",
  "locale": "pt-BR",
  "title": "Criar e editar um problema",
  "summary": "Descreva uma tarefa executável, escolha o projeto e atualize propriedades sem duplicar trabalho.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/new-issue.png",
      "alt": "Rascunho não enviado com título, descrição e propriedades que podem ser escolhidas manualmente.",
      "caption": "Descreva o resultado esperado e escolha as propriedades úteis antes de criar o ticket.",
      "revision": 3,
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
    "create-an-issue-steps"
  ]
}
---

## Criar a tarefa {#create-an-issue}

Você precisa participar do projeto de destino. Abra o projeto e o controle para criar uma tarefa. Informe um título que identifique o trabalho, depois acrescente contexto, resultado esperado e restrições na descrição. Escolha o projeto deliberadamente ao criar em uma visualização pessoal ou entre projetos.

Para criar a tarefa manualmente, desative Preenchimento inteligente se o botão estiver visível e ativado. Isso mostra os controles de prioridade, esforço, categorias e objetivo para que você os defina. A escolha vale para essa tarefa; ao reabrir o formulário de criação, a preferência da conta é restaurada. Ela é independente dos controles de automação e Smart Assign do projeto.

Defina as propriedades úteis antes de confirmar: estado, prioridade, esforço, responsável, objetivo, categorias, prazo e recorrência. O responsável é um membro do projeto; um objetivo agrupa tarefas em torno de um resultado do projeto. Você pode deixar propriedades opcionais sem valor em vez de adivinhar. A prioridade vai de nenhuma a baixa, média, alta e urgente; o esforço usa XS, S, M, L e XL.

Confirme a criação e abra a nova tarefa. Confira seu identificador e projeto. Abra novamente os seletores de propriedades para mudar valores conforme a tarefa ficar mais clara. A descrição explica o trabalho; o plano de implementação é mantido separadamente na aba do plano.


![Rascunho não enviado com título, descrição e propriedades que podem ser escolhidas manualmente.](/documentation/pt-BR/new-issue.png)

## Verificar salvamento e visibilidade {#issue-save}

Depois de mudar uma propriedade, verifique o valor exibido. Os filtros podem remover uma tarefa da visualização atual imediatamente quando seu responsável, estado ou categoria mudar. Pesquise o identificador ou abra o projeto sem esses filtros antes de criar um substituto.

Se a criação ou o salvamento falhar, preserve o texto, leia o erro e confira se a participação e o destino ainda existem. Antes de repetir após uma falha de rede, verifique se a tarefa já foi criada. Vincule páginas do projeto como recursos atualizados quando precisar do conteúdo atual e use comentários para discutir a tarefa.
