---
{
  "id": "integration-troubleshooting",
  "locale": "pt-BR",
  "title": "Recuperar falhas OAuth, MCP, webhook ou Git",
  "summary": "O Minddy MCP conecta um assistente externo ao Minddy; o MCP pessoal permite que o Numo chame um servidor externo.",
  "topic": "Conceitos técnicos",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-api-and-webhooks",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-troubleshooting-flow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/integration-troubleshooting-error.png",
      "alt": "Erro ao carregar conexões MCP com o botão Tentar novamente.",
      "caption": "Tentar novamente recarrega as conexões quando a rede volta a estar disponível.",
      "revision": 1,
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
    "integration-troubleshooting-flow"
  ]
}
---

## Recuperar falhas OAuth, MCP, webhook ou Git {#integration-troubleshooting}

O Minddy MCP conecta um assistente externo ao Minddy; o MCP pessoal permite que o Numo chame um servidor externo. Eles usam abas e credenciais diferentes. Confira o estado nas configurações, teste a conexão e reconecte quando necessário. Há suporte a descoberta, registro dinâmico, PKCE e renovação de tokens, mas uma entrada no catálogo não elimina exigências de aprovação, prévia ou cadastro da aplicação pelo provedor. Verifique os pré-requisitos atuais do provedor antes de apontar um defeito.


![Erro ao carregar conexões MCP com o botão Tentar novamente.](/documentation/pt-BR/integration-troubleshooting-error.png)

## Reconectar com o escopo correto {#oauth}

Se o provedor exige uma aplicação cliente já registrada, cadastre exatamente o callback mostrado. No desktop, o OAuth abre o navegador do sistema e retorna ao aplicativo. Servidores MCP pessoais precisam de HTTPS público: comandos locais e redes privadas não são aceitos. Coloque bearer tokens e segredos nos campos de autenticação ou nos cabeçalhos, nunca na URL. Alterar a URL apaga credenciais e cabeçalhos. Desativar ou remover uma conexão impede novos envios, mas os já iniciados podem terminar. Rotinas usam o proprietário atual e não herdam o acesso pessoal anterior.

## Inspecionar antes de repetir {#webhooks}

Chamadas MCP remotas têm timeout de 30 segundos, limite de transporte de 1 MiB e resultado máximo de 64 KB. Um timeout não comprova que uma alteração falhou: confira o destino. Para API 401, verifique instância, tipo de chave e revogação sem mostrar a chave; tipo errado retorna 403. Para webhooks, confira estado atual, alcance do destino, HMAC dos bytes originais e delivery_id. Eventos descartados não têm uma fila durável de novas tentativas. Preserve códigos e horários sem conteúdo privado ou credenciais.

## Conferir permissões e sincronização {#git}

As integrações Git usam github.com e gitlab.com. Verifique repositório, instalação e canal de conexão. A sincronização GitHub exige Issues com leitura e escrita e os eventos Issues, Issue comments e Issue dependencies; instalações existentes precisam aceitar as permissões novas. Payloads antigos não sobrescrevem edições recentes, e os identificadores remotos evitam duplicatas. As URLs dos anexos continuam no forge: os bytes não são copiados automaticamente. Confira os estados antes de tentar novamente ou reconectar e compartilhe apenas diagnósticos sanitizados.
