---
{
  "id": "feedback-pages-and-views",
  "locale": "pt-BR",
  "title": "Adicionar páginas e visualizações públicas ao quadro",
  "summary": "Selecionar conteúdo publicado sem expor nomes ou links protegidos.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
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
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-pages-and-views-workflow.png",
      "alt": "Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.",
      "caption": "Publique uma página, ative as guias de páginas e selecione-a para o mural. Esta página de demonstração foi aberta anonimamente; seu URL opaco mantém noindex.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Publicar e selecionar {#feedback-pages-and-views}

Como proprietário do projeto, publique primeiro a página desejada ou compartilhe a visualização desejada com visibilidade pública. Confira se o conteúdo contém informações privadas. Abra as configurações de Feedback, habilite a família de páginas ou visualizações e selecione cada item que deve aparecer. Tanto o controle da família quanto a seleção individual são necessários.

A lista de configurações pode conter compartilhamentos protegidos, mas a navegação pública inclui apenas os de nível público. Selecionar uma página protegida não contorna sua proteção nem expõe seu nome em uma guia do mural. Um item publicado de outro projeto não faz parte das guias deste projeto.


## Conferir e remover acesso {#visibility}

Abra o mural sem sessão. Siga as guias até as páginas e visualizações selecionadas e confira os títulos e os conteúdos. Quando configurada, a navegação é compartilhada pelo mural, pelas visualizações públicas e pelas páginas públicas; uma guia isolada não é exibida como navegação.

Para remover uma guia, desmarque o item ou desative sua família. Isso remove a navegação, não o compartilhamento subjacente. Revogue ou altere o próprio compartilhamento para remover o acesso pelo link direto. Desativar o mural também desativa a navegação associada, mas não revoga de forma independente todos os compartilhamentos de páginas ou visualizações. Depois de alterar a publicação, confira a guia do mural e a URL original do compartilhamento.

![Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.](/documentation/pt-BR/feedback-pages-and-views-workflow.png)
