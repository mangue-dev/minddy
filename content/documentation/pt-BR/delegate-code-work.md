---
{
  "id": "delegate-code-work",
  "locale": "pt-BR",
  "title": "Delegar uma tarefa ao worker de código",
  "summary": "Preparar o acesso ao repositório, acompanhar a execução e conferir a pull request vinculada.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/delegate-code-work-workflow.png",
      "alt": "Cartão do worker concluído com modelo, raciocínio leve, dois arquivos alterados, branch, PR nº 1 e commit corrigido.",
      "caption": "Cartão da correção real do PR existente, com o commit atualizado e seu link. Revise o diff e as verificações antes do merge; o estado concluído por si só não comprova que os critérios de aceitação foram atendidos.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow"
  ]
}
---

## Delimitar a implementação {#delegate-code-work}
O projeto precisa de repositório GitHub ou GitLab vinculado, autorização válida e sandbox do servidor configurada. Confira modelo e raciocínio do worker nas configurações de IA da conta. O modelo da conversa não substitui esses padrões.

1. Abra a tarefa e descreva comportamento esperado, restrições e verificações de aceitação.
2. Abra o Numo com esse contexto. Peça a inspeção do repositório antes de um plano técnico. Nomes de arquivos e APIs não verificados não comprovam a implementação.
3. Solicite explicitamente a implementação. O Numo delega alterações na branch ao worker, que clona o repositório na sandbox do servidor.
4. Acompanhe progresso, arquivos, verificações e perguntas no cartão do worker. Responda na conversa.
5. Abra a pull request vinculada. Revise diff e verificações diante dos critérios antes de mesclar. Só há prévia se o provedor de implantação tiver produzido uma.

![Cartão do worker concluído com modelo, raciocínio leve, dois arquivos alterados, branch, PR nº 1 e commit corrigido.](/documentation/pt-BR/delegate-code-work-workflow.png)


## Continuar com segurança {#continuation}
Um checkpoint preservado pode permitir retomada, sem garantir conclusão. Confira branch e PR antes de repetir uma execução com falha. Preserve tarefas concluídas e alterações simultâneas no plano. Arquivos somente locais não estão disponíveis: faça primeiro o push do código ou das skills necessárias.
