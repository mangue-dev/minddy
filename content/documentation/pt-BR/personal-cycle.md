---
{
  "id": "personal-cycle",
  "locale": "pt-BR",
  "title": "Ciclos pessoais",
  "summary": "Selecione trabalho entre projetos para um período de planejamento semanal ou de duas semanas.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "views",
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Planejar um ciclo pessoal"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-cycle.png",
      "alt": "Ticket de demonstração no backlog do ciclo pessoal.",
      "caption": "A inclusão atribuiu o ticket ao titular do ciclo e preservou o status backlog.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurar e preencher seu ciclo {#personal-cycle}

Ative os ciclos em **Configurações da conta** → **Ciclos**, ou com **Ativar ciclos** na aba **Ciclo**. Abra essa aba na barra de visualizações de **Todos os problemas**, ou pesquise Ciclo na paleta de comandos; a aba **Ciclo** de um quadro de projeto, marcada com uma seta, leva ao mesmo ciclo pessoal. Ele pertence à sua conta e pode conter tarefas atribuídas a você em projetos dos quais você é o proprietário ou um Membro. Os leitores não podem ser atribuídos, então um projeto que você apenas lê não contribui com trabalho. Não é uma sprint de projeto nem pertence a um objetivo da equipe.

Escolha a duração de uma ou duas semanas, o dia de início, de um a quatro ciclos futuros e a intensidade leve, média ou alta. Essas configurações definem seu período pessoal e a capacidade desejada. Os controles de captura automática determinam se tarefas atribuídas entram no ciclo atual quando são iniciadas ou concluídas.

O ciclo atual é preenchido automaticamente uma vez com trabalho elegível. Para adicionar uma tarefa manualmente, use a ação de ciclo no menu dela e escolha o período atual ou o próximo, quando disponível. A adição atribui a tarefa ao proprietário do ciclo sem alterar seu estado. Tarefas em Triagem, Concluído, Cancelada ou Duplicado não podem ser adicionadas por essa ação. Confira o responsável e os bloqueios depois de adicionar trabalho. Remover uma tarefa do ciclo a mantém no projeto.

![Ticket de demonstração no backlog do ciclo pessoal.](/documentation/pt-BR/reader-cycle.png)

## Concluir ou ajustar o período {#cycle-results}

Atualize os estados durante o trabalho e confira o que foi concluído e o que falta. Na mudança de período, tarefas elegíveis não concluídas de ciclos anteriores passam automaticamente para o ciclo atual, preservando o responsável. Essa transferência não as marca como concluídas. Quando todas as tarefas do ciclo atual estão fechadas, um aviso **Ciclo concluído** oferece **Ciclo de recarga** para adicionar trabalho elegível; o ciclo não é recarregado automaticamente durante o período. Use o seletor de datas para consultar ciclos anteriores e futuros. Essas visualizações são somente leitura; o ciclo atual permite alterações.

Se um pré-requisito entrar no ciclo atual para manter as dependências coerentes, confira o motivo antes de removê-lo. Uma tarefa que desaparece após a conclusão pode continuar no trabalho concluído do ciclo ou ser encontrada pelo identificador. As configurações de ciclos da conta afetam sua área de planejamento, não o ciclo pessoal de outro membro.
