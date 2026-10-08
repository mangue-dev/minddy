---
{
  "id": "issue-statuses",
  "locale": "pt-BR",
  "title": "Mover uma tarefa pelo ciclo de vida",
  "summary": "Use estados fixos para distinguir entrada, trabalho planejado, revisão e resultados finais.",
  "topic": "Projetos e tarefas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/core-tracker.md",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/issue-statuses.png",
      "alt": "Os oito estados do ticket no seletor, com Backlog selecionado.",
      "caption": "A marca indica o estado atual. Escolha o que representa a situação real do trabalho.",
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
    "issue-statuses-steps"
  ]
}
---

## Mudar um estado {#issue-statuses}

Abra o seletor de estado da tarefa ou use as ações de estado do quadro. Em uma visualização kanban, mover trabalho entre colunas altera a própria tarefa; mudar um filtro altera apenas o que você vê. Verifique o novo estado no painel de detalhes após a movimentação.

| Estado | Uso |
| --- | --- |
| Triagem | Trabalho recebido aguardando análise. |
| Backlog | Trabalho mantido, mas ainda não escolhido para começar. |
| A fazer | Trabalho escolhido para ser feito. |
| Em andamento | Trabalho em execução. |
| Em revisão | Implementação aguardando revisão. |
| Concluído | Resultado esperado concluído. |
| Cancelada | Trabalho encerrado sem entrega. |
| Duplicado | Trabalho representado por outra tarefa. |

Os estados são fixos e não são personalizados por projeto. Triagem e Duplicado estão disponíveis nos seletores, mas ficam deliberadamente fora das colunas kanban normais. A ausência de uma coluna não indica que o estado ou a tarefa não exista.


![Os oito estados do ticket no seletor, com Backlog selecionado.](/documentation/pt-BR/issue-statuses.png)

## Estados finais e verificação {#closed-work}

Concluído, Cancelada e Duplicado são estados finais para acompanhamento: deixam de bloquear tarefas dependentes e saem das contagens ativas. Encerrar como Cancelada não significa que a tarefa foi entregue. Ao marcar uma duplicata, identifique a tarefa mantida para dar um destino claro à discussão e ao progresso.

Confira os filtros se uma tarefa desaparecer depois de encerrada. Abra-a novamente pelo identificador para inspecionar o resultado e mudar o estado se a encerrou por engano. Para trabalho bloqueado, confira também a direção da dependência: mudar o estado de uma tarefa não reescreve sua descrição ou plano.
