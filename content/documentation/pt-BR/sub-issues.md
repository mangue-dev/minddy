---
{
  "id": "sub-issues",
  "locale": "pt-BR",
  "title": "Dividir um problema em subproblemas",
  "summary": "Acompanhe tarefas menores sob um problema pai e desvincule um filho sem excluí-lo.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-sub-issues.png",
      "alt": "Campo de criação de um subticket em um ticket pai de demonstração.",
      "caption": "O campo cria um filho deste ticket; cada filho mantém seu próprio status e discussão.",
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
    "sub-issues-steps"
  ]
}
---

## Construir a hierarquia {#sub-issues}

Abra o problema pai e use os controles de subproblemas para criar partes menores do trabalho. Dê a cada filho um resultado distinto. Depois da criação, confira projeto, propriedades e identificador do pai; uma hierarquia deve facilitar o acompanhamento, não substituir a descrição do que cada filho precisa alcançar.

A hierarquia permite um nível: o pai precisa ser um problema de nível superior no mesmo projeto, e um subproblema não pode ter filhos. Quando você não escolhe explicitamente um objetivo na criação, o filho herda o objetivo do pai. Confira as propriedades resultantes em vez de supor que alterações posteriores no pai serão propagadas.

Um filho continua sendo um problema com seu próprio estado e discussão. O indicador de progresso do pai é ponderado pelo esforço dos filhos e pela parcela de conclusão atribuída ao estado de cada um. O contador de concluídos/total na lista de subproblemas é uma contagem separada, sem ponderação. Leia os estados dos filhos junto com as duas medidas. Use uma dependência para dizer “precisa terminar antes” e um pai para dizer “faz parte desta tarefa maior”.

![Campo de criação de um subticket em um ticket pai de demonstração.](/documentation/pt-BR/work-sub-issues.png)

## Abrir ou remover a relação com o pai {#change-parent}

O identificador do pai ao lado do título do filho abre um menu. Use a ação de abrir o pai para inspecionar a tarefa maior. Para separar o filho, escolha desvinculá-lo do pai e leia a confirmação antes de aplicar. A desvinculação bem-sucedida remove a relação e mantém o problema.

Não exclua um filho apenas para reorganizar a hierarquia. Confira as relações existentes antes de mudar o pai e resolva uma relação rejeitada em vez de forçar uma hierarquia circular. Se o salvamento falhar, reabra o filho para ver se a mudança foi aplicada antes de tentar novamente. Preserve o trabalho concluído dos filhos ao revisar o plano geral.
