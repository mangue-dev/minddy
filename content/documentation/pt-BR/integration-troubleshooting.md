---
{
  "id": "integration-troubleshooting",
  "locale": "pt-BR",
  "title": "Solução de problemas de conexão",
  "summary": "O minddy MCP conecta um assistente externo ao minddy; o MCP pessoal permite que o Numo chame um servidor externo.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts",
      "lib/server/mcp-http.ts",
      "lib/server/mcp-client.ts",
      "lib/server/safe-fetch.ts",
      "app/api/mcp/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "Recuperar falhas OAuth, MCP, webhook ou Git"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Recuperar falhas OAuth, MCP, webhook ou Git {#integration-troubleshooting}

O minddy MCP conecta um assistente externo ao minddy; o MCP pessoal permite que o Numo chame um servidor externo. Eles usam abas e credenciais diferentes. Confira o estado nas configurações, teste a conexão e reconecte quando necessário. Há suporte a descoberta, registro dinâmico, PKCE e renovação de tokens, mas uma entrada no catálogo não elimina exigências de aprovação, prévia ou cadastro da aplicação pelo provedor. Verifique os pré-requisitos atuais do provedor antes de apontar um defeito.


## Reconectar com o escopo correto {#oauth}

Se o provedor exige uma aplicação cliente já registrada, cadastre exatamente o callback mostrado. No desktop, o OAuth abre o navegador do sistema e retorna ao aplicativo. Servidores MCP pessoais usados pelo Numo precisam de HTTPS público: comandos locais e redes privadas não são aceitos. Para um assistente externo conectado ao MCP do minddy, consulte [o acesso de rede à sua instância](/docs/minddy-mcp#network-access). Coloque bearer tokens e segredos nos campos de autenticação ou nos cabeçalhos, nunca na URL. Alterar a URL apaga credenciais e cabeçalhos. Desativar ou remover uma conexão impede novos envios, mas os já iniciados podem terminar. Rotinas usam o proprietário atual e não herdam o acesso pessoal anterior.

## Inspecionar antes de repetir {#webhooks}

Chamadas do Numo a servidores MCP pessoais têm timeout de 30 segundos, limite de transporte de 1 MiB e resultado máximo de 64 KB. Um timeout não comprova que uma alteração falhou: confira o destino. Para API 401, verifique instância, tipo de chave e revogação sem mostrar a chave; tipo errado retorna 403. Para webhooks, confira estado atual, alcance do destino, HMAC dos bytes originais e `delivery_id`. Eventos descartados não têm uma fila durável de novas tentativas. Preserve códigos e horários sem conteúdo privado ou credenciais.

## Conferir permissões e sincronização {#git}

As integrações Git usam github.com e gitlab.com. Verifique repositório, instalação e canal de conexão. A sincronização GitHub exige Issues com leitura e escrita e os eventos Issues, Issue comments e Issue dependencies; instalações existentes precisam aceitar as permissões novas. Payloads antigos não sobrescrevem edições recentes, e os identificadores remotos evitam duplicatas. As URLs dos anexos continuam no forge: os bytes não são copiados automaticamente. Confira os estados antes de tentar novamente ou reconectar e compartilhe apenas diagnósticos sanitizados.
