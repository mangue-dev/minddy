---
{
  "id": "share-a-view",
  "locale": "pt-BR",
  "title": "Compartilhar e revogar uma visualização somente leitura",
  "summary": "Publique o subconjunto desejado de problemas sem tornar o visitante membro do projeto.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-share-view.png",
      "alt": "Janela de compartilhamento de visualização com acesso privado selecionado.",
      "caption": "Acesso privado, protegido por senha e público são escolhas distintas. A visualização continua privada nesta captura.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "share-a-view-steps"
  ]
}
---

## Publicar a visualização {#share-a-view}

Abra o menu de uma visualização elegível em um quadro do projeto e escolha a ação de compartilhamento. Você precisa ter acesso ao projeto; uma visualização pessoal dentro dele só pode ser compartilhada pelo próprio usuário. Visualizações globais entre projetos não podem ser compartilhadas. Confira filtros e conteúdo visível antes de publicar. Escolha um link público secreto ou proteção por senha, quando disponíveis; a senha exige pelo menos oito caracteres. Copie o link gerado somente depois que a alteração for salva com sucesso.

Abra o link em outra sessão do navegador, sem sua conta. Confira o subconjunto de problemas, os campos e os conteúdos vinculados que um visitante pode ver. O link público concede acesso somente leitura à visualização, não participação nem permissão de edição no projeto.

Os cartões compartilhados expõem títulos, descrições e propriedades exibidas, incluindo nomes dos responsáveis, categorias, nomes dos objetivos, prazos, recorrência e eventuais links para plataformas Git remotas. A projeção pública exclui o conteúdo dos planos de implementação e os e-mails dos membros. As etiquetas do problema pai e das relações podem mostrar identificadores de problemas do projeto fora do filtro da visualização. Confira essas descrições, nomes e identificadores, além das colunas visíveis; ocultar uma propriedade do cartão não é uma ferramenta geral para censurar conteúdo sensível.

![Janela de compartilhamento de visualização com acesso privado selecionado.](/documentation/pt-BR/work-share-view.png)

## Revogar e conferir {#revoke-view}

Volte aos controles de compartilhamento e torne a visualização privada para revogar a publicação. Abra o link antigo novamente sem autenticação e confira se o acesso foi negado. A revogação não recupera cópias nem capturas já salvas pelo visitante.

Links secretos de visualizações usam o caminho de publicação de links privados e mantêm noindex. Essa política limita a descoberta por mecanismos de busca, mas não equivale a uma senha. Mantenha o link privado se houver conteúdo sensível e use proteção por senha quando apropriado. Não confunda a visualização compartilhada de um usuário com a documentação oficial indexada.

Se o resultado anônimo for diferente do esperado, confira a visualização salva e a configuração antes de encaminhar o link. Verifique o escopo novamente após alterar filtros ou conteúdo vinculado.
