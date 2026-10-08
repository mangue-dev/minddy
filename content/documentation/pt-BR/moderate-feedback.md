---
{
  "id": "moderate-feedback",
  "locale": "pt-BR",
  "title": "Revisar feedback em privado e responder publicamente",
  "summary": "Tratar solicitações sem expor notas nem reescrever visitantes.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
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
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
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
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/moderate-feedback-workflow.png",
      "alt": "Detalhe de feedback com resposta pública da equipe e nota interna.",
      "caption": "O selo Público identifica a resposta visível aos visitantes; a nota interna fica com a equipe. Nenhum resultado de moderação por IA é mostrado.",
      "revision": 2,
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
    "moderate-feedback-workflow"
  ]
}
---

## Revisar uma solicitação {#moderate-feedback}

Os membros abrem Feedback no projeto e selecionam uma solicitação da fila de revisão ou da lista. Leia o envio original, a escolha pública ou privada, o estado de revisão e as sugestões de moderação ou duplicatas. É possível esclarecer o título e o corpo canônicos sem perder os textos originais enviados. Atribua categorias e um status público adequado; spam nunca aparece no mural público. Uma solicitação privada continua distinta de uma solicitação pública que apenas está pendente.

A tradução opcional aparece ao lado do texto original para a equipe; o mural público mantém o feedback como foi escrito. Confira as classificações de IA antes de confiar nelas. Se um feedback estiver vinculado a uma tarefa, seu status será controlado por essa tarefa e não poderá ser editado de forma independente.


## Notas e respostas públicas {#responses}

Escolha a discussão interna para as notas da equipe. Respostas públicas ficam visíveis aos visitantes; confira a visibilidade antes de enviar. As respostas herdam a visibilidade da conversa, por isso escolher o modo interno no campo de composição não torna privada uma resposta em uma conversa pública. Respostas públicas do Numo exigem uma solicitação explícita; mencioná-lo em um comentário público não provoca uma resposta automática.

Os membros podem excluir comentários públicos para moderá-los. Só o autor pode editá-los, e a equipe nunca reescreve as palavras dos visitantes. Comentários internos mantêm as regras que reservam essas ações ao autor. Depois de uma resposta pública ou ação de moderação, consulte o mural sem sessão para confirmar a visibilidade pretendida.

![Detalhe de feedback com resposta pública da equipe e nota interna.](/documentation/pt-BR/moderate-feedback-workflow.png)
