---
{
  "id": "automation-settings",
  "locale": "pt-BR",
  "title": "Das automações às rotinas",
  "summary": "Entenda o que aconteceu com as automações de projeto e recrie um fluxo como rotina controlada pelo proprietário.",
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
  "revision": 9,
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Recriar uma automação de projeto como rotina"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## O que aconteceu com as automações de projeto {#automation-settings}

Os interruptores de automação do projeto e os presets, filtros de esforço e espera inicial da conta foram substituídos por [Rotinas](/docs/scheduled-routines). As regras de automação configuradas em uma versão anterior não são mais executadas, e o Minddy não as converte em rotinas. Cadeias pendentes ou aguardando uma pessoa foram interrompidas sem uma etapa seguinte. As regras arquivadas permanecem no projeto e nas exportações da conta.

Para manter um fluxo, abra Rotinas como proprietário do projeto e [crie uma rotina](/docs/scheduled-routines#scheduled-routines) com as instruções, o gatilho, as condições e a espera necessários.

## Distinguir outras ferramentas do projeto {#mechanisms}

Smart Fill continua preenchendo prioridade, esforço, categorias e objetivo ausentes. Smart Assign permanece uma configuração do proprietário com regras por membro. Smart Triage continua usando regras estáticas. A autoatribuição permanece uma preferência separada. Essas ferramentas são separadas das rotinas e não substituem uma automação retirada.

Teste manualmente uma nova rotina, confira a conversa privada e o orçamento, e ative para ouvir eventos futuros. Se um trabalho inesperado começar, pause a rotina e confira a execução antes de tentar novamente. O [guia de rotinas](/docs/scheduled-routines#conditions) explica as condições em espera e sua invalidação.
