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
  "revision": 4,
  "sourceRevision": 4,
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
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "revision": 4,
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

Ative os ciclos em Configurações da conta → Ciclos e abra Ciclo na navegação pessoal. Ele pertence à sua conta e pode conter tarefas de vários projetos aos quais você tem acesso. Não é uma sprint de projeto nem pertence a um objetivo da equipe.

Escolha a duração de uma ou duas semanas, o dia de início, de um a quatro ciclos futuros e a intensidade leve, média ou alta. Essas configurações definem seu período pessoal e a capacidade desejada. Os controles de captura automática determinam se tarefas atribuídas entram no ciclo atual quando são iniciadas ou concluídas.

O ciclo atual é preenchido automaticamente uma vez com trabalho elegível. Para adicionar uma tarefa manualmente, use a ação de ciclo no menu dela e escolha o período atual ou o próximo, quando disponível. A adição atribui a tarefa ao proprietário do ciclo sem alterar seu estado. Tarefas em Triagem, Concluído, Cancelada ou Duplicado não podem ser adicionadas por essa ação. Confira o responsável e os bloqueios depois de adicionar trabalho. Remover uma tarefa do ciclo a mantém no projeto.

![Ticket de demonstração no backlog do ciclo pessoal.](/documentation/pt-BR/reader-cycle.png)

## Concluir ou ajustar o período {#cycle-results}

Atualize os estados durante o trabalho e confira o que foi concluído e o que falta. Na mudança de período, tarefas elegíveis não concluídas de ciclos anteriores passam automaticamente para o ciclo atual, preservando o responsável. Essa transferência não as marca como concluídas. Use o seletor de datas para consultar ciclos anteriores e futuros. Essas visualizações são somente leitura; o ciclo atual permite alterações.

Se um pré-requisito entrar no ciclo atual para manter as dependências coerentes, confira o motivo antes de removê-lo. Uma tarefa que desaparece após a conclusão pode continuar no trabalho concluído do ciclo ou ser encontrada pelo identificador. As configurações de ciclos da conta afetam sua área de planejamento, não o ciclo pessoal de outro membro.
