---
{
  "id": "api-and-webhooks",
  "locale": "pt-BR",
  "title": "API, webhooks e SSO do feedback",
  "summary": "Crie problemas ou feedback pela API de integração, verifique webhooks assinados e autentique visitantes do feedback com SSO.",
  "topic": "Conceitos técnicos",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Criar problemas ou feedback e receber webhooks assinados",
    "Conectar a ingestão de feedback e a identificação por SSO",
    "Criar issues ou feedback e receber webhooks assinados"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/integration-api-and-webhooks-flow.svg",
      "alt": "Diagrama: Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.",
      "caption": "Siga as etapas nesta ordem. Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Servidor mantém chave da integração"
          },
          {
            "title": "POST issues ou feedback com tipo correto"
          },
          {
            "title": "Proprietário escolhe destino do webhook"
          },
          {
            "title": "Receptor verifica HMAC bruto e UUID"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Sequências separadas de ingestão pelo backend e SSO do navegador, com segredos distintos.",
      "caption": "A chave de ingestão autentica chamadas do servidor. O segredo SSO do mural assina um token de visitante curto e de uso único.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Dois fluxos de feedback separados",
        "columns": [
          {
            "title": "Ingestão pelo servidor",
            "items": [
              "O backend guarda a chave de feedback",
              "POST /api/v1/feedback com chave Bearer e identidade estável",
              "HTTP 201: post salvo na caixa da equipe; o quadro pode estar desativado"
            ]
          },
          {
            "title": "SSO do visitante no navegador",
            "items": [
              "O backend guarda o segredo SSO separado do quadro",
              "Assinar JWT HS256: sub, exp, jti único; validade ≤ 600 s",
              "Redirecionar navegador a /f/<board-token>?sso=<jwt>",
              "Token de uso único cria sessão; abrir Meus comentários"
            ]
          }
        ],
        "note": "Nunca enviar chave de ingestão ou segredo SSO ao navegador. Tolerância de relógio: 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

A API de integração recebe problemas e feedback por chaves do projeto; os webhooks notificam eventos com uma assinatura que precisa ser verificada. O proprietário configura chaves e destinos. O SSO identifica os visitantes do quadro de feedback pelo seu backend, sem expor segredos ao navegador.

## Criar problemas ou feedback e receber webhooks assinados {#integration-api-and-webhooks}

O proprietário cria uma integração nas configurações do projeto. Uma integração issues envia trabalho para a triagem; uma integração feedback coleta necessidades com votos e status público. A chave mdy_ aparece uma única vez. Guarde-a somente no servidor em MINDDY_API_KEY ou MINDDY_FEEDBACK_KEY, nunca no navegador, no Git ou em logs. A revogação é permanente; uma chave desconhecida ou revogada retorna 401 invalid_api_key. Cada chave pertence a um projeto e a um tipo: usá-la no endpoint errado retorna 403 wrong_key_kind.

![Diagrama: Servidor mantém chave da integração. POST issues ou feedback com tipo correto. Proprietário escolhe destino do webhook. Receptor verifica HMAC bruto e UUID.](/documentation/pt-BR/integration-api-and-webhooks-flow.svg)

### Enviar os campos corretos {#send}

GET /api/v1/issues/options retorna categorias, prioridades e esforços disponíveis. POST /api/v1/issues exige um título não vazio e aceita descrição Markdown, prioridade, esforço e categorias opcionais.

| Campo | Limite |
| --- | --- |
| Título | 500 caracteres |
| Descrição | 65.536 caracteres |
| Categorias | 50 identificadores |

A issue sempre entra na triagem; externamente não é possível escolher status, responsável ou parent. A resposta 201 contém id, number, identifier e status. Para os campos do feedback, a identidade do autor e a moderação, siga o [procedimento de ingestão de feedback](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Relato de demonstração","description":"Reproduzir com dados de demonstração","priority":"low","effort":"s"}'
```

### Verificar e deduplicar eventos {#receive}

As integrações issues podem enviar issue.created, issue.status_changed e issue.updated. O proprietário precisa escolher qualquer destino novo de webhook. Agentes podem ajustar eventos e escopo de um destino existente ou desativá-lo, mas não podem abrir um canal novo de saída. O escopo integration inclui apenas issues criadas com aquela chave; all inclui o projeto inteiro.

X-minddy-Signature contém o prefixo sha256= e um HMAC-SHA256 calculado sobre os bytes originais. A chave HMAC é o digest SHA-256 da chave API, representado como uma string hexadecimal minúscula. Compare a assinatura em tempo constante antes de confiar no payload, sem analisá-lo e serializá-lo novamente. X-minddy-Delivery corresponde a delivery_id: use esse UUID para eliminar duplicatas.

### Tratar falhas e limites {#limits}

A entrega ocorre por melhor esforço: há um timeout de cinco segundos e apenas uma nova tentativa imediata para erros de rede ou respostas 5xx. Depois da segunda falha, o evento é descartado. Duplicatas e entregas fora de ordem são possíveis. Salve o payload verificado, responda logo com 2xx e processe depois. issue.updated agrupa alterações; para description e plan informa somente o nome do campo. Consulte então o estado atual. Para 429 respeite Retry-After; validação retorna 422 e a quota definitiva retorna 403 issue_limit_reached. Um timeout na criação não comprova falha: confira antes de tentar novamente. A votação de feedback tem um [endpoint e limites próprios](#errors).

## Conectar a ingestão de feedback e a identificação por SSO {#feedback-ingestion-and-sso}

O proprietário do projeto cria a chave de integração de feedback nas configurações. Salve o valor, exibido uma única vez, como `MINDDY_FEEDBACK_KEY` na configuração de segredos do backend. Nunca inclua a chave no código do navegador. Use a origem da instância de destino para `MINDDY_ORIGIN`, sem a barra final.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback" \
  -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Mostrar a data de entrega","body":"Nossa equipe de suporte precisa da data prevista.","user":{"external_id":"demo-user-1","name":"Leitor de demonstração"}}'
```

Informe um título não vazio, com até 200 caracteres, um corpo opcional de até 10.000 caracteres e `user.external_id` e/ou `user.email`. O ID externo aceita até 255 caracteres; o email, 254; o nome, 200. Seu backend responde pela identidade informada: a ingestão anônima é rejeitada. O sucesso retorna HTTP 201 com `id`, `status`, `review_state`, votos e pseudônimo. Não é necessário ativar o mural para receber feedback por essa API. `user.name` é opcional. `analyze` é um booleano, true por padrão; a string "false" é rejeitada. false ignora a moderação, a categorização e a união de duplicatas para esse post, publica o texto sem mudanças e define o estado de revisão como `published`, sem espera. Confira `review_state` e valide a identidade do autor no servidor. Esse estado de revisão não ativa o mural nem contorna as regras de visibilidade ou o status de spam. A API cria posts públicos por padrão e não aceita um parâmetro de visibilidade privada.

### Votos, erros e webhooks {#errors}

Envie `{"user":{"external_id":"demo-user-1"}}` por POST a `/api/v1/feedback/<id>/vote`, com os mesmos cabeçalhos. Cada identidade recebe um voto; repetir a votação é idempotente. Um post unido a outro retorna 409 `post_merged`, indicando o destino canônico.

A criação permite 20 chamadas por minuto por chave; a votação, 60. Respeite `Retry-After` ao receber 429. Verifique 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` e os erros de campos 422 antes de tentar novamente. A criação não é uma atualização idempotente: se a resposta se perder, confira a caixa de feedback da equipe antes de repetir. As chaves de feedback não oferecem webhook de tarefas de saída. Uma integração de tarefas configurada separadamente oferece esse canal, com assinatura própria e entrega sem garantia.

### Identificar visitantes por SSO {#sso}

Como proprietário, ative o mural e configure seu segredo SSO separado. O backend assina um JWT HS256 com `sub` estável, `exp` obrigatório e email/nome opcionais. Use no máximo 600 segundos de validade e um `jti` único; a verificação tolera 60 segundos de diferença entre os relógios. Redirecione imediatamente para `/f/<board-token>?sso=<jwt>`. O token só pode ser consumido uma vez por mural; uma nova tentativa exige outro token assinado. Nunca use a chave de ingestão como segredo SSO. Mantenha os tokens fora de logs e capturas compartilhadas.

Verifique se o visitante abre Meus comentários com a identidade esperada. Um token expirado exige um novo redirecionamento. Se o segredo estiver comprometido, use a confirmação para rotacioná-lo no mural e atualize o backend ao mesmo tempo. O código por email continua disponível como alternativa quando o SSO não estiver acessível.

![Sequências separadas de ingestão pelo backend e SSO do navegador, com segredos distintos.](/documentation/pt-BR/feedback-ingestion-and-sso-workflow.svg)
