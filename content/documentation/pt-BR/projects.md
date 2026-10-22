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
  "revision": 16,
  "sourceRevision": 15,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/use-offered-projects.ts",
      "components/global-board.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/server/cycles.ts",
      "lib/server/hidden-projects.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "lib/server/categories.ts",
      "components/settings/project-settings-page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "lib/server/collaborators.ts",
      "lib/collaborator-search.ts",
      "components/collaborator-suggestions.tsx",
      "app/api/me/collaborators/route.ts",
      "components/ui/confirm-delete-dialog.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:claude (MIN-760: category reordering paragraph checked against components/project-categories.tsx, the order route and the Numo/MCP tools; existing figures unaffected and kept; no browser walkthrough of the procedure); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of project-settings-steps, project-members-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:claude (pt-BR translation of the added en paragraph, equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "alt": "Cartão “Convidar pessoas” acima do cartão Membros, que lista três membros de demonstração com o proprietário identificado.",
      "caption": "Convide pelo email da conta e identifique o proprietário antes de remover o acesso de um membro.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Um projeto reúne tickets, objetivos, páginas e as pessoas que trabalham neles. Seu único proprietário gerencia as configurações administrativas, os convites e os papéis. Os membros trabalham no conteúdo e os leitores acompanham o projeto; ambos podem sair dele. Use as seções abaixo para configurar o projeto, escolher quem pode fazer o quê, transferir a propriedade ou resolver um problema de convite.

## Configurar um projeto {#project-settings}

Abra o projeto e depois suas configurações. A propriedade do projeto determina o acesso às configurações administrativas. Os membros e os leitores podem consultar a seção geral, ocultar o projeto para si e sair dele, mas não recebem os controles de edição do proprietário.

A aba **Geral** abre com a identidade do projeto: o ícone, o nome e a chave, e depois cinco números: **Tickets**, **Membros**, **Objetivos**, **Categorias** e **Criado em**. Como proprietário, você altera o ícone, o nome e a chave onde eles aparecem; não há mais botão Salvar. Selecione o ícone e escolha **Novo orbe** (oferecido só enquanto nenhuma imagem cobre o orbe), **Fazer upload de uma imagem**, **Importar de um site…**, que pede o endereço do site e importa o ícone dele quando você escolhe **Importar**, ou, se houver uma imagem, **Remover a imagem**, que pede confirmação antes porque a imagem é excluída. Selecione o nome ou a chave para editá-los: no computador eles viram um campo em que Enter ou sair do campo salva e Esc cancela; no celular abre um painel com **Salvar**. O nome não pode ficar vazio. A chave é normalizada para maiúsculas e precisa ter de 2 a 5 letras (A–Z); caso contrário, aparece um erro e a chave não é salva. Revise os identificadores resultantes depois de alterá-la. O ícone só distingue o projeto na navegação; ele não muda a participação no projeto. Membros e leitores veem o mesmo cabeçalho sem esses controles.

As outras abas são **Categorias**, **Membros**, **Recorrências**, **Smart Assign**, **Feedback**, **Git**, **Importar** e **Integrações**. Siga o guia correspondente antes de habilitar um provedor ou trabalho automático. As preferências da conta, como o idioma da interface, são separadas da configuração do projeto.

Em **Categorias**, o proprietário e os membros gerenciam as categorias que classificam os tickets. Escolha **Nova categoria** na linha de título do cartão: uma linha com um ponto de cor e um campo de nome aparece no topo da lista. Pressione Enter ou escolha **Adicionar** para criar a categoria; Esc fecha a linha sem criá-la. Selecione o ponto de cor de uma categoria para escolher outra cor, aplicada na hora (no celular as cores abrem em um painel), ou selecione o nome dela para renomeá-la ali mesmo. O botão de excluir pede confirmação e depois remove a categoria de todos os tickets. Assim que o projeto tem duas categorias ou mais, cada linha mostra uma alça à esquerda: arraste-a para subir ou descer a categoria. Pelo teclado, coloque o foco na alça, pressione Espaço, mova a categoria com as setas para cima e para baixo e pressione Espaço de novo para soltá-la; Esc cancela. Essa ordem é a que todos os menus e filtros de categorias mostram para todo o projeto. O Numo e os clientes MCP do Minddy também podem lê-la e alterá-la, por exemplo quando você pede ao Numo para colocar uma categoria em primeiro lugar.


