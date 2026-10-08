---
{
  "id": "feedback",
  "locale": "pt-BR",
  "title": "Feedback",
  "summary": "Publique um quadro de feedback, acompanhe solicitações, modere contribuições e vincule o feedback aceito ao trabalho do projeto.",
  "topic": "Feedback e solicitações",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/feedback-local-capture-candidates.json",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Publicar um quadro de feedback",
    "Enviar, votar e acompanhar feedback",
    "Revisar feedback em privado e responder publicamente",
    "Unir feedback e conectar à entrega",
    "Adicionar páginas e visualizações públicas ao quadro"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/publish-a-feedback-board-workflow.png",
      "alt": "Mural público de feedback ativado, com identidade SSO local configurada e URL oculta.",
      "caption": "O proprietário ativa o mural e escolhe a identidade dos visitantes. Este exemplo usa um assinador SSO local; a URL e o segredo de assinatura estão ocultos.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/submit-and-follow-feedback-workflow.png",
      "alt": "Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.",
      "caption": "Um visitante identificado envia uma necessidade e escolhe sua visibilidade. O exemplo foi realmente enviado com a revisão automática desativada.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    },
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/moderate-feedback-workflow.png",
      "alt": "Detalhe de feedback com resposta pública da equipe e nota interna.",
      "caption": "O selo Público identifica a resposta visível aos visitantes; a nota interna fica com a equipe. Nenhum resultado de moderação por IA é mostrado.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-to-issue-workflow.png",
      "alt": "Feedback vinculado a uma tarefa recém-criada, com status Planejado.",
      "caption": "A promoção deste exemplo criou uma tarefa vinculada com status A fazer. O status do feedback público mudou automaticamente para Planejado.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-pages-and-views-workflow.png",
      "alt": "Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.",
      "caption": "Publique uma página, ative as guias de páginas e selecione-a para o mural. Esta página de demonstração foi aberta anonimamente; seu URL opaco mantém noindex.",
      "revision": 3,
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
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "moderate-feedback-workflow",
    "feedback-to-issue-workflow",
    "feedback-pages-and-views-workflow"
  ]
}
---

O quadro de feedback reúne solicitações e votos com status público, separados da discussão interna do projeto. O proprietário configura a publicação; as seções a seguir descrevem envio, moderação, vínculo com problemas e inclusão de páginas ou visualizações públicas.

## Publicar um quadro de feedback {#publish-a-feedback-board}

Como proprietário, abra Feedback nas configurações do projeto. Conclua a configuração caso ainda não exista um mural e ative o canal do mural público. Copie a URL pública e abra-a em um navegador sem sessão para conferir a visão dos visitantes. Os membros podem consultar as configurações, mas não alterar a publicação, renovar tokens ou gerenciar o segredo SSO.

Escolha se os visitantes se identificam por código de email ou pelo SSO configurado. Configure comentários públicos, exibição de categorias e as guias de páginas ou visualizações públicas selecionadas. Confira os dados visíveis antes de divulgar a URL. Os visitantes podem ler sem identificação; enviar feedback, votar e comentar exige uma identidade no mural. A representação pública não expõe email nem nome real dos visitantes, mas a equipe pode tratar os feedbacks identificados de forma privada.

### Separar publicação e ingestão {#channels}

Desativar o mural torna suas páginas indisponíveis para os visitantes. A recepção entre servidores usa uma chave de integração de feedback separada e pode continuar sem mural público. A escolha de visibilidade de um feedback, seu estado de revisão e seu status de spam também controlam sua exibição; ativar o mural não publica, por si só, todos os feedbacks.

A revisão opcional do Numo se aplica aos feedbacks enviados e depende das configurações do projeto e da instância, dos provedores e do orçamento do proprietário. Se estiver ativa, os envios aguardam revisão antes da publicação; se estiver desativada, não esperam uma revisão que não ocorrerá. Confira a fila depois de enviar um exemplo de demonstração. O Numo só envia respostas públicas quando solicitado explicitamente.

![Mural público de feedback ativado, com identidade SSO local configurada e URL oculta.](/documentation/pt-BR/publish-a-feedback-board-workflow.png)

## Enviar, votar e acompanhar feedback {#submit-and-follow-feedback}

Abra a URL pública do mural. Você pode ler feedbacks públicos sem uma conta Minddy. Para enviar, votar ou comentar, identifique-se pelo código de email do mural ou pelo link SSO do produto. A entrega do código depende do serviço de email da instância. O código vale por dez minutos e permite cinco tentativas; aguarde ao menos sessenta segundos antes de pedir outro. Nunca compartilhe o código.

Procure solicitações existentes antes de publicar. Escreva um título específico e descreva a necessidade e seu contexto. O título aceita 200 caracteres; o corpo, 10.000. A opção pública vem selecionada por padrão; desmarque-a para enviar a solicitação em privado à equipe. Confira se o texto contém segredos antes de enviar. A moderação opcional pode manter a solicitação pendente antes de sua exibição pública.

### Votar, comentar e acompanhar {#follow}

Vote em uma solicitação existente em vez de duplicá-la. Cada identidade tem um voto por feedback. Para comentar, é necessário identificar-se e os comentários públicos precisam estar habilitados; um comentário público aceita 5.000 caracteres. Você pode remover seu próprio comentário, e a equipe pode moderar comentários públicos.

