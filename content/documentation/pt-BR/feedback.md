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
  "revision": 15,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/feedback/public-nav.ts",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/project-integrations.tsx",
      "app/f/[token]/public-comments.tsx"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of publish-a-feedback-board-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Mural público de feedback ativado, com identidade dos visitantes por código de e-mail, a ação Ativar SSO e URL oculta.",
      "caption": "O proprietário ativa o mural e escolhe a identidade dos visitantes. Este mural de demonstração usa a verificação por e-mail; sua URL está oculta.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        566
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/submit-and-follow-feedback-workflow.png",
      "alt": "Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.",
      "caption": "Um visitante identificado envia uma necessidade e escolhe sua visibilidade. O exemplo foi realmente enviado com a revisão automática desativada.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        624,
        394
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-objective-selection.png",
      "alt": "Prévia dos componentes de seleção de objetivo para um feedback e uma integração, ambos definidos como Docs.",
      "caption": "Seletores de objetivo com dados de demonstração. Novos feedbacks herdam a configuração da integração.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/feedback-pages-and-views-workflow.png",
      "alt": "Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.",
      "caption": "Publique uma página, ative as guias de páginas e selecione-a para o mural. Esta página de demonstração foi aberta anonimamente; seu URL opaco mantém `noindex`.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1148,
        388
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
    "feedback-pages-and-views-workflow"
  ]
}
---

O feedback conecta as solicitações dos visitantes ao trabalho de revisão e entrega da equipe. O proprietário configura o mural público; os visitantes enviam e acompanham solicitações, enquanto os membros as moderam ou vinculam a tickets. Gerencie separadamente respostas públicas, notas internas e compartilhamentos de páginas ou visualizações.

## Publicar um quadro de feedback {#publish-a-feedback-board}

Como proprietário, abra Feedback nas configurações do projeto. Conclua a configuração caso ainda não exista um mural e ative o canal do mural público. Copie a URL pública e abra-a em um navegador sem sessão para conferir a visão dos visitantes. Os membros podem consultar as configurações, mas não alterar a publicação, renovar tokens ou gerenciar o segredo SSO.

Escolha se os visitantes se identificam por código de email ou pelo SSO configurado. Configure comentários públicos, exibição de categorias e as guias de páginas ou visualizações públicas selecionadas. Confira os dados visíveis antes de divulgar a URL. Os visitantes podem ler sem identificação; enviar feedback, votar e comentar exige uma identidade no mural. A representação pública não expõe email nem nome real dos visitantes, mas a equipe pode tratar os feedbacks identificados de forma privada.

### Separar publicação e ingestão {#channels}

Desativar o mural torna suas páginas indisponíveis para os visitantes. A recepção entre servidores usa uma chave de integração de feedback separada e pode continuar sem mural público. A escolha de visibilidade de um feedback, seu estado de revisão e seu status de spam também controlam sua exibição; ativar o mural não publica, por si só, todos os feedbacks.

O proprietário ativa ou desativa a **Revisão do Numo** nas configurações de Feedback do projeto; não existe um interruptor separado na instância. Com a revisão ativa, os envios do quadro público e das integrações aguardam revisão antes da publicação, enquanto os feedbacks criados pela equipe não ficam retidos. O que é marcado como sensível, como uma vulnerabilidade ou dados pessoais, passa a ser privado e aguarda em **Para revisar**. A revisão usa o provedor de IA da instância e o orçamento de IA do proprietário do projeto: quando o orçamento acaba, os feedbacks aguardam, visíveis apenas para a equipe, a menos que o proprietário ative **Publique sem revisão quando o orçamento de IA acabar**. Com a revisão desativada, os feedbacks são publicados como enviados, sem categorias automáticas, filtro de brincadeiras nem verificação de privacidade. Confira a fila depois de enviar um exemplo de demonstração. O Numo só envia respostas públicas quando solicitado explicitamente.

![Mural público de feedback ativado, com identidade dos visitantes por código de e-mail, a ação Ativar SSO e URL oculta.](/documentation/pt-BR/publish-a-feedback-board-workflow.png)

## Enviar, votar e acompanhar feedback {#submit-and-follow-feedback}

Abra a URL pública do mural. Você pode ler feedbacks públicos sem uma conta minddy. Para enviar, votar ou comentar, identifique-se pelo código de email do mural ou pelo link SSO do produto. A entrega do código depende do serviço de email da instância. O código vale por dez minutos e permite cinco tentativas; aguarde ao menos sessenta segundos antes de pedir outro. Nunca compartilhe o código.

Procure solicitações existentes antes de publicar. Escreva um título específico e descreva a necessidade e seu contexto. O título aceita 200 caracteres; o corpo, 10.000. A opção pública vem selecionada por padrão; desmarque-a para enviar a solicitação em privado à equipe. Confira se o texto contém segredos antes de enviar. A moderação opcional pode manter a solicitação pendente antes de sua exibição pública.

