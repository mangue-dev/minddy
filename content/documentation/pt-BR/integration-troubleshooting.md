---
{
  "id": "integration-troubleshooting",
  "locale": "pt-BR",
  "title": "Solução de problemas de conexão",
  "summary": "Encontre a conexão que falhou (minddy MCP, um servidor MCP pessoal, a API, um webhook ou um provedor Git), reconecte-a e confira o resultado antes de tentar de novo.",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-17",
  "compatibility": {
    "version": "0.40.0 (MIN-970 release review)",
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
    "revision": 8,
    "fact": "agent:claude-code (MIN-912: desktop MCP sign-in sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review, MIN-794: source audit of the article against the v0.20.0..0.30.0 delta of its evidence files, no correction needed; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-673: summary lengthened for the page description from facts stated in the article sections; body unchanged; no screenshot in scope); agent:claude-code (0.40.0 release review, MIN-970: source audit against the v0.30.1..0.40.0 delta: commit subjects and targeted commit bodies, quoted labels checked against messages/en.json; no correction needed; translations not reread; no screenshot recaptured; no browser walkthrough of the procedures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-673 summary translated from the English revision with the locale glossary and register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-17"
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

Se o provedor exige uma aplicação cliente já registrada, cadastre exatamente o callback mostrado. No desktop, o login MCP abre só a página do provedor no navegador do sistema e o app o conclui: o navegador não precisa de uma sessão do minddy. Servidores MCP pessoais usados pelo Numo precisam de HTTPS público: comandos locais e redes privadas não são aceitos. Para um assistente externo conectado ao MCP do minddy, consulte [o acesso de rede à sua instância](/docs/minddy-mcp#network-access). Coloque bearer tokens e segredos nos campos de autenticação ou nos cabeçalhos, nunca na URL. Alterar a URL apaga credenciais e cabeçalhos. Desativar ou remover uma conexão impede novos envios, mas os já iniciados podem terminar. Rotinas usam o proprietário atual e não herdam o acesso pessoal anterior.

## Inspecionar antes de repetir {#webhooks}

Chamadas do Numo a servidores MCP pessoais têm timeout de 30 segundos, limite de transporte de 1 MiB e resultado máximo de 64 KB. Um timeout não comprova que uma alteração falhou: confira o destino. Para API 401, verifique instância, tipo de chave e revogação sem mostrar a chave; tipo errado retorna 403. Para webhooks, confira estado atual, alcance do destino, HMAC dos bytes originais e `delivery_id`. Eventos descartados não têm uma fila durável de novas tentativas. Preserve códigos e horários sem conteúdo privado ou credenciais.

## Conferir permissões e sincronização {#git}

As integrações Git usam github.com e gitlab.com. Verifique repositório, instalação e canal de conexão. A sincronização GitHub exige Issues com leitura e escrita e os eventos Issues, Issue comments e Issue dependencies; instalações existentes precisam aceitar as permissões novas. Payloads antigos não sobrescrevem edições recentes, e os identificadores remotos evitam duplicatas. As URLs dos anexos continuam no forge: os bytes não são copiados automaticamente. Confira os estados antes de tentar novamente ou reconectar e compartilhe apenas diagnósticos sanitizados.
