---
{
  "id": "publish-a-feedback-board",
  "locale": "pt-BR",
  "title": "Publicar um quadro de feedback",
  "summary": "Ativar visitantes e configurar identidade, exibição e revisão como proprietário.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/publish-a-feedback-board-workflow.png",
      "alt": "Mural público de feedback ativado, com identidade SSO local configurada e URL oculta.",
      "caption": "O proprietário ativa o mural e escolhe a identidade dos visitantes. Este exemplo usa um assinador SSO local; a URL e o segredo de assinatura estão ocultos.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Configurar e abrir {#publish-a-feedback-board}

Como proprietário, abra Feedback nas configurações do projeto. Conclua a configuração caso ainda não exista um mural e ative o canal do mural público. Copie a URL pública e abra-a em um navegador sem sessão para conferir a visão dos visitantes. Os membros podem consultar as configurações, mas não alterar a publicação, renovar tokens ou gerenciar o segredo SSO.

Escolha se os visitantes se identificam por código de email ou pelo SSO configurado. Configure comentários públicos, exibição de categorias e as guias de páginas ou visualizações públicas selecionadas. Confira os dados visíveis antes de divulgar a URL. Os visitantes podem ler sem identificação; enviar feedback, votar e comentar exige uma identidade no mural. A representação pública não expõe email nem nome real dos visitantes, mas a equipe pode tratar os feedbacks identificados de forma privada.


## Separar publicação e ingestão {#channels}

Desativar o mural torna suas páginas indisponíveis para os visitantes. A recepção entre servidores usa uma chave de integração de feedback separada e pode continuar sem mural público. A escolha de visibilidade de um feedback, seu estado de revisão e seu status de spam também controlam sua exibição; ativar o mural não publica, por si só, todos os feedbacks.

A revisão opcional do Numo se aplica aos feedbacks enviados e depende das configurações do projeto e da instância, dos provedores e do orçamento do proprietário. Se estiver ativa, os envios aguardam revisão antes da publicação; se estiver desativada, não esperam uma revisão que não ocorrerá. Confira a fila depois de enviar um exemplo de demonstração. O Numo só envia respostas públicas quando solicitado explicitamente.

![Mural público de feedback ativado, com identidade SSO local configurada e URL oculta.](/documentation/pt-BR/publish-a-feedback-board-workflow.png)
