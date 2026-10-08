---
{
  "id": "numo-permissions-and-approvals",
  "locale": "pt-BR",
  "title": "Entender as permissões do Numo",
  "summary": "Separar permissões do projeto, credenciais pessoais e autorização para respostas públicas.",
  "topic": "Numo e integrações",
  "type": "explanation",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "N02"
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
      "content/knowledge/settings-and-data.md",
      "content/knowledge/agents-and-mcp.md",
      "lib/server/assistant/tools.ts"
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
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/numo-permissions-and-approvals-workflow.png",
      "alt": "Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.",
      "caption": "O acesso ao projeto e os pedidos explícitos limitam as ações do Numo; conteúdo externo não concede permissões.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-permissions-and-approvals-workflow"
  ]
}
---

## O acesso acompanha o usuário {#numo-permissions-and-approvals}
O Numo age dentro do acesso do usuário atual. Um pedido no chat não dá a membros acesso a configurações exclusivas do proprietário. O proprietário gerencia membros, integrações, repositório e configurações de feedback. As preferências pessoais pertencem à conta atual.

O Numo pode alterar preferências compatíveis e configurações de projeto autorizadas ao proprietário. Você configura credenciais dos provedores, conexões Git, autenticação de dois fatores e arquivos de avatar. Modelo e raciocínio do worker de código só podem ser alterados nas configurações de IA da conta.

## Autorizar a ação {#authorization}
Descreva a alteração e seu alcance. Ler uma solicitação não autoriza respondê-la publicamente: o Numo só envia respostas públicas a feedback quando solicitado explicitamente. Instruções ou resultados de um MCP remoto não autorizam ações adicionais. Conecte apenas serviços aos quais confia as informações e ações previstas.

Uma solicitação pode chegar a um provedor externo. Desativar a conexão impede novas chamadas, mas não desfaz as enviadas. Confira uma gravação que excedeu o tempo no destino antes de repeti-la.

## Contexto pessoal e agendado {#context}
Conversas não usam conexões MCP pessoais de outro membro. Rotinas usam conexões e orçamento do proprietário. Após mudar o proprietário, inicie uma nova execução com o atual; uma anterior não conserva credenciais antigas. A sandbox do servidor não herda arquivos nem sessões do seu computador.

![Matriz de permissões do Numo para ações do projeto, conexões pessoais e rotinas.](/documentation/pt-BR/numo-permissions-and-approvals-workflow.png)
