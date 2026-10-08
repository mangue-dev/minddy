---
{
  "id": "integration-api-and-webhooks",
  "locale": "pt-BR",
  "title": "Criar issues ou feedback e receber webhooks assinados",
  "summary": "O proprietário cria uma integração nas configurações do projeto.",
  "topic": "Conceitos técnicos",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
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
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/integration-api-and-webhooks-flow.svg",
      "alt": "Diagrama: Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.",
      "caption": "Siga as etapas nesta ordem. Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.",
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
    "integration-api-and-webhooks-flow"
  ]
}
---

## Criar issues ou feedback e receber webhooks assinados {#integration-api-and-webhooks}

O proprietário cria uma integração nas configurações do projeto. Uma integração issues envia trabalho para a triagem; uma integração feedback coleta necessidades com votos e status público. A chave mdy_ aparece uma única vez. Guarde-a somente no servidor em MINDDY_API_KEY ou MINDDY_FEEDBACK_KEY, nunca no navegador, no Git ou em logs. A revogação é permanente; uma chave desconhecida ou revogada retorna 401 invalid_api_key. Cada chave pertence a um projeto e a um tipo: usá-la no endpoint errado retorna 403 wrong_key_kind.

![Diagrama: Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.](/documentation/pt-BR/integration-api-and-webhooks-flow.svg)

## Enviar os campos corretos {#send}

GET /api/v1/issues/options retorna categorias, prioridades e esforços disponíveis. POST /api/v1/issues exige um título não vazio e aceita descrição Markdown, prioridade, esforço e categorias opcionais. A issue sempre entra na triagem; externamente não é possível escolher status, responsável ou parent. Os limites são 500 caracteres no título, 65.536 na descrição e 50 identificadores de categoria. A resposta 201 contém id, number, identifier e status. POST /api/v1/feedback exige title e user.external_id e/ou user.email; user.name e body são opcionais. analyze é um booleano, true por padrão. false desativa em conjunto a moderação, a atribuição de categorias e a mesclagem, publicando o texto sem mudanças. A string "false" é rejeitada. Confira review_state e valide a identidade do autor no servidor.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Relato de demonstração","description":"Reproduzir com dados de demonstração","priority":"low","effort":"s"}'
```

## Verificar e deduplicar eventos {#receive}

As integrações issues podem enviar issue.created, issue.status_changed e issue.updated. O proprietário precisa escolher qualquer destino novo de webhook. Agentes podem ajustar eventos e escopo de um destino existente ou desativá-lo, mas não podem abrir um canal novo de saída. O escopo integration inclui apenas issues criadas com aquela chave; all inclui o projeto inteiro. X-Minddy-Signature contém o prefixo sha256= e um HMAC-SHA256 calculado sobre os bytes originais. A chave HMAC é o digest SHA-256 da chave API, representado como uma string hexadecimal minúscula. Compare a assinatura em tempo constante antes de confiar no payload, sem analisá-lo e serializá-lo novamente. X-Minddy-Delivery corresponde a delivery_id: use esse UUID para eliminar duplicatas.

## Tratar falhas e limites {#limits}

A entrega ocorre por melhor esforço: há um timeout de cinco segundos e apenas uma nova tentativa imediata para erros de rede ou respostas 5xx. Depois da segunda falha, o evento é descartado. Duplicatas e entregas fora de ordem são possíveis. Salve o payload verificado, responda logo com 2xx e processe depois. issue.updated agrupa alterações; para description e plan informa somente o nome do campo. Consulte então o estado atual. Para 429 respeite Retry-After; validação retorna 422 e a quota definitiva retorna 403 issue_limit_reached. Um timeout na criação não comprova falha: confira antes de tentar novamente. POST `/api/v1/feedback/<post_id>/vote` é idempotente para a identidade do votante.
