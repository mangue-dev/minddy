---
{
  "id": "automation-settings",
  "locale": "pt-BR",
  "title": "Automação de problemas",
  "summary": "Configure as automações da conta e diferencie as regras do projeto reservadas ao proprietário.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurar trabalho automático nas tarefas"
  ],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/automation-settings-workflow.png",
      "alt": "Predefinição de automação sem opção selecionada.",
      "caption": "Sem predefinição selecionada, esta conta não inicia trabalho automático.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/automation-settings-projects-workflow.png",
      "alt": "Seleção de projetos para as automações da conta.",
      "caption": "Seleção de projetos para as automações da conta. Os dois projetos de demonstração estão desativados; nenhuma automação é iniciada.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Opções da conta {#automation-settings}

Abra a seção Automações nas configurações da conta. Escolha uma configuração predefinida, leia a explicação e a estimativa de uso, defina o atraso inicial e escolha quais tamanhos de esforço permitem etapas automáticas. As estimativas dependem do saldo disponível e não são preços fixos. Antes de habilitar o trabalho de código, confira o modelo do worker nas configurações de IA da conta. A mesma página lista os controles de automação dos projetos que você possui; membros não podem habilitar o projeto de outro proprietário.

![Predefinição de automação sem opção selecionada.](/documentation/pt-BR/automation-settings-workflow.png)

## Diferenciar mecanismos {#mechanisms}

O Smart Fill preenche prioridade, esforço, categorias e objetivo ausentes; não escolhe status, responsável nem prazo. As preferências da conta diferenciam o preenchimento na criação e o preenchimento de tarefas elegíveis da triagem em projetos dos quais você é proprietário. A autoatribuição na criação ou no início é uma preferência separada; a atribuição no início afeta apenas tarefas sem responsável.

O Smart Assign é uma configuração do proprietário do projeto, com regras por membro. O Smart Triage usa regras estáticas do projeto e é distinto do preenchimento por IA e da execução de código. Confira os destinatários e os gatilhos de cada regra antes de salvar.

Habilite somente as etapas que deseja executar sem uma nova solicitação manual. As etapas de IA exigem um provedor configurado e utilizável e devem passar pelas verificações de orçamento aplicáveis à chamada. Chaves pessoais compatíveis e validadas podem isentar suas chamadas da cota de IA incluída da conta e transferir a cobrança dos modelos para o provedor. Elas não tornam gratuito o processamento da sandbox: o custo continua sendo registrado separadamente, e o orçamento por execução de uma rotina permanece um limite distinto. Se um trabalho inesperado começar, examine a atividade da tarefa e a conversa, depois desative o controle correspondente da conta ou do projeto antes de criar outras tarefas de teste.

![Seleção de projetos para as automações da conta.](/documentation/pt-BR/automation-settings-projects-workflow.png)
