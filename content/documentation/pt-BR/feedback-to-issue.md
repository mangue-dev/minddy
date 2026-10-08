---
{
  "id": "feedback-to-issue",
  "locale": "pt-BR",
  "title": "Unir feedback e conectar à entrega",
  "summary": "Escolher solicitação canônica, vincular trabalho e conferir status público.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-to-issue-workflow.png",
      "alt": "Feedback vinculado a uma tarefa recém-criada, com status Planejado.",
      "caption": "A promoção deste exemplo criou uma tarefa vinculada com status A fazer. O status do feedback público mudou automaticamente para Planejado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Resolver duplicados {#feedback-to-issue}

Como membro do projeto, abra a solicitação e escolha uni-la a uma solicitação canônica existente no mesmo projeto. Leia as duas necessidades primeiro: uma redação parecida não comprova que ambas busquem o mesmo resultado. A solicitação atual vira a duplicata, os votos são unidos por identidade e a duplicata redireciona para a solicitação canônica. Confira o evento de união na atividade; a ação de desfazer usa esse evento. Rejeite uma sugestão incorreta da IA em vez de aceitá-la apenas para esvaziar a fila.


## Criar ou vincular trabalho {#work}

Transforme a solicitação em uma nova tarefa quando o trabalho ainda não estiver registrado. Confira os campos de criação antes de confirmar; sem campos fornecidos, a promoção cria por padrão trabalho no backlog. Se já existir uma tarefa, use a ação de vincular. Um feedback já vinculado não pode ser promovido novamente. Desvincular mantém o último status público e encerra a relação com a tarefa.

O status vinculado acompanha a tarefa: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Devolver o trabalho ao backlog também reabre o status do feedback. Depois de alterar um estado, confira a tarefa vinculada e a solicitação sem sessão.

As notificações à equipe por novo feedback dependem da origem e da transição de revisão. Não prometa ao votante um email automático a cada união ou atualização de tarefa; ele pode consultar o status público e as respostas em Meus comentários. O vínculo mostra o progresso sem expor a tarefa privada.

![Feedback vinculado a uma tarefa recém-criada, com status Planejado.](/documentation/pt-BR/feedback-to-issue-workflow.png)