Abra Meus comentários para encontrar suas solicitações e votos, conforme o que sua identidade atual pode acessar. Leia ali, ou na solicitação, o status público e as respostas da equipe. Notas internas da equipe não são respostas públicas. Se o SSO tiver expirado, volte por um novo link do produto; mudar de navegador ou identidade pode alterar a lista pessoal.

![Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.](/documentation/pt-BR/submit-and-follow-feedback-workflow.png)

## Revisar feedback em privado e responder publicamente {#moderate-feedback}

Os membros abrem Feedback no projeto e selecionam uma solicitação da fila de revisão ou da lista. Leia o envio original, a escolha pública ou privada, o estado de revisão e as sugestões de moderação ou duplicatas. É possível esclarecer o título e o corpo canônicos sem perder os textos originais enviados. Atribua categorias e um status público adequado; spam nunca aparece no mural público. Uma solicitação privada continua distinta de uma solicitação pública que apenas está pendente.

A tradução opcional aparece ao lado do texto original para a equipe; o mural público mantém o feedback como foi escrito. Confira as classificações de IA antes de confiar nelas. Se um feedback estiver vinculado a uma tarefa, seu status será controlado por essa tarefa e não poderá ser editado de forma independente.

### Notas e respostas públicas {#responses}

Escolha a discussão interna para as notas da equipe. Respostas públicas ficam visíveis aos visitantes; confira a visibilidade antes de enviar. As respostas herdam a visibilidade da conversa, por isso escolher o modo interno no campo de composição não torna privada uma resposta em uma conversa pública. Respostas públicas do Numo exigem uma solicitação explícita; mencioná-lo em um comentário público não provoca uma resposta automática.

Os membros podem excluir comentários públicos para moderá-los. Só o autor pode editá-los, e a equipe nunca reescreve as palavras dos visitantes. Comentários internos mantêm as regras que reservam essas ações ao autor. Depois de uma resposta pública ou ação de moderação, consulte o mural sem sessão para confirmar a visibilidade pretendida.

![Detalhe de feedback com resposta pública da equipe e nota interna.](/documentation/pt-BR/moderate-feedback-workflow.png)

## Unir feedback e conectar à entrega {#feedback-to-issue}

Como membro do projeto, abra a solicitação e escolha uni-la a uma solicitação canônica existente no mesmo projeto. Leia as duas necessidades primeiro: uma redação parecida não comprova que ambas busquem o mesmo resultado. A solicitação atual vira a duplicata, os votos são unidos por identidade e a duplicata redireciona para a solicitação canônica. Confira o evento de união na atividade; a ação de desfazer usa esse evento. Rejeite uma sugestão incorreta da IA em vez de aceitá-la apenas para esvaziar a fila.

### Criar ou vincular trabalho {#work}

Transforme a solicitação em uma nova tarefa quando o trabalho ainda não estiver registrado. Confira os campos de criação antes de confirmar; sem campos fornecidos, a promoção cria por padrão trabalho no backlog. Se já existir uma tarefa, use a ação de vincular. Um feedback já vinculado não pode ser promovido novamente. Desvincular mantém o último status público e encerra a relação com a tarefa.

O status vinculado acompanha a tarefa: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Devolver o trabalho ao backlog também reabre o status do feedback. Depois de alterar um estado, confira a tarefa vinculada e a solicitação sem sessão.

As notificações à equipe por novo feedback dependem da origem e da transição de revisão. Não prometa ao votante um email automático a cada união ou atualização de tarefa; ele pode consultar o status público e as respostas em Meus comentários. O vínculo mostra o progresso sem expor a tarefa privada.

![Feedback vinculado a uma tarefa recém-criada, com status Planejado.](/documentation/pt-BR/feedback-to-issue-workflow.png)

## Adicionar páginas e visualizações públicas ao quadro {#feedback-pages-and-views}

Como proprietário do projeto, publique primeiro a página desejada ou compartilhe a visualização desejada com visibilidade pública. Confira se o conteúdo contém informações privadas. Abra as configurações de Feedback, habilite a família de páginas ou visualizações e selecione cada item que deve aparecer. Tanto o controle da família quanto a seleção individual são necessários.

A lista de configurações pode conter compartilhamentos protegidos, mas a navegação pública inclui apenas os de nível público. Selecionar uma página protegida não contorna sua proteção nem expõe seu nome em uma guia do mural. Um item publicado de outro projeto não faz parte das guias deste projeto.

### Conferir e remover acesso {#visibility}

Abra o mural sem sessão. Siga as guias até as páginas e visualizações selecionadas e confira os títulos e os conteúdos. Quando configurada, a navegação é compartilhada pelo mural, pelas visualizações públicas e pelas páginas públicas; uma guia isolada não é exibida como navegação.

Para remover uma guia, desmarque o item ou desative sua família. Isso remove a navegação, não o compartilhamento subjacente. Revogue ou altere o próprio compartilhamento para remover o acesso pelo link direto. Desativar o mural também desativa a navegação associada, mas não revoga de forma independente todos os compartilhamentos de páginas ou visualizações. Depois de alterar a publicação, confira a guia do mural e a URL original do compartilhamento.

![Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.](/documentation/pt-BR/feedback-pages-and-views-workflow.png)
