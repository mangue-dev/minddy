---
{
  "id": "automation-settings",
  "locale": "pt-BR",
  "title": "Das automações às rotinas",
  "summary": "Revise propostas de migração pausadas antes de ativar o trabalho Numo por evento.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (pt-BR translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurar trabalho automático nas tarefas"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Revisar o trabalho migrado {#automation-settings}

Os interruptores de automação do projeto e os presets, filtros de esforço e espera inicial da conta foram substituídos por [Rotinas](/docs/scheduled-routines). Abra Rotinas como proprietário do projeto. As regras ativas arquivadas são propostas uma vez como rotinas pausadas; abrir a lista não as ativa nem consome orçamento de execução.

Revise instruções, status do gatilho, condições, espera e limite de gasto de cada proposta. O fluxo original permanece nas instruções para comparação. Confira as validações humanas e referências indisponíveis antes de ativar. As propostas pedem a resposta do proprietário nos pontos de validação humana e limitam cada execução a 15 % do orçamento mensal por padrão. Elas não continuam silenciosamente a cadeia anterior. Cadeias pendentes ou aguardando uma pessoa param; o código em execução pode terminar ou ser interrompido na conversa, sem uma etapa seguinte da cadeia. O histórico de atividades e os backups da conta mantêm o arquivo.

## Distinguir outras ferramentas do projeto {#mechanisms}

Smart Fill continua preenchendo prioridade, esforço, categorias e objetivo ausentes. Smart Assign permanece uma configuração do proprietário com regras por membro. Smart Triage continua usando regras estáticas. A autoatribuição permanece uma preferência separada. Essas ferramentas não ativam uma proposta migrada.

Teste manualmente uma rotina revisada, confira a conversa privada e o orçamento, e ative para ouvir eventos futuros. Se um trabalho inesperado começar, pause a rotina e confira a execução antes de tentar novamente. O [guia de rotinas](/docs/scheduled-routines#conditions) explica as condições em espera e sua invalidação.
