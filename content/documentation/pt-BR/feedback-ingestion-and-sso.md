---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "pt-BR",
  "title": "Conectar a ingestão de feedback e a identificação por SSO",
  "summary": "Mantenha as chaves no servidor e assine tokens de identidade curtos com um segredo separado do mural.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/feedback-ingestion-and-sso-workflow.png",
      "alt": "Sequências separadas de ingestão pelo backend e SSO do navegador, com segredos distintos.",
      "caption": "A chave de ingestão autentica chamadas do servidor. O segredo SSO do mural assina um token de visitante curto e de uso único.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Enviar pelo backend {#feedback-ingestion-and-sso}
O proprietário do projeto cria a chave de integração de feedback nas configurações. Salve o valor, exibido uma única vez, como `MINDDY_FEEDBACK_KEY` na configuração de segredos do backend. Nunca inclua a chave no código do navegador. Use a origem da instância de destino para `MINDDY_ORIGIN`, sem a barra final.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback" \
  -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Mostrar a data de entrega","body":"Nossa equipe de suporte precisa da data prevista.","user":{"external_id":"demo-user-1","name":"Leitor de demonstração"}}'
```

Informe um título não vazio, com até 200 caracteres, um corpo opcional de até 10.000 caracteres e `user.external_id` e/ou `user.email`. O ID externo aceita até 255 caracteres; o email, 254; o nome, 200. Seu backend responde pela identidade informada: a ingestão anônima é rejeitada. O sucesso retorna HTTP 201 com `id`, `status`, `review_state`, votos e pseudônimo. Não é necessário ativar o mural para receber feedback por essa API. `analyze` é true por padrão; false ignora a moderação, a categorização e a união de duplicatas para esse post e define o estado de revisão como `published`, sem espera. Esse estado de revisão não ativa o mural nem contorna as regras de visibilidade ou o status de spam. A API cria posts públicos por padrão e não aceita um parâmetro de visibilidade privada.

## Votos, erros e webhooks {#errors}
Envie `{"user":{"external_id":"demo-user-1"}}` por POST a `/api/v1/feedback/<id>/vote`, com os mesmos cabeçalhos. Cada identidade recebe um voto; repetir a votação é idempotente. Um post unido a outro retorna 409 `post_merged`, indicando o destino canônico.

A criação permite 20 chamadas por minuto por chave; a votação, 60. Respeite `Retry-After` ao receber 429. Verifique 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` e os erros de campos 422 antes de tentar novamente. A criação não é uma atualização idempotente: se a resposta se perder, confira a caixa de feedback da equipe antes de repetir. As chaves de feedback não oferecem webhook de tarefas de saída. Uma integração de tarefas configurada separadamente oferece esse canal, com assinatura própria e entrega sem garantia.

## Identificar visitantes por SSO {#sso}
Como proprietário, ative o mural e configure seu segredo SSO separado. O backend assina um JWT HS256 com `sub` estável, `exp` obrigatório e email/nome opcionais. Use no máximo 600 segundos de validade e um `jti` único; a verificação tolera 60 segundos de diferença entre os relógios. Redirecione imediatamente para `/f/<board-token>?sso=<jwt>`. O token só pode ser consumido uma vez por mural; uma nova tentativa exige outro token assinado. Nunca use a chave de ingestão como segredo SSO. Mantenha os tokens fora de logs e capturas compartilhadas.

Verifique se o visitante abre Meus comentários com a identidade esperada. Um token expirado exige um novo redirecionamento. Se o segredo estiver comprometido, use a confirmação para rotacioná-lo no mural e atualize o backend ao mesmo tempo. O código por email continua disponível como alternativa quando o SSO não estiver acessível.

![Sequências separadas de ingestão pelo backend e SSO do navegador, com segredos distintos.](/documentation/pt-BR/feedback-ingestion-and-sso-workflow.png)
