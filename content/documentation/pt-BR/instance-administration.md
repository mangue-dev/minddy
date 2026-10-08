---
{
  "id": "instance-administration",
  "locale": "pt-BR",
  "title": "Administração da instância",
  "summary": "Acesse a administração com MFA, use os controles disponíveis e diferencie administração da instância e propriedade do projeto.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
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
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Usar a administração da instância"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-overview.png",
      "alt": "Visão geral administrativa com indicadores agregados de contas, integração inicial e conteúdo.",
      "caption": "Visão geral mostra os indicadores agregados da instância. Finanças não aparece neste perfil de demonstração porque não há chave gerenciada do OpenRouter configurada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-users",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-users.png",
      "alt": "Suporte a contas com busca pelo endereço de email exato, sem diretório de conteúdo pessoal.",
      "caption": "Usuários abre uma conta específica para suporte ou cobrança; a tela inicial não lista atividade privada nem conteúdo pessoal.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/instance-administration-models.png",
      "alt": "Configurações de modelos de IA e raciocínio da instância.",
      "caption": "Modelos configura padrões e usos específicos. A captura mostra a configuração existente; nenhum modelo ou provedor foi alterado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usar a administração da instância {#instance-administration}

Administrar a instância é diferente de ser proprietário de um projeto. ADMIN_EMAILS lista as contas confirmadas autorizadas no servidor; app_metadata.role=admin assinado também é uma fonte válida. São exigidos aal2, MFA verificada e verificações atuais de conta e sessão. Se elas falham, o acesso é negado. Entre, complete TOTP e abra /admin. Não altere papéis no banco para contornar MFA. O console e as APIs privadas continuam noindex.


![Visão geral administrativa com indicadores agregados de contas, integração inicial e conteúdo.](/documentation/pt-BR/instance-administration-overview.png)

![Suporte a contas com busca pelo endereço de email exato, sem diretório de conteúdo pessoal.](/documentation/pt-BR/instance-administration-users.png)

![Configurações de modelos de IA e raciocínio da instância.](/documentation/pt-BR/instance-administration-models.png)

## Usar os controles disponíveis {#panels}

O console inclui Visão geral, Usuários, Modelos e, quando disponível, Finanças. Finanças fica oculto sem OpenRouter gerenciado; a atribuição de plano depende da cobrança habilitada ou de um override já existente. Abrir o console não acrescenta cobrança Cloud a uma instância própria sem provedores comerciais. Confira modelos, padrões, usuários e quotas na versão instalada antes de alterar. As mudanças afetam toda a instância: valide com uma conta de demonstração.

## Manter responsabilidades operacionais {#responsibilities}

Privilégios mínimos, recuperação MFA, segredos, backup, retenção, incidentes e custos continuam sob sua responsabilidade. O console não substitui a restauração de banco e Storage nem a configuração SMTP. Se o acesso for recusado, confira email confirmado, allowlist, MFA e sessão antes de mudar a configuração. Uma sessão revogada ou conta bloqueada não conserva privilégios por ainda ter um JWT válido. Evite capturas com dados privados de outras pessoas, fatores MFA ou detalhes financeiros.