Use o microfone no formulário de envio para ditar o título e a descrição. Primeiro, identifique-se no mural e permita o acesso ao microfone; depois, pare a gravação e confira o texto antes de escolher Enviar. O ditado preenche o rascunho; ele não envia a solicitação. A disponibilidade depende do funcionamento dos provedores de transcrição e de IA da instância e do orçamento de IA do proprietário do projeto; não há um interruptor separado da instância para a voz. O uso é cobrado desse proprietário de acordo com suas configurações de provedores, em vez de ser cobrado da conta do visitante.

As gravações no mural público são limitadas a 10 MiB. A transcrição permite 20 solicitações por visitante identificado e 40 por endereço IP por hora, por mural; a interpretação do rascunho tem um limite separado de 40 solicitações por visitante por hora. Esses limites são separados dos limites de ditado da conta. Se aparecer uma mensagem de limite atingido, aguarde antes de tentar novamente; se a voz estiver indisponível, digite a solicitação.

### Votar, comentar e acompanhar {#follow}

Vote em uma solicitação existente em vez de duplicá-la. Cada identidade tem um voto por feedback, em uma solicitação que você ainda pode ler: pública ou sua. Para comentar, é necessário identificar-se e os comentários públicos precisam estar habilitados; um comentário público aceita 5.000 caracteres. Uma conversa longa abre nos comentários mais recentes; escolha **Mostrar comentários anteriores** para ler o restante. Você pode remover definitivamente seu próprio comentário depois de confirmar, e a equipe pode moderar comentários públicos.

Abra Meus comentários para encontrar suas solicitações e votos, conforme o que sua identidade atual pode acessar. Leia ali, ou na solicitação, o status público e as respostas da equipe. Notas internas da equipe não são respostas públicas. Se o SSO tiver expirado, volte por um novo link do produto; mudar de navegador ou identidade pode alterar a lista pessoal.

![Formulário de feedback do visitante com título, descrição e visibilidade pública ativada.](/documentation/pt-BR/submit-and-follow-feedback-workflow.png)

## Revisar feedback em privado e responder publicamente {#moderate-feedback}

Os filtros da lista combinam status, objetivo, categorias, autor, origem e estado de revisão; a visibilidade fica disponível quando o quadro público está ativado. Vários valores da mesma propriedade são alternativas; propriedades diferentes são combinadas. Redefina os filtros para voltar à lista inicial. A lista mostra até 500 solicitações que correspondem a esses filtros por vez. Abra o submenu de uma propriedade para selecionar seus valores; o número indica quantos estão selecionados. No celular, expanda a seção da propriedade.

O proprietário do projeto e os Membros abrem Feedback no projeto e selecionam uma solicitação da fila de revisão ou da lista. Os leitores podem ler as solicitações, mas não moderá-las. Leia o envio original, a escolha pública ou privada, o estado de revisão e as sugestões de moderação ou duplicatas. É possível esclarecer o título e o corpo canônicos sem perder os textos originais enviados. Atribua categorias e um status público adequado; spam nunca aparece no mural público. Uma solicitação privada continua distinta de uma solicitação pública que apenas está pendente.

A tradução opcional aparece ao lado do texto original para a equipe; o mural público mantém o feedback como foi escrito. Confira as classificações de IA antes de confiar nelas. Se um feedback estiver vinculado a um ticket, seu status será controlado por esse ticket e não poderá ser editado de forma independente.

### Notas e respostas públicas {#responses}

Escolha a discussão interna para as notas da equipe. Respostas públicas ficam visíveis aos visitantes; confira a visibilidade antes de enviar. Um leitor com **Pode comentar** pode participar das conversas de discussão interna, mas não pode responder publicamente no mural. As respostas herdam a visibilidade da conversa, por isso escolher o modo interno no campo de composição não torna privada uma resposta em uma conversa pública. Respostas públicas do Numo exigem uma solicitação explícita; mencioná-lo em um comentário público não provoca uma resposta automática.

Os membros podem excluir comentários públicos para moderá-los. Só o autor pode editá-los, e a equipe nunca reescreve as palavras dos visitantes. Comentários internos mantêm as regras que reservam essas ações ao autor. Depois de uma resposta pública ou ação de moderação, consulte o mural sem sessão para confirmar a visibilidade pretendida.

### Escolher um objetivo para um feedback {#feedback-objective}

A lista mostra o objetivo vinculado abaixo do autor e das categorias. Nas propriedades do objetivo, a contagem de feedbacks inclui as solicitações existentes e não mescladas, inclusive as privadas visíveis à equipe. Selecione o número para abrir os feedbacks filtrados por esse objetivo, com todos os status.

Como proprietário ou Membro, escolha **Objetivo** nas propriedades do feedback ou ao criá-lo internamente. Escolha **Nenhum** para remover o vínculo. O objetivo deve pertencer ao mesmo projeto. Essa associação é interna, não expõe objetivos privados no quadro público e não conta para o progresso dos tickets.

