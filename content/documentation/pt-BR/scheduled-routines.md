---
{
  "id": "scheduled-routines",
  "locale": "pt-BR",
  "title": "Rotinas agendadas",
  "summary": "Configure contexto, fuso horário e limite de IA de uma rotina e confira suas execuções.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Agendar e acompanhar uma rotina do Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/scheduled-routines-workflow.png",
      "alt": "Editor de uma rotina de demonstração existente em pausa, com a instrução traduzida para exibição.",
      "caption": "Editor de uma rotina de demonstração existente em pausa, com a instrução traduzida para exibição. O calendário e o limite de gasto permanecem iguais; nada foi salvo ou executado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Criar o pedido agendado {#scheduled-routines}

Só o proprietário pode criar uma rotina do projeto. Abra as rotinas e inicie uma nova. Escolha um projeto seu, escreva a instrução e mencione tarefas, páginas ou objetivos relevantes. Selecione agenda e fuso horário; confira a prévia da primeira execução. Defina o teto por execução como porcentagem do orçamento mensal.

Cada execução cria uma conversa com instrução e contexto salvos. Usa orçamento de IA e conexões MCP pessoais do proprietário. O Numo delega trabalho do repositório somente quando necessário, com os padrões do worker da conta.

## Gerenciar as execuções {#runs}

Abra a rotina para editar instrução ou agenda, pausá-la ou consultar execuções. Execuções manuais também consomem orçamento. Leia resultado, perguntas, verificações e trabalho delegado na conversa correspondente. Uma solicitação de informação precisa de resposta; a agenda não a fornece.

Se o teto interromper a execução, confira resultados antes de aumentá-lo ou repetir. Após mudar o proprietário, inicie uma execução com o atual; as anteriores não usam conexões antigas.

![Editor de uma rotina de demonstração existente em pausa, com a instrução traduzida para exibição.](/documentation/pt-BR/scheduled-routines-workflow.png)
