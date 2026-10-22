---
{
  "id": "architecture-and-data-flows",
  "locale": "pt-BR",
  "title": "Arquitetura e fluxos de dados",
  "summary": "Acompanhe solicitações e dados entre minddy, Supabase, agendador e provedores externos, distinguindo serviços persistentes e destinos dos dados.",
  "topic": "Conceitos técnicos",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Seguir fluxos entre aplicação, banco e provedores"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/architecture-and-data-flows-flow.svg",
      "alt": "Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente para tarefas em segundo plano. Provedores opcionais: destinos separados.",
      "caption": "A aplicação coordena os serviços internos e usa os provedores externos quando estão configurados.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Navegador e aplicação autenticada"
          },
          {
            "title": "Supabase: PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Agendador independente para tarefas em segundo plano"
          },
          {
            "title": "Provedores opcionais: destinos separados"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguir fluxos entre aplicação, banco e provedores {#architecture-and-data-flows}

O `Next.js` fornece a interface e as APIs autorizadas. O Supabase fornece PostgreSQL, Auth, Storage e Realtime. O PostgreSQL guarda registros da aplicação, contas, dados da plataforma e metadados dos arquivos; o Storage guarda os bytes. A configuração protegida contém chaves e definições de provedores. Os containers podem ser recriados, mas volumes, bytes e chaves precisam persistir. Uma restauração completa reúne esses elementos no mesmo ponto de recuperação.

![Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente para tarefas em segundo plano. Provedores opcionais: destinos separados.](/documentation/pt-BR/architecture-and-data-flows-flow.svg)

## Seguir uma solicitação {#requests}

O navegador usa as origens públicas do minddy e do Supabase. O Auth cria a sessão; o servidor verifica o usuário e o objeto antes de executar a operação. O Realtime propaga atualizações. No perfil full, o servidor usa o Kong na rede interna sem alterar as origens do navegador ou os links de conta. O agendador envia requisições HTTP autenticadas sem navegador.

## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, notificações push, analytics e armazenamento externo são destinos separados quando habilitados. Hospedar o minddy no seu servidor não torna esses serviços locais. No perfil managed, o provedor escolhido opera o backend; full o coloca sob seu controle. O minddy Cloud opera o serviço e seus provedores, enquanto na instalação própria você configura contas e escolhas. Confira permissões, custos e condições de tratamento de dados. Não deduza o provedor ou a edição Cloud apenas pelo hostname ou pela plataforma de implantação.
