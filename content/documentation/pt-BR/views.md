---
{
  "id": "views",
  "locale": "pt-BR",
  "title": "Visualizações e filtros",
  "summary": "Salve uma visualização filtrada do trabalho acessível, compartilhe-a somente para leitura e revogue o acesso público quando necessário.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Salvar uma visualização do seu trabalho",
    "Compartilhar e revogar uma visualização em modo somente leitura",
    "Compartilhar e revogar uma visualização somente leitura"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-view-filters.png",
      "alt": "Filtros manuais de uma visualização e menu de ordenação.",
      "caption": "Filtre pelas propriedades dos tickets ou escolha uma ordem. O campo de IA é opcional para esses controles manuais.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        393
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-share-view.png",
      "alt": "Janela de compartilhamento de visualização com acesso privado selecionado.",
      "caption": "Acesso privado, protegido por senha e público são escolhas distintas. A visualização continua privada nesta captura.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Uma visualização salva filtros e ordenação do trabalho ao qual você tem acesso, sem criar uma cópia dos problemas. Compartilhá-la é uma ação separada: visualizações globais entre projetos não podem ser compartilhadas. Para uma visualização elegível do projeto, confira o conteúdo visível ao visitante antes de distribuir o link.

## Salvar uma visualização do seu trabalho {#views-and-filters}

Comece no quadro de um projeto ou em uma lista pessoal de problemas entre projetos. Use filtros, ordenação e controles de exibição para escolher o trabalho necessário. Confira o escopo antes de salvar: uma visualização pessoal e uma de projeto não representam o mesmo limite de acesso.

Filtre por propriedades disponíveis, como estado, responsável, prioridade, categorias ou objetivo. Ordene o resultado para deixar clara a próxima ação. No kanban, os problemas continuam agrupados por estado; mudar uma visualização não altera estado nem atribuição.

Salve a visualização com um nome que descreva seu propósito, selecione-a novamente na navegação e verifique os filtros. Edite ou remova a visualização salva quando o propósito mudar. Compartilhá-la é uma operação de publicação separada com regras próprias de permissão e revogação.

![Filtros manuais de uma visualização e menu de ordenação.](/documentation/pt-BR/work-view-filters.png)

### Resolver resultados vazios ou inesperados {#view-recovery}

Confira todos os filtros, o projeto ativo e sua participação quando problemas esperados não aparecerem. Limpe filtros restritivos antes de supor que dados foram excluídos. Após uma edição, um problema pode legitimamente sair de uma visualização filtrada. Pesquise seu identificador ou use um quadro de projeto sem filtros para inspecionar os valores salvos.

Uma visualização salva não é uma cópia de seus problemas. Excluir a visualização remove sua configuração, enquanto excluir problemas selecionados muda o trabalho subjacente do projeto.

## Compartilhar e revogar uma visualização em modo somente leitura {#share-a-view}

Abra o menu de uma visualização elegível em um quadro do projeto e escolha a ação de compartilhamento. Você precisa ter acesso ao projeto; uma visualização pessoal dentro dele só pode ser compartilhada pelo próprio usuário. Visualizações globais entre projetos não podem ser compartilhadas. Confira filtros e conteúdo visível antes de publicar. Escolha um link público secreto ou proteção por senha, quando disponíveis; a senha exige pelo menos oito caracteres. Copie o link gerado somente depois que a alteração for salva com sucesso.

Abra o link em outra sessão do navegador, sem sua conta. Confira o subconjunto de problemas, os campos e os conteúdos vinculados que um visitante pode ver. O link público concede acesso somente leitura à visualização, não participação nem permissão de edição no projeto.

Os cartões compartilhados expõem títulos, descrições e propriedades exibidas, incluindo nomes dos responsáveis, categorias, nomes dos objetivos, prazos, recorrência e eventuais links para plataformas Git remotas. A projeção pública exclui o conteúdo dos planos de implementação e os e-mails dos membros. As etiquetas do problema pai e das relações podem mostrar identificadores de problemas do projeto fora do filtro da visualização. Confira essas descrições, nomes e identificadores, além das colunas visíveis; ocultar uma propriedade do cartão não é uma ferramenta geral para censurar conteúdo sensível.

![Janela de compartilhamento de visualização com acesso privado selecionado.](/documentation/pt-BR/work-share-view.png)

### Revogar e conferir {#revoke-view}

Volte aos controles de compartilhamento e torne a visualização privada para revogar a publicação. Abra o link antigo novamente sem autenticação e confira se o acesso foi negado. A revogação não recupera cópias nem capturas já salvas pelo visitante.

Links secretos de visualizações usam o caminho de publicação de links privados e mantêm noindex. Essa política limita a descoberta por mecanismos de busca, mas não equivale a uma senha. Mantenha o link privado se houver conteúdo sensível e use proteção por senha quando apropriado. Não confunda a visualização compartilhada de um usuário com a documentação oficial indexada.

Se o resultado anônimo for diferente do esperado, confira a visualização salva e a configuração antes de encaminhar o link. Verifique o escopo novamente após alterar filtros ou conteúdo vinculado.
