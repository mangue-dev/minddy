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
  "revision": 14,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept); agent:claude-code (MIN-964 tour on every platform: the new-account paragraph no longer limits the getting-started steps to a phone, and components/sidebar-onboarding.tsx left the evidence; checked against components/first-run/first-run-gate.tsx and components/first-run/onboarding-screen.tsx; no browser walkthrough; no figure recaptured)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 tour follow-up skip sentence with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Se a equipe já tiver um projeto, informe ao proprietário o email da sua conta e aceite o convite na caixa de entrada em vez de criar um projeto duplicado. Na primeira etapa do assistente, **Quero participar de um projeto** explica como participar.

Uma conta nova pede primeiro seu nome e sua imagem em **Como devemos chamar você?**. Os primeiros passos vêm em seguida, uma página por vez: crie o projeto na primeira etapa ou escolha **Pular introdução**, confirme e siga este exemplo a partir da página inicial. Consulte [Criar uma conta e entrar](/pt-br/documentacao/accounts#account-access).

1. Abra a página inicial depois de entrar e escolha **Novo projeto** na navegação. O assistente abre em **Qual é o nome do seu projeto?**: informe um nome e uma chave de duas a cinco letras e escolha **Continuar**.
2. Mantenha o ícone padrão em **Ícone do projeto** e escolha **Continuar**. Em **Vincular um repositório**, escolha **Pular** neste exemplo manual. A partir da segunda etapa, **Voltar**, abaixo de **Continuar**, volta para a etapa anterior.
3. Em **Convide sua equipe**, escolha **Pular** neste exemplo manual; para trabalhar com outras pessoas, busque pelo nome as pessoas dos seus outros projetos ou digite os e-mails delas. Nenhum convite é enviado antes de você escolher **Concluir**.
4. Em **Traga seus tickets**, escolha **Pular**: este exemplo começa sem tickets. Para começar a partir de outra ferramenta, veja o parágrafo depois destas etapas.
5. Em **Toques finais**, confira o Smart Assign. Escolha **Concluir**, aguarde a criação e abra o projeto.
6. Abra o projeto e crie um ticket. Dê um título concreto, como “Verificar o link de contato do site”. Descreva a página, o destino esperado e como verificará o resultado. Se o botão Smart Fill estiver visível e ativado, desative-o para este exemplo manual antes de criar o ticket. Ele controla o preenchimento desse ticket e é independente do Smart Assign e das rotinas.
7. Escolha um responsável, uma prioridade e um esforço se essas informações ajudarem a planejar o ticket. Confirme a criação, abra o ticket criado e confira seu projeto e identificador.
8. Mude o estado para “Em andamento” quando começar o trabalho. Faça a verificação e registre o resultado em um comentário. Use “Em revisão” se alguém ainda precisar analisar o resultado.
9. Mude o estado para “Concluído” depois de verificar o resultado esperado. Os quadros ocultam a coluna **Concluído** por padrão: selecione **Concluído** no filtro **Status** do quadro, ou pesquise o identificador do ticket, para confirmar a mudança.

Para trazer os tickets de outra ferramenta, escolha essa ferramenta na lista de **Traga seus tickets**: Linear, Jira, Notion, GitHub, Trello ou minddy. **Como exportar do …** abre as etapas de exportação da ferramenta escolhida. Exporte o CSV nela e escolha **Escolher o arquivo CSV**. O arquivo escolhido aparece com um botão para removê-lo. Ele é importado quando o projeto existe: o projeto abre com uma janela de importação que contém o arquivo, onde você associa as colunas e confirma a importação. Um rascunho salvo do assistente não guarda o arquivo; se você retomar a criação depois, escolha-o novamente.

![Ticket AUR-3 em andamento, com descrição, responsável, esforço e categoria.](/documentation/pt-BR/reader-first-project.png)

## Resolver um resultado inesperado {#first-use-recovery}

Um convite corresponde a uma conta e a uma instância específicas. Se ele não aparecer, confira o e-mail informado ao proprietário e abra a caixa de entrada na mesma instância. Saber o nome de um projeto não permite entrar nele. Se um ticket desaparecer do quadro depois de mudar de estado, remova os filtros da visualização ou pesquise seu identificador antes de criar outra cópia. Tickets concluídos e cancelados saem do quadro por padrão; selecione **Concluído** ou **Cancelado** no filtro **Status** para exibi-los.

Se alguns convites adicionados no assistente não tiverem sido enviados, o projeto fica criado mesmo assim e uma notificação lista cada pessoa não convidada com o motivo. Verifique os convites pendentes nas configurações de membros do projeto antes de convidar novamente.

No celular, abra o menu de navegação para acessar o projeto e use seus controles de tickets. Os seletores de estado e propriedades permitem realizar a mesma tarefa sem um atalho de teclado do desktop. Salve decisões específicas do projeto em uma página e vincule-a ao ticket quando o ticket precisar de contexto duradouro.
