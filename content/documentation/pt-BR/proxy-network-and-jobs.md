---
{
  "id": "proxy-network-and-jobs",
  "locale": "pt-BR",
  "title": "Expor origens e operar tarefas agendadas",
  "summary": "Um serviço público exige proxy TLS e redirect de HTTP para HTTPS.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "update-an-instance",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/proxy-network-and-jobs-flow.svg",
      "alt": "Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Runner, banco e portas privadas. Tarefas autenticadas; paradas em manutenção.",
      "caption": "Estes componentes têm responsabilidades distintas. Proxy HTTPS público. Origens app e Supabase públicas. Runner, banco e portas privadas. Tarefas autenticadas; paradas em manutenção.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "proxy-network-and-jobs-flow"
  ]
}
---

## Expor origens e operar tarefas agendadas {#proxy-network-and-jobs}

Um serviço público exige proxy TLS e redirect de HTTP para HTTPS. As origens Minddy e Supabase, redirects Auth, callbacks OAuth e cabeçalhos precisam concordar. Não exponha PostgreSQL, Studio, portas internas ou runner. No perfil full, o servidor usa http://kong:8000 internamente, enquanto navegador e links preservam a origem pública do Supabase. HTTP privado exige localhost ou uma rede IPv4 privada confiável, sem encaminhamento de portas do roteador.

![Diagrama: Proxy HTTPS público. Origens app e Supabase públicas. Runner, banco e portas privadas. Tarefas autenticadas; paradas em manutenção.](/documentation/pt-BR/proxy-network-and-jobs-flow.svg)

## Fornecer agendamento autenticado {#schedules}

Os perfis Compose de referência iniciam o agendador, e o instalador gera CRON_SECRET. Uma implantação personalizada a partir do código precisa fornecer um agendador HTTP equivalente. Cada requisição envia `Authorization: Bearer <CRON_SECRET>`; um valor vazio ou errado retorna 401. Não registre esse cabeçalho. Os horários do candidato listados abaixo estão em UTC. Use as rotas da versão instalada, pois elas podem mudar.


O agendador publicado em v0.11.0 não inclui numo-turns. O candidato foi corrigido para chamá-lo a cada minuto. A tabela descreve o candidato corrigido; não presuma que esse job exista em uma implantação v0.11.0 intacta.

| Endpoint | Horário (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |


## Parar tarefas em manutenção {#maintenance}

Antes de backup ou migração, pare agendador, aplicação, workers e API pública. Parar apenas o servidor web ainda permite gravações diretas. Verifique em manutenção com entradas e jobs fechados e reabra somente após conferir banco, Auth, Storage e aplicação. Se um job não iniciar, verifique agendador, origem e segredo em privado. Rotinas exigem o servidor, não um desktop aberto.
