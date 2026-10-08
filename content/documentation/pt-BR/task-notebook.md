---
{
  "id": "task-notebook",
  "locale": "pt-BR",
  "title": "Caderno de tarefas",
  "summary": "Escreva notas rápidas e transforme uma tarefa selecionada em trabalho do projeto quando precisar de acompanhamento.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "content/knowledge/productivity.md",
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Registrar notas no caderno privado"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-task-notebook.png",
      "alt": "Tarefas pessoais de demonstração traduzidas no caderno.",
      "caption": "O caderno acompanha etapas pessoais fora da hierarquia de tickets do projeto. Os status das tarefas de exemplo permanecem iguais.",
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
    "task-notebook-steps"
  ]
}
---

## Registrar uma ideia {#task-notebook}

Abra o caderno de tarefas pelos controles pessoais do aplicativo, ou use Command+Shift+K no macOS e Ctrl+Shift+K no Windows/Linux quando o foco estiver fora de texto editável. Esse espaço de anotações e caixas de seleção pertence à sua conta. Acrescente o contexto, organize-o em seções se for útil e use as caixas de seleção das tarefas para acompanhar pequenas etapas pessoais antes que elas virem tickets de um projeto.

O caderno é privado. Use uma página do projeto para informações que seus colegas precisam compartilhar. O Numo pode ler ou atualizar o caderno quando você pedir, mas a participação de outra pessoa no seu projeto não transforma suas anotações em um documento compartilhado.

![Tarefas pessoais de demonstração traduzidas no caderno.](/documentation/pt-BR/work-task-notebook.png)

## Levar uma tarefa para o projeto {#promote-note}

Abra o menu da tarefa e escolha a ação para levá-la ao projeto quando a anotação se tornar trabalho do projeto. O caderno fecha e o Numo abre com uma solicitação preparada que contém a tarefa e suas subtarefas. Se você estiver em um projeto, esse projeto será usado; em uma tela global, informe o projeto de destino na conversa. Confira a solicitação antes de enviá-la. É necessário ter uso de IA disponível ou uma chave pessoal compatível. Abrir essa opção ainda não criou um ticket. Depois que o Numo confirmar a criação, abra o ticket para verificar o identificador, o escopo e as propriedades. Acrescente as condições de aceitação que faltarem para preservar o contexto necessário.

Se a criação falhar ou o resultado ficar incerto após um erro de rede, procure o ticket antes de repetir a operação. Mantenha as outras seções intactas ao pedir que o Numo altere uma tarefa. Confira se ele mudou a caixa de seleção pretendida sem substituir o caderno inteiro.
