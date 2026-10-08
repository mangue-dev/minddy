---
{
  "id": "first-project",
  "locale": "pt-BR",
  "title": "Primeiros passos",
  "summary": "Crie um projeto ou entre em um existente, registre uma tarefa e conclua-a depois de verificar o resultado.",
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
  "revision": 5,
  "sourceRevision": 5,
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
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
    "Concluir seu primeira tarefa"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-first-project.png",
      "alt": "Ticket de demonstração concluído com descrição e comentário salvo.",
      "caption": "O status concluído registra a verificação do percurso no aplicativo. Não afirma que o link de e-mail do site de exemplo foi testado.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Do projeto à tarefa concluída {#first-project}

Use uma conta da instância desejada. Neste exemplo, crie um projeto de demonstração para um site e uma tarefa para verificar o link de contato. Você pode seguir a mesma sequência no Cloud ou em uma instância auto-hospedada configurada; a IA não é necessária.

1. Abra a página inicial depois de entrar. Para começar um trabalho novo, escolha a ação de novo projeto na navegação. Selecione um projeto totalmente novo no assistente, informe um nome e uma chave de duas a cinco letras e avance pelas etapas de ícone e repositório. Para este exemplo manual, mantenha o ícone padrão e não escolha um repositório. Você pode deixar a descrição inicial vazia. Na etapa final, confira o Smart Assign e a atribuição automática; deixe esta última desativada se quiser atribuir pessoalmente o ticket de demonstração. Escolha a ação para finalizar, aguarde a criação e abra o projeto. Se a equipe já tiver um projeto, informe ao proprietário o email da sua conta e aceite o convite na caixa de entrada em vez de criar um projeto duplicado.
2. Abra o projeto e crie uma tarefa. Dê um título concreto, como “Verificar o link de contato do site”. Descreva a página, o destino esperado e como verificará o resultado. Se o botão Preenchimento inteligente estiver visível e ativado, desative-o para este exemplo manual antes de criar a tarefa. Ele controla o preenchimento dessa tarefa e é independente dos controles de automação e Smart Assign do projeto.
3. Escolha um responsável, uma prioridade e um esforço se essas informações ajudarem a planejar a tarefa. Confirme a criação, abra a tarefa criada e confira seu projeto e identificador.
4. Mude o estado para “Em andamento” quando começar o trabalho. Faça a verificação e registre o resultado em um comentário. Use “Em revisão” se alguém ainda precisar analisar o resultado.
5. Mude o estado para “Concluído” depois de verificar o resultado esperado. Encontre a tarefa entre o trabalho concluído do projeto ou pelo identificador para confirmar a mudança.

![Ticket de demonstração concluído com descrição e comentário salvo.](/documentation/pt-BR/reader-first-project.png)

## Resolver um resultado inesperado {#first-use-recovery}

Um convite corresponde a uma conta e a uma instância específicas. Se ele não aparecer, confira o e-mail informado ao proprietário e abra a caixa de entrada na mesma instância. Saber o nome de um projeto não permite entrar nele. Se uma tarefa desaparecer do quadro depois de mudar de estado, remova os filtros da visualização ou pesquise seu identificador antes de criar outra cópia.

No celular, abra o menu de navegação para acessar o projeto e use seus controles de tarefas. Os seletores de estado e propriedades permitem realizar a mesma tarefa sem um atalho de teclado do desktop. Salve decisões específicas do projeto em uma página e vincule-a à tarefa quando a tarefa precisar de contexto duradouro.
