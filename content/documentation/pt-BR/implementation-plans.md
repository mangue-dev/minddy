---
{
  "id": "implementation-plans",
  "locale": "pt-BR",
  "title": "Manter um plano de implementação",
  "summary": "Acompanhe etapas ordenadas separadamente da descrição de um problema sem perder o trabalho concluído.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-implementation-plan.png",
      "alt": "Plano de demonstração com duas tarefas de trabalho concluídas de seis.",
      "caption": "O plano salvo distingue etapas concluídas, ativas e pendentes. O progresso não comprova a execução da tarefa fictícia de código.",
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
    "implementation-plans-steps"
  ]
}
---

## Escrever o plano {#implementation-plans}

Abra a aba do plano do problema. A descrição já deve indicar o problema e o resultado esperado. Adicione etapas de implementação manualmente ou peça ao Numo que examine o repositório vinculado antes de propor um plano em nível de código. Um caminho ou uma função gerados por IA não são evidência se o repositório não foi realmente lido.

Recue cada linha de tarefa com dois espaços por nível de aninhamento; uma tabulação conta como quatro espaços. O aninhamento organiza as etapas do plano e não cria relações entre problemas pai e filho. Cada tarefa de trabalho não cancelada continua contando para o progresso, inclusive as aninhadas.

O plano usa linhas de tarefas Markdown: `- [ ]` para pendente, `- [~]` para em andamento, `- [x]` para concluída e `- [-]` para cancelada. Escreva o texto da tarefa após o marcador, por exemplo `- [ ] Verificar o link de contato no celular`. Tarefas canceladas ficam fora da contagem de conclusão. As tarefas sob um título Questions reconhecido são tratadas como perguntas e também ficam fora do progresso; mantenha os passos de trabalho em outra seção no mesmo nível de título. O título reconhecido é `Questions`, com essa palavra em inglês. Salve as alterações explícitas com o controle de salvar; cancelar descarta o rascunho. Marcar uma tarefa exibida atualiza seu estado. Use pendente, em andamento, concluída e cancelada para representar o que aconteceu, sem sugerir verificações que não foram executadas.

![Plano de demonstração com duas tarefas de trabalho concluídas de seis.](/documentation/pt-BR/work-implementation-plan.png)

## Preservar progresso e edições simultâneas {#plan-progress}

Amplie ou altere o plano existente em vez de substituí-lo por uma cópia nova sem marcações. Preserve as etapas concluídas e as explicações de mudanças de escopo. Antes de salvar uma reescrita importante, compare-a com o plano mais recente se outro membro ou agente trabalhou no problema.

Um plano escrito pode ser entregue ao Numo para implementação quando o trabalho no repositório e o ambiente isolado configurado estiverem disponíveis. Quando já existir trabalho concluído, a interface também oferece verificar a implementação. Essas ações iniciam trabalho; uma caixa marcada não prova por si só que o código passa nos testes. Leia resultado, mudanças e verificações antes de marcar o problema como concluído.
