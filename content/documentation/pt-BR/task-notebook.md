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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of task-notebook-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Registrar uma ideia {#task-notebook}

Abra o caderno de tarefas pelos controles pessoais do aplicativo, ou use Command+Shift+K no macOS e Ctrl+Shift+K no Windows/Linux quando o foco estiver fora de texto editável. Esse espaço de anotações e caixas de seleção pertence à sua conta. Acrescente o contexto, organize-o em seções se for útil e use as caixas de seleção das tarefas para acompanhar pequenas etapas pessoais antes que elas virem tickets de um projeto.

Para reencontrar uma tarefa, abra a paleta de comandos com Command+K no macOS ou Ctrl+K no Windows/Linux e digite palavras da tarefa. As tarefas ainda a fazer aparecem em **Caderno de tarefas**, com a sua seção; tarefas concluídas ou canceladas e perguntas não aparecem. Escolha uma para abrir o caderno nessa tarefa. Enquanto você não digitar nada, a paleta não lista as tarefas do caderno.

O caderno usa o mesmo editor das páginas do projeto, com as mesmas alças de bloco: passe o cursor sobre um bloco para arrastá-lo, abrir seu menu ou adicionar um bloco com **+**. Digite `/` para inserir uma tarefa, oferecida primeiro, ou um título, uma lista, uma citação, um **Destaque**, um bloco de código, um bloco **Alternar** ou um divisor, ou escolha **Ditar uma tarefa** para falar as tarefas em voz alta. O caderno continua salvo em Markdown, então Numo e os agentes conectados leem as mesmas tarefas e estados. Selecione um texto para formatá-lo ou adicionar um link. Cole ou solte uma imagem, ou escolha **Imagem** no menu `/`, para inseri-la em uma nota. Os outros tipos de arquivo ficam nas páginas.

O menu **Ações do caderno** (`…`) oferece **Copiar tudo como prompt**, que copia o caderno inteiro para o seu próprio agente de código, e **Remover tarefas concluídas e descartadas**. A remoção pede confirmação, exclui as tarefas concluídas e canceladas junto com os títulos que ficam vazios e mantém as tarefas a fazer ou em andamento. Para copiar menos, use **Copiar seção como prompt** em um título ou **Copiar como prompt** em uma tarefa. Se **Iniciar o ticket ou tarefa quando eu copiar seu prompt** estiver ativado em **Configurações da conta** → **Tickets**, copiar também passa para em andamento as tarefas pendentes copiadas.

O caderno é privado. Use uma página do projeto para informações que seus colegas precisam compartilhar. O Numo pode ler ou atualizar o caderno quando você pedir, mas a participação de outra pessoa no seu projeto não transforma suas anotações em um documento compartilhado.

![Tarefas pessoais de demonstração traduzidas no caderno.](/documentation/pt-BR/work-task-notebook.png)

## Levar uma tarefa para o projeto {#promote-note}

Abra o menu da tarefa e escolha **Promover a ticket** quando a anotação se tornar trabalho do projeto. O caderno fecha e o Numo abre com uma solicitação preparada que contém a tarefa e suas subtarefas. Se você estiver em um projeto, esse projeto será usado; em uma tela global, informe o projeto de destino na conversa. Confira a solicitação antes de enviá-la. É necessário ter uso de IA disponível ou uma chave pessoal compatível. Abrir essa opção ainda não criou um ticket. Depois que o Numo confirmar a criação, abra o ticket para verificar o identificador, o escopo e as propriedades. Acrescente as condições de aceitação que faltarem para preservar o contexto necessário. A solicitação preparada também pede ao Numo que remova a tarefa do caderno quando o ticket existir; procure-a, portanto, no ticket e não no caderno.

Se a criação falhar ou o resultado ficar incerto após um erro de rede, procure o ticket antes de repetir a operação. Mantenha as outras seções intactas ao pedir que o Numo altere uma tarefa. Confira se ele mudou a caixa de seleção pretendida sem substituir o caderno inteiro.