![Cabeçalho do projeto com o ícone e seu selo de edição, o nome, a chave e os números Tickets, Membros, Objetivos, Categorias e Criado em.](/documentation/pt-BR/project-general.png)

### Ocultar um projeto para você {#hide-project}

Oculte um projeto que você não acompanha mais no dia a dia para tirá-lo da sua barra lateral e do seu início sem sair dele. Nas configurações gerais do projeto, escolha **Ocultar** na **Zona de perigo**, ou clique com o botão direito no projeto na barra lateral e escolha **Ocultar projeto** e confirme. Nos dois casos, uma caixa de diálogo com o nome do projeto pede confirmação porque ele sai da sua navegação; mostrá-lo de novo não pede confirmação. Qualquer pessoa no projeto pode ocultá-lo, inclusive o proprietário e os leitores.

Ocultar muda apenas a sua própria navegação. Fora do próprio projeto, o Minddy deixa de oferecê-lo, assim como seus tickets, objetivos e páginas, em todo lugar onde você escolhe algo: a paleta de comandos, as sugestões de menção após @, o contexto do Numo e a escolha do projeto ao criar um ticket, um objetivo ou uma rotina. Menções e links já escritos mantêm o nome e continuam abrindo. Os tickets dele também saem do quadro **Todos os tickets** e dos seus filtros, da exportação CSV de todos os seus projetos e do preenchimento automático do seu ciclo; escolher o projeto explicitamente na exportação ainda o inclui. A preferência é salva na sua conta, então continua valendo depois de entrar novamente e nos seus outros dispositivos. Você mantém seu acesso e ainda pode abrir e editar o projeto por um link direto ou na aba **Projetos ocultos** das **Configurações da conta**. Os outros membros continuam vendo o projeto, e as rotinas, integrações e notificações dele continuam funcionando. Abrir um projeto oculto não o traz de volta para a sua barra lateral.

Para trazê-lo de volta, escolha **Mostrar** em **Projetos ocultos** ou nas configurações gerais do projeto, ou escolha **Mostrar projeto** no menu dele na barra lateral. Se a alteração não puder ser salva, aparece um erro e o projeto volta ao estado anterior; tente novamente. Diferentemente de sair do projeto ou movê-lo para a lixeira, ocultar nunca remove acesso nem conteúdo.

### Sair e excluir {#project-removal}

