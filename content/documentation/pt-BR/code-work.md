---
{
  "id": "code-work",
  "locale": "pt-BR",
  "title": "Trabalho de código e pull requests",
  "summary": "Delegue a implementação de um problema a um agente de código, continue o trabalho e revise a pull request vinculada.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls",
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance)",
    "date": "2026-10-10"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Delegar um problema ao worker de código",
    "Revisar uma pull request vinculada",
    "Delegar uma tarefa ao worker de código"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/delegate-code-work-workflow.png",
      "alt": "Cartão do worker concluído com modelo, raciocínio leve, dois arquivos alterados, branch, PR nº 1 e commit corrigido.",
      "caption": "Exemplo histórico do OpenCode: Cartão da correção real do PR existente, com o commit atualizado e seu link. Revise o diff e as verificações antes do merge; o estado concluído por si só não comprova que os critérios de aceitação foram atendidos.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        179
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/review-pull-requests-workflow.png",
      "alt": "Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.",
      "caption": "O PR real corrigido permanece aberto, sem merge. O diff remove os espaços ao redor do nome e usa World quando o valor é vazio. Esta instância não pode solicitar autorização de usuário do GitHub; a indicação de prontidão não concede permissão de merge nem comprova que a CI do provedor passou.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

O trabalho de código parte de um problema e do repositório vinculado e é executado por um worker em uma sandbox no servidor. Acompanhe o andamento na conversa, confira as alterações e verificações e revise a pull request vinculada antes de decidir pelo merge.

## Delegar um problema ao worker de código {#delegate-code-work}

O projeto precisa de repositório GitHub ou GitLab vinculado, autorização válida e sandbox de servidor configurada. Confira **Agente de código** nas configurações IA da conta. O OpenCode exige um modelo API de código compatível; o acesso restrito ao Codex e Claude Code exige a conexão da conta pessoal selecionada. Configure modelo e raciocínio ali ou mantenha **Automático**. Essas escolhas são independentes do modelo das conversas Numo. Se o acesso nativo falhar, reconecte ou escolha OpenCode explicitamente; o trabalho não muda para cobrança API.

A autenticação Codex por assinatura em serviços hospedados não está disponível para uso geral. A OpenAI exclui explicitamente a autenticação app-server desses serviços e os direciona ao Sign in with ChatGPT. O Minddy precisa usar uma integração autorizada antes do lançamento. Os testes técnicos restritos não comprovam a permissão do provedor nem a recuperação após a expiração natural de tokens. A execução paga do Claude Code continua sem teste. Remover os selos da interface não altera essas condições. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

O cartão do trabalho delegado, os detalhes do agente e sua conversa mostram o mecanismo daquela execução com seu logo: **Codex**, **Claude Code** ou **OpenCode**. Essa identidade é salva ao iniciar o agente. Alterar as configurações da conta afeta novos agentes; não muda a identificação de uma execução existente. Execuções antigas sem mecanismo salvo mostram um rótulo genérico de agente de código.

1. Abra a tarefa e descreva comportamento esperado, restrições e verificações de aceitação.
2. Abra o Numo com esse contexto. Peça a inspeção do repositório antes de um plano técnico. Nomes de arquivos e APIs não verificados não comprovam a implementação.
3. Solicite explicitamente a implementação. O Numo delega alterações na branch ao worker, que clona o repositório na sandbox do servidor.
4. Acompanhe progresso, arquivos, verificações e perguntas no cartão do worker. Responda na conversa.
5. Abra a pull request vinculada. Revise diff e verificações diante dos critérios antes de mesclar. Só há prévia se o provedor de implantação tiver produzido uma.

![Cartão do worker concluído com modelo, raciocínio leve, dois arquivos alterados, branch, PR nº 1 e commit corrigido.](/documentation/pt-BR/delegate-code-work-workflow.png)

### Continuar com segurança {#continuation}

Um checkpoint preservado pode permitir retomada, sem garantir conclusão. Confira branch e PR antes de repetir uma execução com falha. Preserve tarefas concluídas e alterações simultâneas no plano. Arquivos somente locais não estão disponíveis: faça primeiro o push do código ou das skills necessárias.

## Revisar uma pull request vinculada {#review-pull-requests}

Abra a pull request vinculada à tarefa ou execução delegada. O acesso ao repositório continua necessário; ser membro do projeto não concede permissões na plataforma Git.

Leia descrição e atividade, depois arquivos alterados e trechos do diff. Abra conversas não resolvidas e responda no tópico correspondente. Marcar arquivos revisados acompanha sua leitura, mas não equivale à aprovação do provedor. Confira commits, resultados de CI e tarefas vinculadas diante do trabalho solicitado.

![Aba Alterações do PR de demonstração aberto, com o diff de greeting e um aviso de autorização do GitHub indisponível.](/documentation/pt-BR/review-pull-requests-workflow.png)

### Revisão e merge {#decision}

Solicite outro revisor quando necessário. Uma revisão por IA disponível acrescenta uma avaliação, sem comprovar que os testes passaram. Confira estado de rascunho ou pronto para revisão, discussões abertas, revisões solicitadas e política de merge.

Faça o merge após satisfazer verificações e revisões aplicáveis e com uma conta autorizada. O provedor pode rejeitar uma ação visível. Se o estado estiver desatualizado, atualize e confira no provedor antes de repetir. O Numo pode ler, comentar, alterar prontidão ou mesclar com autorização; alterações na branch passam ao worker. Uma prévia depende de implantação real.