O proprietário pode escolher um objetivo opcional ao criar uma integração de feedback em **Configurações do projeto** → **Integrações**, ou alterá-lo depois na linha **Objetivo dos novos feedbacks** abaixo de uma integração de feedback existente. Esse seletor também pode criar um objetivo novo. Novos envios da API herdam esse objetivo, inclusive com `analyze: false`. Alterar a configuração não move feedbacks existentes. Se o objetivo estiver na lixeira, escolha um ativo ou remova a configuração antes de enviar novamente. O Numo nunca escolhe um objetivo durante a revisão de feedbacks. Peça explicitamente para vincular uma solicitação ou remover seu vínculo.

A conversão cria um ticket com o objetivo e as categorias do feedback. Você pode alterá-los no formulário de criação. Sem um objetivo escolhido, o campo fica vazio mesmo com o Smart Fill ativado. Alterar depois o objetivo do feedback não move um ticket já vinculado. Mesclagens exigem que as duas solicitações tenham o mesmo objetivo, inclusive quando ambas não têm nenhum. Alinhe os objetivos primeiro se a equipe decidir que descrevem a mesma necessidade.

Um grupo mesclado compartilha um único objetivo. Alterar o objetivo da solicitação principal também atualiza as solicitações incorporadas, permitindo uma nova mesclagem do grupo.

![Prévia dos componentes de seleção de objetivo para um feedback e uma integração, ambos definidos como Docs.](/documentation/pt-BR/feedback-objective-selection.png)

## Unir feedback e conectar à entrega {#feedback-to-issue}

Como proprietário ou Membro, abra a solicitação e escolha uni-la a uma solicitação canônica existente no mesmo projeto. Leia as duas necessidades primeiro: uma redação parecida não comprova que ambas busquem o mesmo resultado. A solicitação atual vira a duplicata, os votos são unidos por identidade e a duplicata redireciona para a solicitação canônica. Se a solicitação canônica não for pública, o autor da duplicata continua a abri-la somente para leitura, e os demais visitantes não obtêm nenhuma página. Confira o evento de união na atividade; a ação de desfazer usa esse evento. Rejeite uma sugestão incorreta da IA em vez de aceitá-la apenas para esvaziar a fila.

### Criar ou vincular trabalho {#work}

Transforme a solicitação em um novo ticket quando o trabalho ainda não estiver registrado. Confira os campos de criação antes de confirmar; sem campos fornecidos, a promoção cria por padrão trabalho no `backlog`. Se já existir um ticket, use a ação de vincular. **Link para um ticket existente** busca entre os tickets do projeto, exceto os cancelados e duplicados. Descrever a necessidade também lista tickets encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**, depois das correspondências de texto, o que ajuda quando a solicitação não usa as palavras do ticket. Um feedback já vinculado não pode ser promovido novamente. Desvincular pede confirmação antes; depois mantém o último status público e encerra a relação com o ticket.

O status vinculado acompanha o ticket: `triage`/`backlog`/`duplicate` → `open`; `todo` → `planned`; `in_progress`/`in_review` → `in_progress`; `done` → `shipped`; `canceled` → `declined`. Devolver o trabalho ao `backlog` também reabre o status do feedback. Depois de alterar um estado, confira o ticket vinculado e a solicitação sem sessão.

As notificações à equipe por novo feedback dependem da origem e da transição de revisão. Não prometa ao votante um email automático a cada união ou atualização de ticket; ele pode consultar o status público e as respostas em Meus comentários. O vínculo mostra o progresso sem expor o ticket privado.


## Adicionar páginas e visualizações públicas ao quadro {#feedback-pages-and-views}

Como proprietário do projeto, publique primeiro a página desejada ou compartilhe a visualização desejada com visibilidade pública. Confira se o conteúdo contém informações privadas. Abra as configurações de Feedback, habilite a família de páginas ou visualizações e selecione cada item que deve aparecer. Tanto o controle da família quanto a seleção individual são necessários.

A lista de configurações pode conter compartilhamentos protegidos, mas a navegação pública inclui apenas os de nível público. Selecionar uma página protegida não contorna sua proteção nem expõe seu nome em uma guia do mural. Um item publicado de outro projeto não faz parte das guias deste projeto.

### Conferir e remover acesso {#visibility}

Abra o mural sem sessão. Siga as guias até as páginas e visualizações selecionadas e confira os títulos e os conteúdos. Quando configurada, a navegação é compartilhada pelo mural, pelas visualizações públicas e pelas páginas públicas; uma guia isolada não é exibida como navegação.

Para remover uma guia, desmarque o item ou desative sua família. Isso remove a navegação, não o compartilhamento subjacente. Revogue ou altere o próprio compartilhamento para remover o acesso pelo link direto. Desativar o mural também desativa a navegação associada, mas não revoga de forma independente todos os compartilhamentos de páginas ou visualizações. Depois de alterar a publicação, confira a guia do mural e a URL original do compartilhamento.

![Guia de feedback publicado e selecionado na navegação do mural, legível sem entrar na conta.](/documentation/pt-BR/feedback-pages-and-views-workflow.png)