Um membro ou leitor pode usar a ação de sair na zona de perigo para remover seu próprio acesso; antes, uma caixa de diálogo com o nome do projeto pede confirmação. Peça ao proprietário um novo convite se precisar do projeto mais tarde. Sair não exclui o projeto para todos. O proprietário não pode sair: primeiro [transfira a propriedade](#transfer-ownership) para um membro.

Remover o projeto é uma ação do proprietário: na zona de perigo, escolha **Mover para a lixeira** ao lado de **Mover projeto para a lixeira**. A confirmação nomeia o projeto e informa que seus tickets, objetivos e feedback vão junto; o projeto pode ser restaurado da [lixeira](/pt-br/documentacao/trash-and-recovery) por 30 dias, e sua chave é liberada na hora. Leia a confirmação antes de usá-la, especialmente se o projeto contiver tickets, páginas, arquivos ou integrações. Se um salvamento normal falhar, preserve os valores desejados, leia o erro e atualize o projeto antes de tentar novamente. Evite repetir uma ação destrutiva enquanto o primeiro resultado for incerto.

O proprietário também pode clicar com o botão direito no projeto na barra lateral e escolher **Mover para a lixeira**. A mesma confirmação aparece, e apenas o projeto em que você clicou é afetado.

## Convidar pessoas para um projeto {#project-members}

O proprietário do projeto gerencia a participação em **Configurações do projeto** → **Membros**. No cartão **Convidar pessoas**, busque um nome ou digite o e-mail que a pessoa usa nesta instância. Enquanto você digita, **Dos seus projetos** sugere as pessoas que já entraram em algum dos seus outros projetos, como proprietário, membro ou leitor, com um e-mail verificado; quem foi apenas convidado nunca é sugerido, assim como os membros atuais e os convites pendentes. Escolha uma pessoa para colocá-la no campo com o avatar e o nome dela, ou pressione Enter quando o nome corresponder a uma só pessoa. Qualquer outra pessoa é convidada por e-mail. Depois escolha o papel dela e **Convidar**. Uma pessoa escolhida dos seus projetos é convidada pela conta: o Minddy confere de novo que ela entrou em algum dos seus projetos e, caso contrário, recusa com “Esta pessoa não faz parte dos seus projetos.” O convite aparece no cartão **Convites pendentes** até ser aceito; os membros atuais ficam listados no cartão **Membros**, cujo título mostra quantos são. Escolha **Membro** para alguém que trabalha no projeto, ou **Leitor** para alguém que só o acompanha. Para um leitor, ative **Pode comentar** se ele deve participar das discussões. Enquanto o convite estiver pendente, o proprietário pode alterar o papel e a opção de comentário. O mesmo e-mail em outra instância não concede acesso aqui.

A pessoa convidada entra com essa conta e abre a caixa de entrada. Aceite o convite pendente para participar com o papel que ele indica, ou recuse se não esperava esse projeto. O diálogo inicial de entrada ajuda a compartilhar seu e-mail com o proprietário; ele não permite entrar em projetos sem convite.

Você também pode convidar pessoas ao criar o projeto. Na etapa **Convide sua equipe** do assistente, busque um nome ou digite um e-mail. Abaixo do campo, **Dos seus projetos** sugere as mesmas pessoas que o cartão **Convidar pessoas**, mesmo antes de você digitar, e é filtrada enquanto você digita. Escolha uma pessoa, ou pressione Enter quando só uma corresponder; digitar o endereço de uma dessas pessoas também a adiciona pelo nome. Adicione qualquer outra pessoa por e-mail com **Adicionar** ou Enter. O limite de convidados do seu plano vale como aqui, e a lista fica salva com o rascunho do projeto se você retomar a criação depois.

Nada é enviado antes de você escolher **Concluir**: o projeto é criado primeiro e, em seguida, cada pessoa recebe um convite com o papel **Membro**. As pessoas escolhidas dos seus projetos são convidadas pela conta: o Minddy confere de novo que elas entraram em algum dos seus projetos e usa o endereço verificado delas. As demais são convidadas por e-mail. Esses convites aparecem no cartão **Convites pendentes**, onde você pode alterar o papel, e são aceitos na caixa de entrada como qualquer outro. Se alguns forem recusados, por exemplo pelo limite de convidados do plano ou porque alguém saiu nesse meio-tempo do projeto que vocês compartilhavam (“Esta pessoa não faz parte dos seus projetos.”), os demais são enviados mesmo assim e uma notificação lista cada pessoa não convidada com o motivo. Confira o cartão **Convites pendentes** antes de convidá-las novamente. Um convite pendente fica registrado, o que não garante que o e-mail tenha sido entregue.


![Cartão “Convidar pessoas” acima do cartão Membros, que lista três membros de demonstração com o proprietário identificado.](/documentation/pt-BR/project-members.png)

### Papéis de proprietário, membro e leitor {#member-permissions}

| Papel | Acesso ao projeto |
| --- | --- |
| Proprietário | Um por projeto. Tudo o que um membro pode fazer, mais as configurações do projeto, os convites e os papéis, as integrações, o vínculo com o Git, as rotinas, a transferência da propriedade e a exclusão do projeto. |
| Membro | Todo o trabalho com o conteúdo: tickets, planos, objetivos, feedback, páginas e bancos de dados, comentários, arquivos, visualizações compartilhadas e links de publicação, ações de Git e de pull request, Numo e MCP. Pode sair do projeto. |
| Leitor | Lê o conteúdo, os membros e as rotinas do projeto. Pode ocultar o projeto, aparecer entre as pessoas que estão vendo uma página, usar visualizações pessoais e notificações, e sair. Não pode editar conteúdo, ser atribuído, liderar um objetivo nem publicar links, e não vê as integrações nem os tokens de compartilhamento e de mural. |
| Leitor com **Pode comentar** | O acesso de leitor, mais comentários em tickets, objetivos, conversas internas de feedback e páginas: respostas, menções, arquivos anexados aos próprios comentários e edição ou exclusão dos próprios comentários. As respostas públicas no quadro de feedback e os comentários ou reações em pull requests continuam indisponíveis. |
| Visitante de link público | Somente o conteúdo publicado explicitamente pelo link; sem participação no projeto. |

Os leitores contam para o limite de convidados por projeto do plano, assim como os membros e os convites pendentes. Não há cobrança por assento.

Revise a lista de membros antes de remover alguém. A linha do proprietário não oferece uma ação de remoção; só uma [transferência](#transfer-ownership) muda o proprietário. O proprietário pode cancelar um convite pendente antes da aceitação, depois de confirmar em uma caixa de diálogo com o endereço convidado; o link do e-mail deixa então de funcionar, e a pessoa pode ser convidada novamente depois. O estado pendente não revela se aquele endereço já tem uma conta. A remoção encerra o acesso como membro; ela não recupera exportações, capturas de tela ou cópias já recebidas. As credenciais pessoais de Git, IA e MCP continuam pertencendo à conta e não são transferidas apenas porque a propriedade do projeto mudou.

### Alterar o papel de um membro {#change-role}

Como proprietário, abra **Configurações do projeto** → **Membros** e escolha o novo papel da pessoa: **Membro** ou **Leitor**. Para um leitor, escolha se **Pode comentar** fica ativado. Essa opção vem desativada por padrão e é desativada sempre que alguém se torna leitor, então confira-a depois de mudar um membro para Leitor. Seu próprio papel de proprietário só muda por meio de uma transferência.

Mudar um membro para Leitor também remove a atribuição dos tickets abertos dele e o tira da liderança dos objetivos dele, o que retira esses tickets do seu ciclo pessoal. Reatribua esse trabalho se ele deve continuar.

Uma mudança de papel vale a partir da próxima solicitação da pessoa, no aplicativo, no Numo e pelo MCP. O conteúdo que ela já carregou ou baixou não é recuperado, e um link de arquivo assinado que ela já abriu pode continuar válido por alguns minutos.

### Resolver a falta de acesso {#invitation-recovery}

Se um convite não aparecer, compare o e-mail convidado com a conta conectada e verifique a URL da instância. Peça ao proprietário que confira os convites pendentes em vez de criar contas repetidamente. Se o seu papel mudar durante uma sessão aberta, recarregue o destino e confira seu papel antes de repetir uma gravação. Um leitor que precisa editar pede ao proprietário que mude seu papel para Membro. Não compartilhe a sessão de outra pessoa para contornar um erro de acesso.

## Transferir a propriedade {#transfer-ownership}

Um projeto tem exatamente um proprietário. Para passá-lo adiante, abra **Configurações do projeto** → **Membros** como proprietário, escolha **Transferir a propriedade do projeto** para um membro existente e confirme. Só um Membro pode receber a propriedade; convide a pessoa ou mude um leitor para Membro antes. Depois da transferência, você continua no projeto como Membro.

### O que muda com a propriedade {#transfer-effects}

- Suas rotinas neste projeto são pausadas e não podem iniciar novo trabalho. O novo proprietário cria as rotinas que devem continuar com o próprio orçamento.
- Os limites do plano para tickets e convidados por projeto, o armazenamento e a IA em segundo plano, como o Smart Assign e a análise de feedback, passam a usar o plano e o orçamento do novo proprietário. Os tickets e os membros existentes são mantidos.
- As assinaturas, os métodos de pagamento e as chaves e conexões pessoais continuam com cada conta.
- Os convites pendentes continuam válidos.

A transferência falha sem alterar nada se o armazenamento do novo proprietário não comportar os arquivos do projeto, ou se ele já for proprietário de um projeto com a mesma chave. Libere armazenamento ou altere a chave do projeto e tente novamente.
