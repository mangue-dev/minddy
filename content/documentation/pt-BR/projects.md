---
{
  "id": "projects",
  "locale": "pt-BR",
  "title": "Projetos e membros",
  "summary": "Configure um projeto, convide colaboradores, escolha os papéis deles e transfira a propriedade.",
  "topic": "Primeiros passos",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 11,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles; MIN-737 project settings reorganization",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "components/settings/project-settings-page.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; pt-BR translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (hide-project confirmation from the sidebar menu: source and unit-test review of components/project-context-actions.tsx; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 project settings: source review of the General identity header edited in place (icon menu, name and key fields or phone sheet, no Save button), the Categories card, the three Members cards and the Hidden projects account tab; project-settings-steps and project-members-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-refresh screens project-general and project-members) and inspected; no other browser walkthrough)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (pt-BR translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (pt-BR hide-project confirmation sentence, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR translation of the MIN-737 project-settings second-pass passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configurar um projeto",
    "Convidar pessoas para um projeto"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-general.png",
      "alt": "Cabeçalho do projeto com o ícone e seu selo de edição, o nome, a chave e os números Tickets, Membros, Objetivos, Categorias e Criado em.",
      "caption": "Selecione o ícone, o nome ou a chave para alterá-los no lugar; mover o projeto para a lixeira continua sendo uma ação separada, mais abaixo.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        359
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/project-members.png",
      "alt": "Cartão “Convidar por e-mail” acima do cartão Membros, que lista três membros de demonstração com o proprietário identificado.",
      "caption": "Convide pelo email da conta e identifique o proprietário antes de remover o acesso de um membro.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        430
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Um projeto reúne problemas, objetivos, páginas e as pessoas que trabalham neles. Seu único proprietário gerencia as configurações administrativas, os convites e os papéis. Os membros trabalham no conteúdo e os leitores acompanham o projeto; ambos podem sair dele. Use as seções abaixo para configurar o projeto, escolher quem pode fazer o quê, transferir a propriedade ou resolver um problema de convite.

## Configurar um projeto {#project-settings}

Abra o projeto e depois suas configurações. A propriedade do projeto determina o acesso às configurações administrativas. Os membros e os leitores podem consultar a seção geral, ocultar o projeto para si e sair dele, mas não recebem os controles de edição do proprietário.

A aba **Geral** abre com a identidade do projeto: o ícone, o nome e a chave, e depois cinco números: **Tickets**, **Membros**, **Objetivos**, **Categorias** e **Criado em**. Como proprietário, você altera o ícone, o nome e a chave onde eles aparecem; não há mais botão Salvar. Selecione o ícone e escolha **Novo orbe** (oferecido só enquanto nenhuma imagem cobre o orbe), **Fazer upload de uma imagem**, **Importar de um site…**, que pede o endereço do site e importa o ícone dele quando você escolhe **Importar**, ou, se houver uma imagem, **Remover a imagem**. Selecione o nome ou a chave para editá-los: no computador eles viram um campo em que Enter ou sair do campo salva e Esc cancela; no celular abre um painel com **Salvar**. O nome não pode ficar vazio. A chave é normalizada para maiúsculas e precisa ter de 2 a 5 letras (A–Z); caso contrário, aparece um erro e a chave não é salva. Revise os identificadores resultantes depois de alterá-la. O ícone só distingue o projeto na navegação; ele não muda a participação no projeto. Membros e leitores veem o mesmo cabeçalho sem esses controles.

As outras seções gerenciam categorias, colaboradores, problemas recorrentes, Git, importação, integrações, automação e feedback. Siga o guia correspondente antes de habilitar um provedor ou trabalho automático. As preferências da conta, como o idioma da interface, são separadas da configuração do projeto.

Em **Categorias**, o proprietário e os membros gerenciam as categorias que classificam os tickets. Escolha **Nova categoria** na linha de título do cartão: uma linha com um ponto de cor e um campo de nome aparece no topo da lista. Pressione Enter ou escolha **Adicionar** para criar a categoria; Esc fecha a linha sem criá-la. Selecione o ponto de cor de uma categoria para escolher outra cor, aplicada na hora (no celular as cores abrem em um painel), ou selecione o nome dela para renomeá-la ali mesmo. O botão de excluir pede confirmação e depois remove a categoria de todos os tickets.


![Cabeçalho do projeto com o ícone e seu selo de edição, o nome, a chave e os números Tickets, Membros, Objetivos, Categorias e Criado em.](/documentation/pt-BR/project-general.png)

### Ocultar um projeto para você {#hide-project}

Oculte um projeto que você não acompanha mais no dia a dia para tirá-lo da sua barra lateral e do seu início sem sair dele. Nas configurações gerais do projeto, escolha **Ocultar** na **Zona de perigo**, ou clique com o botão direito no projeto na barra lateral e escolha **Ocultar projeto** e confirme. O menu pede confirmação porque o projeto sai da sua navegação; o botão das configurações o oculta na hora. Qualquer pessoa no projeto pode ocultá-lo, inclusive o proprietário e os leitores.

Ocultar muda apenas a sua própria navegação. A preferência é salva na sua conta, então continua valendo depois de entrar novamente e nos seus outros dispositivos. Você mantém seu acesso e ainda pode abrir e editar o projeto por um link direto ou na aba **Projetos ocultos** das **Configurações da conta**. Os outros membros continuam vendo o projeto, e as rotinas, integrações e notificações dele continuam funcionando. Abrir um projeto oculto não o traz de volta para a sua barra lateral.

Para trazê-lo de volta, escolha **Mostrar** em **Projetos ocultos** ou nas configurações gerais do projeto, ou escolha **Mostrar projeto** no menu dele na barra lateral. Se a alteração não puder ser salva, aparece um erro e o projeto volta ao estado anterior; tente novamente. Diferentemente de sair do projeto ou movê-lo para a lixeira, ocultar nunca remove acesso nem conteúdo.

### Sair e excluir {#project-removal}

Um membro ou leitor pode usar a ação de sair para remover seu próprio acesso. Peça ao proprietário um novo convite se precisar do projeto mais tarde. Sair não exclui o projeto para todos. O proprietário não pode sair: primeiro [transfira a propriedade](#transfer-ownership) para um membro.

A exclusão do projeto é uma ação do proprietário na zona de perigo. Leia as consequências e a confirmação antes de usá-la, especialmente se o projeto contiver problemas, páginas, arquivos ou integrações. Se um salvamento normal falhar, preserve os valores desejados, leia o erro e atualize o projeto antes de tentar novamente. Evite repetir uma ação destrutiva enquanto o primeiro resultado for incerto.

O proprietário também pode clicar com o botão direito no projeto na barra lateral e escolher **Mover para a lixeira**. A mesma confirmação aparece, e apenas o projeto em que você clicou é afetado.

## Convidar pessoas para um projeto {#project-members}

O proprietário do projeto gerencia a participação em **Configurações do projeto** → **Membros**. Peça à pessoa colaboradora o e-mail que ela usa nesta instância, depois, no cartão **Convidar por e-mail**, informe esse endereço, escolha o papel dela e escolha **Convidar**. O convite aparece no cartão **Convites pendentes** até ser aceito; os membros atuais ficam listados no cartão **Membros**, cujo título mostra quantos são. Escolha **Membro** para alguém que trabalha no projeto, ou **Leitor** para alguém que só o acompanha. Para um leitor, ative **Pode comentar** se ele deve participar das discussões. Enquanto o convite estiver pendente, o proprietário pode alterar o papel e a opção de comentário. O mesmo e-mail em outra instância não concede acesso aqui.

A pessoa convidada entra com essa conta e abre a caixa de entrada. Aceite o convite pendente para participar com o papel que ele indica, ou recuse se não esperava esse projeto. O diálogo inicial de entrada ajuda a compartilhar seu e-mail com o proprietário; ele não permite entrar em projetos sem convite.


![Cartão “Convidar por e-mail” acima do cartão Membros, que lista três membros de demonstração com o proprietário identificado.](/documentation/pt-BR/project-members.png)

### Papéis de proprietário, membro e leitor {#member-permissions}

| Papel | Acesso ao projeto |
| --- | --- |
| Proprietário | Um por projeto. Tudo o que um membro pode fazer, mais as configurações do projeto, os convites e os papéis, as integrações, o vínculo com o Git, as rotinas, a transferência da propriedade e a exclusão do projeto. |
| Membro | Todo o trabalho com o conteúdo: problemas, planos, objetivos, feedback, páginas e bancos de dados, comentários, arquivos, visualizações compartilhadas e links de publicação, ações de Git e de pull request, Numo e MCP. Pode sair do projeto. |
| Leitor | Lê o conteúdo, os membros e as rotinas do projeto. Pode ocultar o projeto, aparecer entre as pessoas que estão vendo uma página, usar visualizações pessoais e notificações, e sair. Não pode editar conteúdo, ser atribuído, liderar um objetivo nem publicar links, e não vê as integrações nem os tokens de compartilhamento e de mural. |
| Leitor com **Pode comentar** | O acesso de leitor, mais comentários em problemas, objetivos, conversas internas de feedback e páginas: respostas, menções, arquivos anexados aos próprios comentários e edição ou exclusão dos próprios comentários. As respostas públicas no quadro de feedback e os comentários ou reações em pull requests continuam indisponíveis. |
| Visitante de link público | Somente o conteúdo publicado explicitamente pelo link; sem participação no projeto. |

Os leitores contam para o limite de convidados por projeto do plano, assim como os membros e os convites pendentes. Não há cobrança por assento.

Revise a lista de membros antes de remover alguém. A linha do proprietário não oferece uma ação de remoção; só uma [transferência](#transfer-ownership) muda o proprietário. O proprietário pode cancelar um convite pendente antes da aceitação; o estado pendente não revela se aquele endereço já tem uma conta. A remoção encerra o acesso como membro; ela não recupera exportações, capturas de tela ou cópias já recebidas. As credenciais pessoais de Git, IA e MCP continuam pertencendo à conta e não são transferidas apenas porque a propriedade do projeto mudou.

### Alterar o papel de um membro {#change-role}

Como proprietário, abra **Configurações do projeto** → **Membros** e escolha o novo papel da pessoa: **Membro** ou **Leitor**. Para um leitor, escolha se **Pode comentar** fica ativado. Essa opção vem desativada por padrão e é desativada sempre que alguém se torna leitor, então confira-a depois de mudar um membro para Leitor. Seu próprio papel de proprietário só muda por meio de uma transferência.

Mudar um membro para Leitor também remove a atribuição dos problemas abertos dele e o tira da liderança dos objetivos dele, o que retira esses problemas do seu ciclo pessoal. Reatribua esse trabalho se ele deve continuar.

Uma mudança de papel vale a partir da próxima solicitação da pessoa, no aplicativo, no Numo e pelo MCP. O conteúdo que ela já carregou ou baixou não é recuperado, e um link de arquivo assinado que ela já abriu pode continuar válido por alguns minutos.

### Resolver a falta de acesso {#invitation-recovery}

Se um convite não aparecer, compare o e-mail convidado com a conta conectada e verifique a URL da instância. Peça ao proprietário que confira os convites pendentes em vez de criar contas repetidamente. Se o seu papel mudar durante uma sessão aberta, recarregue o destino e confira seu papel antes de repetir uma gravação. Um leitor que precisa editar pede ao proprietário que mude seu papel para Membro. Não compartilhe a sessão de outra pessoa para contornar um erro de acesso.

## Transferir a propriedade {#transfer-ownership}

Um projeto tem exatamente um proprietário. Para passá-lo adiante, abra **Configurações do projeto** → **Membros** como proprietário, escolha **Transferir a propriedade do projeto** para um membro existente e confirme. Só um Membro pode receber a propriedade; convide a pessoa ou mude um leitor para Membro antes. Depois da transferência, você continua no projeto como Membro.

### O que muda com a propriedade {#transfer-effects}

- Suas rotinas neste projeto são pausadas e não podem iniciar novo trabalho. O novo proprietário cria as rotinas que devem continuar com o próprio orçamento.
- Os limites do plano para problemas e convidados por projeto, o armazenamento e a IA em segundo plano, como o Smart Assign e a análise de feedback, passam a usar o plano e o orçamento do novo proprietário. Os problemas e os membros existentes são mantidos.
- As assinaturas, os métodos de pagamento e as chaves e conexões pessoais continuam com cada conta.
- Os convites pendentes continuam válidos.

A transferência falha sem alterar nada se o armazenamento do novo proprietário não comportar os arquivos do projeto, ou se ele já for proprietário de um projeto com a mesma chave. Libere armazenamento ou altere a chave do projeto e tente novamente.
