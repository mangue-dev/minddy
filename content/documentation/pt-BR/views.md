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
  "revision": 13,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-01",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/share-view-dialog.tsx",
      "components/filter-menu.tsx"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of views-and-filters-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude (searchable filter menus: views-and-filters-steps recaptured on 2026-11-01 from the local candidate against the preview demo account (Aurora) with documentation-work, API writes blocked, image inspected for labels, margins and clipping; filter-menu paragraph checked against components/board-toolbar.tsx and components/filter-menu.tsx; no browser walkthrough of the procedures); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude (pt-BR figure alt text and caption with catalog UI labels; agent self-review, not human acceptance)",
    "date": "2026-11-04"
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
      "alt": "Menu Filtros com o campo de pesquisa, Criar com o Numo, os submenus das propriedades e Classificar.",
      "caption": "Pesquise qualquer valor de filtro, abra o submenu de uma propriedade ou escolha uma ordem. Com Criar com o Numo, você descreve os filtros que quer.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        304,
        448
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-share-view.png",
      "alt": "Janela de compartilhamento de visualização com acesso privado selecionado.",
      "caption": "Acesso privado, protegido por senha e público são escolhas distintas. A visualização continua privada nesta captura.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        496,
        234
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Uma visualização salva filtros e ordenação do trabalho ao qual você tem acesso, sem criar uma cópia dos tickets. Compartilhá-la é uma ação separada: visualizações globais entre projetos não podem ser compartilhadas. Para uma visualização elegível do projeto, confira o conteúdo visível ao visitante antes de distribuir o link.

## Salvar uma visualização do seu trabalho {#views-and-filters}

Comece no quadro de um projeto ou em uma lista pessoal de tickets entre projetos. Use filtros, ordenação e controles de exibição para escolher o trabalho necessário. Confira o escopo antes de salvar: uma visualização pessoal e uma de projeto não representam o mesmo limite de acesso.

Filtre por propriedades disponíveis, como estado, responsável, prioridade, categorias ou objetivo. Ordene o resultado para deixar clara a próxima ação. No kanban, os tickets continuam agrupados por estado; mudar uma visualização não altera estado nem atribuição. Sem um filtro de estado próprio, um quadro mostra apenas **Backlog**, **A fazer**, **Em andamento** e **Em revisão**. Selecione **Concluído** ou **Cancelado** no filtro **Status** para mostrar essas colunas; uma visualização mantém o filtro de estado salvo com ela.

Com a ordenação **Manual**, arraste um cartão dentro da coluna para mudar a posição dele. Pelo teclado, coloque o foco no cartão e pressione Shift+F10, ou clique nele com o botão direito: **Reordenar** oferece **Mover para cima**, **Mover para baixo** e **Mover para o topo**. **Todos os tickets** oferece a mesma entrada, exceto na aba **Ciclo**, cuja ordem é calculada para você.

No menu **Filtros**, cada propriedade abre um submenu. Digite no campo de busca do menu para encontrar um valor de qualquer propriedade; cada resultado indica a propriedade a que pertence, como **Prioridade › Alta**. Em um quadro onde o Numo está disponível, **Criar com o Numo** aparece primeiro no menu e passa para o fim da lista assim que você digita: escolha essa opção para enviar o que você digitou ao Numo, que atualiza os filtros da visualização atual. Escolhida sem nada digitado, ela abre o campo de mensagem do Numo.

Salve a visualização com um nome que descreva seu propósito, selecione-a novamente na barra de visualizações no topo do quadro (um menu em uma tela estreita) e verifique os filtros. Edite ou remova a visualização salva quando o propósito mudar. **Excluir visualização** pede confirmação, e um quadro sempre mantém pelo menos uma visualização própria. Compartilhá-la é uma operação de publicação separada com regras próprias de permissão e revogação.

![Menu Filtros com o campo de pesquisa, Criar com o Numo, os submenus das propriedades e Classificar.](/documentation/pt-BR/work-view-filters.png)

### Resolver resultados vazios ou inesperados {#view-recovery}

Confira todos os filtros, o projeto ativo e sua participação quando tickets esperados não aparecerem. Limpe filtros restritivos antes de supor que dados foram excluídos. Após uma edição, um ticket pode legitimamente sair de uma visualização filtrada. Pesquise seu identificador, ou selecione **Concluído** e **Cancelado** no filtro **Status** de um quadro de projeto sem outros filtros, para inspecionar os valores salvos.

Uma visualização salva não é uma cópia de seus tickets. Excluir a visualização remove sua configuração, enquanto excluir tickets selecionados muda o trabalho subjacente do projeto.

## Compartilhar e revogar uma visualização em modo somente leitura {#share-a-view}

Abra o menu de uma visualização elegível em um quadro do projeto e escolha a ação de compartilhamento. Você precisa ser o proprietário ou um Membro; os leitores mantêm suas visualizações pessoais, mas não podem compartilhar visualizações. Uma visualização pessoal dentro do projeto só pode ser compartilhada pelo próprio usuário. Visualizações globais entre projetos não podem ser compartilhadas. Confira filtros e conteúdo visível antes de publicar. Escolha um link público secreto ou proteção por senha, quando disponíveis; a senha exige pelo menos oito caracteres. Copie o link gerado somente depois que a alteração for salva com sucesso.

Abra o link em outra sessão do navegador, sem sua conta. Confira o subconjunto de tickets, os campos e os conteúdos vinculados que um visitante pode ver. O link público concede acesso somente leitura à visualização, não participação nem permissão de edição no projeto.

Os cartões compartilhados expõem títulos e propriedades exibidas, incluindo nomes dos responsáveis, categorias, nomes dos objetivos, prazos, recorrência e eventuais links para plataformas Git remotas. A projeção pública exclui as descrições dos tickets, o conteúdo dos planos de implementação e os e-mails dos membros. As etiquetas do ticket pai e das relações podem mostrar identificadores de tickets do projeto fora do filtro da visualização. Confira esses nomes e identificadores, além das colunas visíveis; ocultar uma propriedade do cartão não é uma ferramenta geral para censurar conteúdo sensível.

![Janela de compartilhamento de visualização com acesso privado selecionado.](/documentation/pt-BR/work-share-view.png)

### Revogar e conferir {#revoke-view}

Volte aos controles de compartilhamento e torne a visualização privada para revogar a publicação, depois confirme com **Parar de compartilhar**. Compartilhar de novo cria um novo link. Abra o link antigo novamente sem autenticação e confira se o acesso foi negado. A revogação não recupera cópias nem capturas já salvas pelo visitante.

Links secretos de visualizações usam o caminho de publicação de links privados e mantêm `noindex`. Essa política limita a descoberta por mecanismos de busca, mas não equivale a uma senha. Mantenha o link privado se houver conteúdo sensível e use proteção por senha quando apropriado. Não confunda a visualização compartilhada de um usuário com a documentação oficial indexada.

Se o resultado anônimo for diferente do esperado, confira a visualização salva e a configuração antes de encaminhar o link. Verifique o escopo novamente após alterar filtros ou conteúdo vinculado.
