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
  "revision": 8,
  "sourceRevision": 7,
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
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1314,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurar e preencher seu ciclo {#personal-cycle}

Ative os ciclos em **Configurações da conta** → **Ciclos**, ou abra Ciclo pela paleta de comandos e escolha ali **Ativar ciclos**. Depois de ativados, uma aba **Ciclo** aparece na barra de visualizações de **Todos os tickets**, e a aba **Ciclo** de um quadro de projeto, marcada com uma seta, leva ao mesmo ciclo pessoal; enquanto os ciclos estão desativados, os quadros não mostram a aba **Ciclo**. Ele pertence à sua conta e pode conter tickets atribuídos a você em projetos dos quais você é o proprietário ou um Membro. Os leitores não podem ser atribuídos, então um projeto que você apenas lê não contribui com trabalho. Não é uma sprint de projeto nem pertence a um objetivo da equipe.

Escolha a duração de uma ou duas semanas, o dia de início, de um a quatro ciclos futuros e a intensidade leve, média ou alta. Essas configurações definem seu período pessoal e a capacidade desejada. Os controles de captura automática determinam se tickets atribuídos entram no ciclo atual quando são iniciados ou concluídos.

O ciclo atual é preenchido automaticamente uma vez com trabalho elegível. Para adicionar um ticket manualmente, use a ação de ciclo no menu dele e escolha o período atual ou o próximo, quando disponível. A adição atribui o ticket ao proprietário do ciclo sem alterar seu estado. Tickets em Triagem, Concluído, Cancelado ou Duplicado não podem ser adicionados por essa ação. Confira o responsável e os bloqueios depois de adicionar trabalho. Remover um ticket do ciclo o mantém no projeto.

![Ticket de demonstração no backlog do ciclo pessoal.](/documentation/pt-BR/reader-cycle.png)

## Concluir ou ajustar o período {#cycle-results}

Atualize os estados durante o trabalho e confira o que foi concluído e o que falta. Na mudança de período, tickets elegíveis não concluídos de ciclos anteriores passam automaticamente para o ciclo atual, preservando o responsável. Essa transferência não os marca como concluídos. Quando todos os tickets do ciclo atual estão fechados, um aviso **Ciclo concluído** oferece **Completar ciclo** para adicionar trabalho elegível; o ciclo não é completado automaticamente durante o período. Use o seletor de datas para consultar ciclos anteriores e futuros. Essas visualizações são somente leitura; o ciclo atual permite alterações.

Se um pré-requisito entrar no ciclo atual para manter as dependências coerentes, confira o motivo antes de removê-lo. Um ticket que desaparece após a conclusão pode continuar no trabalho concluído do ciclo ou ser encontrada pelo identificador. As configurações de ciclos da conta afetam sua área de planejamento, não o ciclo pessoal de outro membro.
