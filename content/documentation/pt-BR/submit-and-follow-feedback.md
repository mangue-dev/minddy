---
{
  "id": "submit-and-follow-feedback",
  "locale": "pt-BR",
  "title": "Enviar, votar e acompanhar feedback",
  "summary": "Identificar-se, escolher visibilidade e encontrar solicitações e votos.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
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
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/submit-and-follow-feedback-workflow.png",
      "alt": "Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.",
      "caption": "Um visitante identificado envia uma necessidade e escolhe sua visibilidade. O exemplo foi realmente enviado com a revisão automática desativada.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## Identificar-se e enviar {#submit-and-follow-feedback}

Abra a URL pública do mural. Você pode ler feedbacks públicos sem uma conta Minddy. Para enviar, votar ou comentar, identifique-se pelo código de email do mural ou pelo link SSO do produto. A entrega do código depende do serviço de email da instância. O código vale por dez minutos e permite cinco tentativas; aguarde ao menos sessenta segundos antes de pedir outro. Nunca compartilhe o código.

Procure solicitações existentes antes de publicar. Escreva um título específico e descreva a necessidade e seu contexto. O título aceita 200 caracteres; o corpo, 10.000. A opção pública vem selecionada por padrão; desmarque-a para enviar a solicitação em privado à equipe. Confira se o texto contém segredos antes de enviar. A moderação opcional pode manter a solicitação pendente antes de sua exibição pública.


## Votar, comentar e acompanhar {#follow}

Vote em uma solicitação existente em vez de duplicá-la. Cada identidade tem um voto por feedback. Para comentar, é necessário identificar-se e os comentários públicos precisam estar habilitados; um comentário público aceita 5.000 caracteres. Você pode remover seu próprio comentário, e a equipe pode moderar comentários públicos.

Abra Meus comentários para encontrar suas solicitações e votos, conforme o que sua identidade atual pode acessar. Leia ali, ou na solicitação, o status público e as respostas da equipe. Notas internas da equipe não são respostas públicas. Se o SSO tiver expirado, volte por um novo link do produto; mudar de navegador ou identidade pode alterar a lista pessoal.

![Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.](/documentation/pt-BR/submit-and-follow-feedback-workflow.png)
