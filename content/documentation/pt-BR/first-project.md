---
{
  "id": "first-project",
  "locale": "pt-BR",
  "title": "Primeiros passos",
  "summary": "Crie um projeto ou entre em um existente, registre um ticket e conclua-o depois de verificar o resultado.",
  "topic": "Primeiros passos",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 11,
  "sourceRevision": 9,
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
      "content/knowledge/core-tracker.md",
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Concluir seu primeiro ticket"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-first-project.png",
      "alt": "Ticket AUR-3 em andamento, com descrição, responsável, esforço e categoria.",
      "caption": "O ticket mostra identificador, status e propriedades. Marque-o como concluído só depois de verificar o resultado esperado.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Do projeto ao ticket concluído {#first-project}

Use uma conta da instância desejada. Neste exemplo, crie um projeto de demonstração para um site e um ticket para verificar o link de contato. Você pode seguir a mesma sequência no Cloud ou em uma instância auto-hospedada configurada; a IA não é necessária.

Se a equipe já tiver um projeto, informe ao proprietário o email da sua conta e aceite o convite na caixa de entrada em vez de criar um projeto duplicado.

1. Abra a página inicial depois de entrar. Para começar um trabalho novo, escolha a ação de novo projeto na navegação. Selecione um projeto totalmente novo no assistente, informe um nome e uma chave de duas a cinco letras e avance pelas etapas de ícone e repositório. Para este exemplo manual, mantenha o ícone padrão e não escolha um repositório. Você pode deixar a descrição inicial vazia. A etapa seguinte propõe convidar sua equipe: pule-a neste exemplo manual ou busque pelo nome as pessoas dos seus outros projetos ou digite os e-mails delas; nenhum convite é enviado antes de você concluir a criação. Na etapa final, confira o Smart Assign e a atribuição automática; deixe esta última desativada se quiser atribuir pessoalmente o ticket de demonstração. Escolha a ação para finalizar, aguarde a criação e abra o projeto.
2. Abra o projeto e crie um ticket. Dê um título concreto, como “Verificar o link de contato do site”. Descreva a página, o destino esperado e como verificará o resultado. Se o botão Preenchimento inteligente estiver visível e ativado, desative-o para este exemplo manual antes de criar o ticket. Ele controla o preenchimento desse ticket e é independente do Smart Assign e das rotinas.
3. Escolha um responsável, uma prioridade e um esforço se essas informações ajudarem a planejar o ticket. Confirme a criação, abra o ticket criado e confira seu projeto e identificador.
4. Mude o estado para “Em andamento” quando começar o trabalho. Faça a verificação e registre o resultado em um comentário. Use “Em revisão” se alguém ainda precisar analisar o resultado.
5. Mude o estado para “Concluído” depois de verificar o resultado esperado. Os quadros ocultam a coluna **Concluído** por padrão: selecione **Concluído** no filtro **Status** do quadro, ou pesquise o identificador do ticket, para confirmar a mudança.

![Ticket AUR-3 em andamento, com descrição, responsável, esforço e categoria.](/documentation/pt-BR/reader-first-project.png)

## Resolver um resultado inesperado {#first-use-recovery}

Um convite corresponde a uma conta e a uma instância específicas. Se ele não aparecer, confira o e-mail informado ao proprietário e abra a caixa de entrada na mesma instância. Saber o nome de um projeto não permite entrar nele. Se um ticket desaparecer do quadro depois de mudar de estado, remova os filtros da visualização ou pesquise seu identificador antes de criar outra cópia. Tickets concluídos e cancelados saem do quadro por padrão; selecione **Concluído** ou **Cancelado** no filtro **Status** para exibi-los.

Se alguns convites adicionados no assistente não tiverem sido enviados, o projeto fica criado mesmo assim e uma notificação lista cada pessoa não convidada com o motivo. Verifique os convites pendentes nas configurações de membros do projeto antes de convidar novamente.

No celular, abra o menu de navegação para acessar o projeto e use seus controles de tickets. Os seletores de estado e propriedades permitem realizar a mesma tarefa sem um atalho de teclado do desktop. Salve decisões específicas do projeto em uma página e vincule-a ao ticket quando o ticket precisar de contexto duradouro.
