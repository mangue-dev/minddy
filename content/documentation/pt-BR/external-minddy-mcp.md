---
{
  "id": "external-minddy-mcp",
  "locale": "pt-BR",
  "title": "Conectar um assistente externo ao MCP do Minddy",
  "summary": "Autorizar um cliente compatível na instância correta e revogar acesso quando necessário.",
  "topic": "Numo e integrações",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09"
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json"
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
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-workflow.png",
      "alt": "Seletor de clientes MCP Minddy com Claude, Codex e outros assistentes.",
      "caption": "Selecione seu cliente para exibir o comando ou a configuração de instalação.",
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
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-install-workflow.png",
      "alt": "Diálogo de instalação do Codex na instância local.",
      "caption": "Diálogo de instalação do Codex na instância local. Use a origem da sua instância; o comando exibido não foi executado para esta captura.",
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
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/external-minddy-mcp-accesses-workflow.png",
      "alt": "Lista de aplicativos conectados sem autorização ativa.",
      "caption": "Revise aqui os aplicativos autorizados. A conta de demonstração não tem autorizações ativas; nenhuma autorização ou revogação foi executada.",
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
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

## Configurar o cliente {#external-minddy-mcp}
Abra a página pública MCP da instância e escolha as instruções do cliente. Use o endpoint exibido, terminado em `/api/mcp`. Em self-hosted use sua própria origem, não a do Cloud. O cliente precisa aceitar MCP remoto e o fluxo OAuth descrito.

Entre pelo navegador e confira a autorização antes de concedê-la. A conexão age como sua conta Minddy, sem acesso a projetos fora das suas permissões. Comece lendo uma tarefa já acessível e confira o projeto retornado.

![Seletor de clientes MCP Minddy com Claude, Codex e outros assistentes.](/documentation/pt-BR/external-minddy-mcp-workflow.png)


## Escopo e revogação {#access}
Clientes externos usam ferramentas disponíveis para tarefas, planos, comentários, páginas, feedback, ciclos, rotinas e caderno dentro dos acessos autorizados. MCP está disponível em todos os planos Cloud; a IA do cliente ainda depende da configuração e custos dele.

Minddy MCP nas configurações da conta lista acessos externos e controles de revogação. Revogue clientes sem uso ou confiança. MCP para Numo é diferente: conecta o Numo a outros serviços. Não cole tokens em tarefas, feedback público nem capturas.

![Diálogo de instalação do Codex na instância local.](/documentation/pt-BR/external-minddy-mcp-install-workflow.png)

![Lista de aplicativos conectados sem autorização ativa.](/documentation/pt-BR/external-minddy-mcp-accesses-workflow.png)
