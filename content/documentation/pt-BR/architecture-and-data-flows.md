---
{
  "id": "architecture-and-data-flows",
  "locale": "pt-BR",
  "title": "Arquitetura e fluxos de dados",
  "summary": "Acompanhe solicitações e dados entre minddy, Supabase, agendador, sandbox e provedores externos, distinguindo serviços persistentes e destinos dos dados.",
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
  "revision": 2,
  "sourceRevision": 2,
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
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "alt": "Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.",
      "caption": "Estes componentes têm responsabilidades distintas. Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.",
      "revision": 2,
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
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguir fluxos entre aplicação, banco e provedores {#architecture-and-data-flows}

O Next.js fornece a interface e as APIs autorizadas. O Supabase fornece PostgreSQL, Auth, Storage e Realtime. O PostgreSQL guarda registros da aplicação, contas, dados da plataforma e metadados dos arquivos; o Storage guarda os bytes. A configuração protegida contém chaves e definições de provedores. Os containers podem ser recriados, mas volumes, bytes e chaves precisam persistir. Uma restauração completa reúne esses elementos no mesmo ponto de recuperação.

![Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.](/documentation/pt-BR/architecture-and-data-flows-flow.svg)

## Seguir uma solicitação {#requests}

O navegador usa as origens públicas do minddy e do Supabase. O Auth cria a sessão; o servidor verifica o usuário e o objeto antes de executar a operação. O Realtime propaga atualizações. No perfil full, o servidor usa o Kong na rede interna sem alterar as origens do navegador ou os links de conta. O agendador envia requisições HTTP autenticadas sem navegador. Quando o Numo precisa trabalhar com código, o runner confiável cria sandboxes restritas para o repositório conectado; elas não recebem segredos da instância nem o socket Docker.

## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, notificações push, analytics e armazenamento externo são destinos separados quando habilitados. Hospedar o minddy no seu servidor não torna esses serviços locais. No perfil managed, o provedor escolhido opera o backend; full o coloca sob seu controle. O minddy Cloud opera o serviço e seus provedores, enquanto na instalação própria você configura contas e escolhas. Confira permissões, custos e condições de tratamento de dados. Não deduza o provedor ou a edição Cloud apenas pelo hostname ou pela plataforma de implantação.
