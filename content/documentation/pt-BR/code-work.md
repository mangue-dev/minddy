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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/pull-requests/pr-reviews-details.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "caption": "Cartão da correção real do PR existente, com o commit atualizado e seu link. Revise o diff e as verificações antes do merge; o estado concluído por si só não comprova que os critérios de aceitação foram atendidos.",
      "revision": 3,
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
      "revision": 3,
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

O projeto precisa de repositório GitHub ou GitLab vinculado, autorização válida e sandbox do servidor configurada. Confira modelo e raciocínio do worker nas configurações de IA da conta. O modelo da conversa não substitui esses padrões.

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
