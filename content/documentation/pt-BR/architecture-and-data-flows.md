---
{
  "id": "architecture-and-data-flows",
  "locale": "pt-BR",
  "title": "Seguir fluxos entre aplicação, banco e provedores",
  "summary": "O Next.js fornece a interface e as APIs autorizadas.",
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
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "storage-and-attachments",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/architecture-and-data-flows-flow.svg",
      "alt": "Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.",
      "caption": "Estes componentes têm responsabilidades distintas. Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.",
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
    "architecture-and-data-flows-flow"
  ]
}
---

## Seguir fluxos entre aplicação, banco e provedores {#architecture-and-data-flows}

O Next.js fornece a interface e as APIs autorizadas. O Supabase fornece PostgreSQL, Auth, Storage e Realtime. O PostgreSQL guarda registros da aplicação, contas, dados da plataforma e metadados dos arquivos; o Storage guarda os bytes. A configuração protegida contém chaves e definições de provedores. Os containers podem ser recriados, mas volumes, bytes e chaves precisam persistir. Uma restauração completa reúne esses elementos no mesmo ponto de recuperação.

![Diagrama: Navegador e aplicação autenticada. Supabase: PostgreSQL, Auth, Storage, Realtime. Agendador independente e runner confiável. Provedores opcionais: destinos separados.](/documentation/pt-BR/architecture-and-data-flows-flow.svg)

## Seguir uma solicitação {#requests}

O navegador usa as origens públicas do Minddy e do Supabase. O Auth cria a sessão; o servidor verifica o usuário e o objeto antes de executar a operação. O Realtime propaga atualizações. No perfil full, o servidor usa o Kong na rede interna sem alterar as origens do navegador ou os links de conta. O agendador envia requisições HTTP autenticadas sem navegador. Quando o Numo precisa trabalhar com código, o runner confiável cria sandboxes restritas para o repositório conectado; elas não recebem segredos da instância nem o socket Docker.

## Identificar destinos externos {#providers}

IA, email, Git, MCP remoto, notificações push, analytics e armazenamento externo são destinos separados quando habilitados. Hospedar o Minddy no seu servidor não torna esses serviços locais. No perfil managed, o provedor escolhido opera o backend; full o coloca sob seu controle. O Minddy Cloud opera o serviço e seus provedores, enquanto na instalação própria você configura contas e escolhas. Confira permissões, custos e condições de tratamento de dados. Não deduza o provedor ou a edição Cloud apenas pelo hostname ou pela plataforma de implantação.
