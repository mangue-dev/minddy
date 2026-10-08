---
{
  "id": "numo-mcp-connections",
  "locale": "pt-BR",
  "title": "Conectar um serviço MCP pessoal ao Numo",
  "summary": "Autenticar um serviço confiável e gerenciar a conexão sem expor segredos.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N08"
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
      "content/knowledge/agents-and-mcp.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/numo-mcp-connections-workflow.png",
      "alt": "Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.",
      "caption": "As conexões de Numo são pessoais; as rotinas usam as do proprietário do projeto.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/numo-mcp-connections-config-workflow.png",
      "alt": "Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos.",
      "caption": "Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos. Nenhuma credencial foi inserida e nenhum servidor foi contatado.",
      "revision": 1,
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
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

## Conectar e autenticar {#numo-mcp-connections}
Abra MCP para Numo nas configurações da conta. Escolha um serviço ou adicione outro servidor MCP HTTPS público. Catálogo e registro não dispensam cadastro ou aprovação do provedor. O Numo pode preparar a conexão em conversa interativa, mas uma rotina autônoma não pode criá-la.

Use OAuth ou configurações avançadas para token bearer, sem autenticação ou cabeçalhos criptografados. Streamable HTTP é o padrão; SSE antigo também é compatível. Coloque segredos em credenciais ou cabeçalhos, nunca na URL. Comandos locais e redes privadas não são suportados. Para um app OAuth existente, registre a URL de retorno exibida e informe ID e segredo. No desktop OAuth abre o navegador do sistema e retorna ao app.

![Configurações MCP pessoais, lista vazia e botão para adicionar outro servidor.](/documentation/pt-BR/numo-mcp-connections-workflow.png)


## Testar e gerenciar {#manage}
O menu permite testar, editar, reconectar, desativar ou remover. Um aviso laranja de autenticação exige reconexão. Campos vazios preservam credenciais; mudar a URL apaga credenciais e cabeçalhos. Remova o token bearer pelo controle específico; `{}` apaga cabeçalhos.

Desativar bloqueia chamadas novas, não enviadas. Limites: 30 segundos, 1 MiB de transporte e 64 KB de resultado. Confira gravações com tempo esgotado no destino antes de repetir. Rotinas usam conexões do proprietário; outros membros não podem usá-las emprestadas.

![Formulário de servidor MCP personalizado com configurações avançadas de autenticação, transporte e cabeçalhos.](/documentation/pt-BR/numo-mcp-connections-config-workflow.png)
