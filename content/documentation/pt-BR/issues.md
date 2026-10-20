---
{
  "id": "issues",
  "locale": "pt-BR",
  "title": "Problemas",
  "summary": "Crie e organize problemas, acompanhe seu ciclo de vida, gerencie dependências e planos e importe ou atualize o trabalho em massa.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 27,
  "sourceRevision": 27,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-680); MIN-721 removal of Numo code work; MIN-693 project roles; MIN-717 Smart Fill relations; MIN-718 hybrid issue search; MIN-728 one editor engine; MIN-733 always-on AI features; MIN-736 closed columns hidden by default; MIN-737 account settings reorganization; MIN-741 creation dialogs; MIN-742 resources; MIN-743 destructive-action confirmations; MIN-746 Smart Fill properties set by shortcut; MIN-749 relation shortcut R; UI/UX refinements batch: Create in project shortcut, closed issues in relation pickers",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "lib/smart-fill-fields.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/relation-target-picker.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 27,
    "fact": "agent:/root (MIN-719 prompt builders, prompt-context route and focused builder/caller tests; prior controls retain existing evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 12; pt-BR translation of removal edits; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-717 Smart Fill relations source review inherited from en revision 14; pt-BR translation of added passages; no browser walkthrough); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-734 typed mentions: source and unit-test review of the mention format, rendering and access rules; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (Command/Ctrl+K opens the selection actions: source and unit-test review of bulk-actions-context and use-command-palette-launcher; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-733 removal of the instance AI switches: source and unit-test review of the admin registry and every former switch reader; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 default status columns: source and unit-test review of lib/view-filter.ts and the board status filter; no browser walkthrough, no new captures); agent:/root (MIN-737 account settings reorganization: source review of the Smart Fill tab and its cards in components/settings/account-smart-fill-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared project-scoped fields and the identifier create button with its copy menu; create-an-issue-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen new-issue) and inspected; no other browser walkthrough); agent:/root (MIN-742 resources: source and unit-test review of renaming, removal confirmation, resource cards with a click and right-click menu and og:image link previews, file mentions opening the reader, and resource mentions scoped to their surface; issue-file-preview recaptured on 2026-10-19 in all six locales with captures/shots/file-preview and inspected; no other browser walkthrough); agent:/root (MIN-743 destructive-action confirmations: source review of the confirmation dialogs for relation removal; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-746 Smart Fill properties set by shortcut: source and unit-test review of lib/smart-fill-fields.ts, the creation dialog and the server fill in lib/server/create-issue.ts, which only infers empty properties; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-749 relation shortcut R: source and unit-test review of components/issue-field-shortcuts.tsx, the board card, issue panel, objective page and new-issue dialog relation pickers and lib/keyboard/shortcuts.ts; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of the Command/Ctrl+Shift+P Create in shortcut, its caret restoration and key hint in components/creation-project-select.tsx and the create.changeProject entry in lib/keyboard/shortcuts.ts; relation pickers (board card, issue panel, objective page, creation dialogs) now also list done, canceled and duplicate issues after open ones, which the existing relation prose does not contradict, so no prose change for it; no browser walkthrough, no new captures; unchanged evidence retained; the create-an-issue-steps capture predates the Create in key hint and the new Smart Fill icon)",
    "language": "agent:/root (pt-BR new copied-prompt section, translation and retained-meaning self-review); agent:/root/min721_pt-BR (pt-BR translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-717 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR removal of the sentences describing instance AI switches; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-736 added sentences with catalog status labels; agent review, not human acceptance); agent:/root (pt-BR MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-742 changed passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-743 confirmation clauses with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR translation of the MIN-746 added sentences; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-749 added sentences, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR translation of the Create in shortcut changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Criar e editar um problema",
    "Analisar trabalho recebido na triagem",
    "Acompanhar o ciclo de vida de um problema",
    "Discutir o trabalho e anexar seu contexto",
    "Vincular dependências e problemas relacionados",
    "Dividir um problema em subproblemas",
    "Manter um plano de implementação",
    "Repetir um problema depois de concluído",
    "Atualizar vários problemas juntos",
    "Importar um backlog CSV após conferir o mapeamento",
    "Mover uma tarefa pelo ciclo de vida"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/new-issue.png",
      "alt": "Rascunho não enviado no projeto Aurora com título, descrição, propriedades que podem ser escolhidas manualmente e o botão Criar AUR-19.",
      "caption": "Descreva o resultado esperado e escolha as propriedades úteis antes de criar o ticket.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/triage-incoming.png",
      "alt": "Problema recebido de demonstração DOC-11 com relato, propriedades e controles de duplicado, Recusar e Aceitar.",
      "caption": "Leia o relato recebido antes de aceitar, recusar ou vincular um duplicado.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        866
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/issue-statuses.png",
      "alt": "Os oito estados do ticket no seletor, com Backlog selecionado.",
      "caption": "A marca indica o estado atual. Escolha o que representa a situação real do trabalho.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        357
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-resources.png",
      "alt": "Janela para adicionar um link com um endereço de contato de exemplo.",
      "caption": "Confira o destino antes de adicionar o recurso. Este link de exemplo não foi enviado.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-dependencies.png",
      "alt": "Busca de um ticket bloqueador pelo identificador.",
      "caption": "Escolha o sentido da relação antes do destino. O seletor é mostrado sem enviar a relação.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        368,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-sub-issues.png",
      "alt": "Campo de criação de um subticket em um ticket pai de demonstração.",
      "caption": "O campo cria um filho deste ticket; cada filho mantém seu próprio status e discussão.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-implementation-plan.png",
      "alt": "Plano de demonstração com duas tarefas de trabalho concluídas de seis.",
      "caption": "O plano salvo distingue etapas concluídas, ativas e pendentes. O progresso não comprova a execução da tarefa fictícia de código.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/issue-date-recurrence.png",
      "alt": "Seletor de prazo no modo recorrente com prévia semanal aos domingos e horário opcional.",
      "caption": "O modo recorrente mostra a frequência semanal. Confirme o primeiro prazo antes de criar o ticket.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        337,
        544
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/import-issues-preview-workflow.png",
      "alt": "Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas.",
      "caption": "Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas. A importação não foi enviada; o planejamento opcional com IA foi bloqueado para a captura.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/file-preview.png",
      "alt": "Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar, Renomear e Remover.",
      "caption": "O visualizador compartilhado mantém Fechar abaixo da prévia. O menu Ações do arquivo oferece Baixar e, quando permitido, Renomear e Remover.",
      "revision": 27,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

Um problema, também chamado de issue nesta documentação, descreve uma atividade do projeto, desde a triagem até a verificação do resultado. Você pode acrescentar discussão, recursos, dependências, subproblemas e um plano, além de gerenciar recorrências ou ações em massa. A importação CSV cria novos problemas e exige o proprietário do projeto.

## Criar e editar um problema {#create-an-issue}

O controle para excluir um rascunho salvo abre uma confirmação. Cancelar mantém o rascunho; confirmar remove esse rascunho salvo. A mesma confirmação está disponível ao criar um objetivo.

Você precisa ser o proprietário ou um Membro do projeto de destino; os leitores podem abrir tarefas, mas não criá-las nem editá-las. Abra o projeto e o controle para criar uma tarefa. Informe um título que identifique o trabalho, depois acrescente contexto, resultado esperado e restrições na descrição. O formulário abre no projeto atual; escolha outro em **Criar em**, no canto superior esquerdo do formulário (ao lado do título **Novo problema** no celular), principalmente ao criar em uma visualização pessoal ou entre projetos. No computador, Command/Ctrl+Shift+P abre esse menu mesmo enquanto você digita o título ou a descrição; ao escolher um projeto ou fechar o menu, o cursor volta exatamente para onde estava. A pílula mostra esse atalho, que só existe quando mais de um projeto pode ser escolhido; no celular, nenhum atalho é indicado. Trocar de projeto remove as categorias, o objetivo e as relações escolhidos para o anterior. O botão de criação mostra o identificador que a tarefa receberá, como `MIN-42`, e acompanha as tarefas criadas nesse meio-tempo; seu menu cria a tarefa e copia esse identificador.

Para criar a tarefa manualmente, desative Preenchimento inteligente se o botão estiver visível e ativado. Isso mostra os controles de prioridade, esforço, categorias, objetivo e relações para que você os defina. Para definir apenas algumas dessas propriedades, mantenha o Preenchimento inteligente ativado e, fora do título e da descrição, pressione a tecla da propriedade: P para prioridade, E para esforço, L para categorias ou O para objetivo. O seletor dela se abre, e o valor escolhido continua visível. O Preenchimento inteligente só deduz as propriedades que você deixou vazias. A escolha vale para essa tarefa; ao reabrir o formulário de criação, a preferência da conta é restaurada. Ela é independente dos controles de automação e Smart Assign do projeto. Enquanto o Preenchimento inteligente está ativado, ele também [vincula a tarefa a problemas relacionados](#smart-fill-relations) depois que ela é salva, por isso o seletor de relações fica oculto; R o abre mesmo assim. As relações que você já escolheu continuam visíveis acima do título e são criadas com a tarefa.

Defina as propriedades úteis antes de confirmar: estado, prioridade, esforço, responsável, objetivo, categorias, prazo e recorrência. O responsável é o proprietário do projeto ou um Membro, nunca um leitor; um objetivo agrupa tarefas em torno de um resultado do projeto. Você pode deixar propriedades opcionais sem valor em vez de adivinhar. A prioridade vai de nenhuma a baixa, média, alta e urgente; o esforço usa XS, S, M, L e XL.

Confirme a criação e abra a nova tarefa. Confira seu identificador e projeto. Abra novamente os seletores de propriedades para mudar valores conforme a tarefa ficar mais clara. A descrição explica o trabalho; o plano de implementação é mantido separadamente na aba do plano.


![Rascunho não enviado no projeto Aurora com título, descrição, propriedades que podem ser escolhidas manualmente e o botão Criar AUR-19.](/documentation/pt-BR/new-issue.png)

A descrição, os comentários e a janela de novo problema usam o mesmo editor das páginas do projeto, sem as alças de bloco. Digite `/` para inserir um título, uma lista, uma tarefa, uma citação, um **Destaque**, um bloco de código, um bloco **Alternar** ou um divisor, e `@` para mencionar uma pessoa, um problema, um objetivo ou uma página. O menu `@` também lista os recursos anexados ao que você está escrevendo: o problema ou objetivo para a descrição e o plano, um comentário para os próprios arquivos ou uma janela de criação para os arquivos adicionados nela. Uma menção a um recurso anexado em outro lugar aparece como **Indisponível**. Várias pessoas podem editar a mesma descrição ao mesmo tempo: o cursor de cada uma aparece com seu nome e sua cor, e as alterações de Numo ou de um agente conectado aparecem assim que são salvas. Numo, os agentes conectados e as exportações CSV leem o texto em Markdown, que é atualizado alguns segundos depois que a digitação para. Selecione um texto para deixá-lo em negrito, itálico, tachado ou código, ou para adicionar um link. Cole ou solte uma imagem para inseri-la na descrição; os outros tipos de arquivo ficam nos recursos do problema. Uma menção aponta para o seu destino, não para o seu nome: ela acompanha uma renomeação e resiste a edições e a copiar e colar em outra descrição, um comentário, uma página ou o compositor do Numo. Quem não pode abrir o destino vê uma menção **Indisponível**, sem o nome nem o projeto.

### Verificar salvamento e visibilidade {#issue-save}

Depois de mudar uma propriedade, verifique o valor exibido. Os filtros podem remover uma tarefa da visualização atual imediatamente quando seu responsável, estado ou categoria mudar. Pesquise o identificador ou abra o projeto sem esses filtros antes de criar um substituto.

Se a criação ou o salvamento falhar, preserve o texto, leia o erro e confira se a participação e o destino ainda existem. Antes de repetir após uma falha de rede, verifique se a tarefa já foi criada. Vincule páginas do projeto como recursos atualizados quando precisar do conteúdo atual e use comentários para discutir a tarefa.

### Escolher o que o Preenchimento inteligente faz {#smart-fill-preferences}

As preferências do Preenchimento inteligente pertencem à sua conta. Abra **Configurações da conta** → **Smart Fill**. Cada opção tem seu próprio cartão:

- No cartão **Smart Fill**, **Ativar o Smart Fill** liga ou desliga o Preenchimento inteligente na sua conta. Ele completa prioridade, esforço, categorias e objetivo ausentes; estado, responsável e prazo continuam por sua conta. Os interruptores dos dois cartões seguintes dependem dele.
- Em **Tickets a preencher**, **Preencher tickets criados** e **Preencher tickets na triagem** escolhem quais problemas novos ele completa: os que você cria e os problemas em triagem pelos quais você é responsável.
- Em **Tickets relacionados**, **Vincular tickets relacionados**, ativado por padrão, permite que o Preenchimento inteligente [adicione relações](#smart-fill-relations) depois que um problema é salvo.
- Em **Indexação de tickets**, **Indexar tickets**, ativado por padrão e independente do Preenchimento inteligente, transforma o título e a descrição dos problemas que você cria ou edita em vetores privados usados para encontrar problemas relacionados e para [buscar problemas pelo sentido](/docs/navigation#search-by-meaning). A indexação em segundo plano dos problemas existentes de um projeto respeita tanto o interruptor do proprietário do projeto quanto o do autor: um problema cujo autor o desligou nunca é indexado. Os vetores são criptografados com o projeto, como o problema; os salvos antes de o projeto passar a criptografar são convertidos pela tarefa em segundo plano. Com o interruptor desligado, nenhum vetor é criado para os seus problemas, mesmo quando outra pessoa os edita, e a busca de problemas relacionados compara apenas palavras. Suas próprias buscas passam então a usar só o texto, sem busca pelo sentido. Os vetores já criados permanecem enquanto o texto não muda; são excluídos assim que o texto muda, ou junto com o problema.

Desligar um interruptor também cancela as execuções que ainda não aconteceram. O Numo pode alterar essas preferências quando você pedir.

## Analisar trabalho recebido na triagem {#triage-incoming-work}

Os filtros da lista permitem restringir os tickets recebidos por prioridade, esforço, responsável, objetivo, categorias ou integração. Valores da mesma propriedade são alternativas; propriedades diferentes são combinadas. Redefina os filtros para mostrar todos os tickets recebidos novamente.

Abra o destino Triagem do projeto. Leia o problema recebido e o contexto de origem antes de aceitá-lo no trabalho planejado. Confira se um problema existente já representa a solicitação. Esclareça resultado esperado, projeto, responsável, prioridade e esforço conforme necessário.

Escolha Aceitar e confirme para mover ao Backlog um problema que pretende manter. Escolha Recusar e confirme para definir o estado Cancelada. Se for uma duplicata, use o seletor de duplicatas para escolher o problema que será mantido. O problema recebido assume o estado Duplicado e aponta para o escolhido. Descrever a solicitação na busca do seletor também lista problemas parecidos em **Relacionados pelo sentido**, depois das correspondências de texto; veja [Buscar problemas pelo sentido](/docs/navigation#search-by-meaning). Quando um item sai da triagem, o seguinte é selecionado. Confira o estado resultante ou o link da duplicata no próprio problema. Passar de um cartão para outro sem realizar uma dessas ações não encerra o problema.

### Ordenação e limites {#triage-order}

O Smart Triage usa regras de ordenação determinísticas.

Dentro de cada coluna de estado, os problemas abertos que bloqueiam outro trabalho aberto ficam primeiro, antes dos problemas sem bloqueio. Problemas bloqueados por trabalho aberto ficam por último, mesmo que também bloqueiem outros. Pontas encerradas da relação deixam de gerar essa prioridade.

Dentro de cada nível, prioridade maior, esforço menor e prazos vencidos ou próximos adiantam o trabalho. No mesmo nível de bloqueio, os problemas de um objetivo permanecem juntos, e o grupo é ordenado pelo seu problema mais bem posicionado. Os empates são resolvidos pelo prazo, pela data de criação mais antiga, pela posição manual e, por fim, pelo identificador, que mantém a ordem estável. Uma relação de vínculo não afeta essa ordenação.

O Smart Triage não é um modo experimental de triagem com IA. A ordem ajuda a decidir quais itens analisar primeiro; ela não comprova a veracidade de uma descrição, não resolve duplicatas automaticamente nem concede permissões.

Se o item esperado não aparecer, confira projeto ativo, estado e filtros, depois pesquise seu identificador. Trabalho importado ou sincronizado externamente pode entrar na triagem; inspecione a origem e o mapeamento da integração antes de alterar campos sincronizados. Uma solicitação vinculada pelo feedback continua sendo um objeto de feedback distinto com sua própria discussão pública.


![Problema recebido de demonstração DOC-11 com relato, propriedades e controles de duplicado, Recusar e Aceitar.](/documentation/pt-BR/triage-incoming.png)

## Acompanhar o ciclo de vida de um problema {#issue-statuses}

Abra o seletor de estado da tarefa ou use as ações de estado do quadro. Em uma visualização kanban, mover trabalho entre colunas altera a própria tarefa; mudar um filtro altera apenas o que você vê. Verifique o novo estado no painel de detalhes após a movimentação.

| Estado | Uso |
| --- | --- |
| Triagem | Trabalho recebido aguardando análise. |
| Backlog | Trabalho mantido, mas ainda não escolhido para começar. |
| A fazer | Trabalho escolhido para ser feito. |
| Em andamento | Trabalho em execução. |
| Em revisão | Implementação aguardando revisão. |
| Concluído | Resultado esperado concluído. |
| Cancelada | Trabalho encerrado sem entrega. |
| Duplicado | Trabalho representado por outra tarefa. |

Os estados são fixos e não são personalizados por projeto. Triagem e Duplicado estão disponíveis nos seletores, mas ficam deliberadamente fora das colunas kanban normais. Por padrão, os quadros também ocultam as colunas **Concluído** e **Cancelada**; selecione-as no filtro **Status** para mostrá-las. A ausência de uma coluna não indica que o estado ou a tarefa não exista.


![Os oito estados do ticket no seletor, com Backlog selecionado.](/documentation/pt-BR/issue-statuses.png)

### Estados finais e verificação {#closed-work}

Concluído, Cancelada e Duplicado são estados finais para acompanhamento: deixam de bloquear tarefas dependentes e saem das contagens ativas. Encerrar como Cancelada não significa que a tarefa foi entregue. Ao marcar uma duplicata, identifique a tarefa mantida para dar um destino claro à discussão e ao progresso.

Confira os filtros se uma tarefa desaparecer depois de encerrada. Abra-a novamente pelo identificador para inspecionar o resultado e mudar o estado se a encerrou por engano. Para trabalho bloqueado, confira também a direção da dependência: mudar o estado de uma tarefa não reescreve sua descrição ou plano.

## Discutir o trabalho e anexar seu contexto {#issue-discussion-and-resources}

Abra a linha do tempo da discussão do problema para adicionar um comentário. Explique uma decisão, pergunta ou resultado de verificação para que outro membro entenda o que mudou. Use menções quando precisar de uma pessoa ou objeto vinculado no contexto; as notificações ainda dependem das preferências do destinatário e da entrega no dispositivo. Um leitor só pode comentar quando o proprietário ativou **Pode comentar** para ele. Nesse caso, ele pode responder, mencionar pessoas, anexar arquivos aos próprios comentários e editar ou excluir os próprios comentários.

Anexe uma página relevante do projeto, um arquivo ou um link pelos controles de recursos. Uma página vinculada é um recurso atualizado: seu título acompanha renomeações e o conteúdo pode evoluir. Um arquivo é um anexo armazenado, não uma garantia de que uma URL externa continuará disponível.

Os recursos aparecem como cartões: a própria imagem ou o ícone do tipo de arquivo, o nome e o tamanho. Um link mostra a imagem de prévia da página quando o site oferece uma; caso contrário, o favicon. Clique ou clique com o botão direito em um cartão para abrir o menu: Visualização, Abrir link ou Abrir página, depois Renomear, Baixar e Remover quando se aplicam. Visualização abre um arquivo compatível em toda a janela. Imagens, PDF, Markdown (`.md`), texto simples (`.txt`, `.text`), CSV e formatos de áudio ou vídeo compatíveis usam o mesmo visualizador. O Markdown recebe formatação, o texto permanece literal e o CSV abre como tabela com rolagem. Use Fechar ou Escape para voltar ao ticket. O menu Ações do arquivo (`…`) oferece Baixar e, quando você pode alterar esse recurso, Renomear e Remover. Clicar na menção de um arquivo em um texto abre o mesmo visualizador. O Minddy pede confirmação antes de remover um recurso, que então é desvinculado deste contexto. Um recurso de página mantém o título da página e não pode ser renomeado. Os formatos não compatíveis mantêm a ação de download.

![Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar, Renomear e Remover.](/documentation/pt-BR/file-preview.png)

![Janela para adicionar um link com um endereço de contato de exemplo.](/documentation/pt-BR/work-resources.png)

### Visibilidade e uploads com falha {#resource-access}

A participação e o acesso ao projeto regem a discussão e os recursos internos. Adicionar um recurso a um problema não o publica para visitantes anônimos. Ao se referir ao feedback, diferencie a discussão interna da equipe de uma resposta pública antes de enviar texto.

Depois da operação, confira se o recurso enviado aparece e pode ser aberto. Se houver falha, preserve o arquivo original, leia o erro de upload e verifique o limite aplicável de tamanho de arquivo ou armazenamento da conta. Operadores de instâncias auto-hospedadas também precisam de metadados, políticas e bytes do Storage funcionais. Evite anexar credenciais ou despejos privados de diagnóstico.

## Vincular dependências e problemas relacionados {#issue-dependencies}

Abra os controles de relações de um problema e encontre o outro pelo título ou identificador. Fora de um campo de texto, R abre a escolha do tipo de relação a partir de um cartão sob o ponteiro ou do painel do problema. Uma busca descritiva também lista, depois das correspondências de texto, problemas do mesmo projeto encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**. Escolha uma relação de bloqueio quando uma tarefa precisar terminar antes que outra possa avançar. Se A bloqueia B, A é o pré-requisito e B é bloqueado por A. Uma relação de vínculo acrescenta contexto sem impor essa ordem.

Leia os dois identificadores e a direção exibida antes de confirmar. Por exemplo, “Preparar o endpoint” bloqueia “Conectar o cliente”, e não o contrário. Uma dependência não transforma nenhum problema em subproblema, e uma relação de pai e filho não substitui uma relação de bloqueio.

![Busca de um ticket bloqueador pelo identificador.](/documentation/pt-BR/work-dependencies.png)

### Bloqueios resolvidos e herdados {#blocker-state}

Os estados finais Concluído, Cancelada e Duplicado fazem um problema deixar de bloquear trabalho. As relações conectam problemas ou objetivos do mesmo projeto; as duas pontas precisam estar acessíveis nele. Elas não conectam trabalho privado arbitrário entre projetos nem publicam nenhuma das pontas.

Um problema aberto pode herdar um bloqueio pelo seu objetivo aberto. Se A bloqueia o objetivo B, os problemas abertos vinculados a B mostram A como bloqueio herdado, mesmo sem uma relação direta de A ao problema. A interface identifica o pré-requisito real e o objetivo que transmite o bloqueio. Examine essa relação do objetivo antes de tentar removê-la do problema. Encerrar A, encerrar B ou retirar o problema de B elimina o bloqueio herdado. Esse mecanismo segue a participação no objetivo, não a hierarquia entre problema pai e subproblemas.

Remova uma relação pelos seus controles quando ela deixar de fazer sentido; uma confirmação nomeia o outro problema ou objetivo, e só o vínculo é removido. Depois verifique tanto o rótulo quanto o indicador de bloqueio. Marcar um problema como duplicata tem efeitos no ciclo de vida e aponta para o trabalho mantido. Use essa ação para tarefas duplicadas, em vez de criar uma relação comum e supor que isso encerra a duplicata.

Se o seletor de relações não encontrar um problema, confira o acesso ao projeto e o identificador. Não exponha conteúdo de outro projeto colando a URL de um problema privado em uma resposta pública de feedback.

### Vínculos adicionados pelo Preenchimento inteligente {#smart-fill-relations}

Com **Vincular tickets relacionados** ativado, o Preenchimento inteligente procura problemas relacionados depois que um problema é criado ou que seu título ou sua descrição muda. O trabalho acontece em segundo plano após o salvamento: a criação e a edição nunca esperam por ele, e os vínculos podem aparecer alguns segundos depois. Para um problema novo, ele segue as mesmas escolhas dos outros campos, então não é executado se você desativou o Preenchimento inteligente para esse problema. Ele não é executado para problemas importados de um repositório vinculado, para cópias recorrentes nem para alterações sincronizadas a partir do repositório.

O Preenchimento inteligente compara o problema com no máximo cinco candidatos do mesmo projeto, deixando de fora problemas cancelados, duplicados ou excluídos. Em seguida, uma decisão classifica cada candidato como relacionado, bloqueador, bloqueado por ou sem relação. A semelhança sozinha nunca cria um vínculo, uma dependência exige indícios mais fortes que uma relação simples e, na dúvida, o Preenchimento inteligente não adiciona nada. Uma única execução adiciona no máximo três relações. Ela nunca mexe em um par que já tem uma relação, nunca adiciona um bloqueio que fecharia um ciclo e descarta o resultado se o texto do problema mudou durante a decisão. Ela nunca marca uma duplicata e nunca muda um estado.

Os vínculos adicionados assim aparecem nas relações do problema como qualquer outro, e o histórico indica Smart-fill como autor. Confira a direção de uma dependência como faria com as suas. Para remover um vínculo, use os controles de relações: o Preenchimento inteligente não adiciona de novo um vínculo removido para esse par. Para deixar de receber vínculos novos, desative **Vincular tickets relacionados** nas [suas preferências](#smart-fill-preferences). Problemas criados antes deste recurso, problemas importados e problemas sincronizados de um repositório são indexados aos poucos em segundo plano, mas nunca recebem vínculos automáticos.

A indexação e as decisões de relação usam IA. Elas contam na parcela **Automações** da conta responsável pela execução: a conta cobrada pelo Preenchimento inteligente do problema novo, geralmente quem o criou; quem edita, em uma edição; e o proprietário do projeto, na indexação em segundo plano. O histórico de uso mostra a indexação como **Smart-fill · índice de problemas**. Uma decisão de relação aparece como **Decisão de IA** quando o modelo de decisão a toma, e como **Smart-fill · relações** quando o modelo de reserva a toma. Se esse orçamento acabar ou o provedor falhar, a execução é ignorada e o problema não muda. [A busca de problemas pelo sentido](/docs/navigation#search-by-meaning) usa o mesmo índice: cada busca nova conta na parcela **Automações** da conta que busca e aparece como **Busca de problemas**.

## Dividir um problema em subproblemas {#sub-issues}

Abra o problema pai e use os controles de subproblemas para criar partes menores do trabalho. Dê a cada filho um resultado distinto. Depois da criação, confira projeto, propriedades e identificador do pai; uma hierarquia deve facilitar o acompanhamento, não substituir a descrição do que cada filho precisa alcançar.

A hierarquia permite um nível: o pai precisa ser um problema de nível superior no mesmo projeto, e um subproblema não pode ter filhos. Quando você não escolhe explicitamente um objetivo na criação, o filho herda o objetivo do pai. Confira as propriedades resultantes em vez de supor que alterações posteriores no pai serão propagadas.

Um filho continua sendo um problema com seu próprio estado e discussão. O indicador de progresso do pai é ponderado pelo esforço dos filhos e pela parcela de conclusão atribuída ao estado de cada um. O contador de concluídos/total na lista de subproblemas é uma contagem separada, sem ponderação. Leia os estados dos filhos junto com as duas medidas. Use uma dependência para dizer “precisa terminar antes” e um pai para dizer “faz parte desta tarefa maior”.

![Campo de criação de um subticket em um ticket pai de demonstração.](/documentation/pt-BR/work-sub-issues.png)

### Abrir ou remover a relação com o pai {#change-parent}

O identificador do pai ao lado do título do filho abre um menu. Use a ação de abrir o pai para inspecionar a tarefa maior. Para separar o filho, escolha desvinculá-lo do pai e leia a confirmação antes de aplicar. A desvinculação bem-sucedida remove a relação e mantém o problema.

Não exclua um filho apenas para reorganizar a hierarquia. Confira as relações existentes antes de mudar o pai e resolva uma relação rejeitada em vez de forçar uma hierarquia circular. Se o salvamento falhar, reabra o filho para ver se a mudança foi aplicada antes de tentar novamente. Preserve o trabalho concluído dos filhos ao revisar o plano geral.

## Manter um plano de implementação {#implementation-plans}

Abra a aba do plano do problema. A descrição já deve indicar o problema e o resultado esperado. Adicione etapas de implementação manualmente ou peça ao Numo que examine o repositório vinculado antes de propor um plano em nível de código. Um caminho ou uma função gerados por IA não são evidência se o repositório não foi realmente lido.

O plano é editado no próprio lugar, como a descrição: clique nele e escreva, sem modo de edição nem botão de salvar. Um plano vazio mostra um texto de orientação. Vários membros, o Numo e os agentes conectados podem editar o mesmo plano ao mesmo tempo, cada um com um cursor identificado, e uma tarefa marcada por um agente aparece no seu editor enquanto você escreve em outro trecho. Digite `- [ ]` seguido de um espaço no início de uma linha, ou escolha **Lista de tarefas** no menu `/`, para adicionar uma tarefa. Clique na caixa de uma tarefa para concluí-la, ou abra o menu dela para os outros estados.

Pressione Tab em uma tarefa para aninhá-la sob a anterior e Shift+Tab para trazê-la de volta; no Markdown salvo, cada nível é recuado com dois espaços. O aninhamento organiza as etapas do plano e não cria relações entre problemas pai e filho. Cada tarefa de trabalho não cancelada continua contando para o progresso, inclusive as aninhadas.

O plano usa linhas de tarefas Markdown: `- [ ]` para pendente, `- [~]` para em andamento, `- [x]` para concluída e `- [-]` para cancelada. Escreva o texto da tarefa após o marcador, por exemplo `- [ ] Verificar o link de contato no celular`. Tarefas canceladas ficam fora da contagem de conclusão. As tarefas sob um título Questions reconhecido são tratadas como perguntas e também ficam fora do progresso; mantenha os passos de trabalho em outra seção no mesmo nível de título. O título reconhecido é `Questions`, com essa palavra em inglês. O editor mostra essas linhas como tarefas e as grava de volta no mesmo formato, que o Numo e os agentes conectados leem. Use pendente, em andamento, concluída e cancelada para representar o que aconteceu, sem sugerir verificações que não foram executadas.

![Plano de demonstração com duas tarefas de trabalho concluídas de seis.](/documentation/pt-BR/work-implementation-plan.png)

### Preservar progresso e edições simultâneas {#plan-progress}

Amplie ou altere o plano existente em vez de substituí-lo por uma cópia nova sem marcações. Preserve as etapas concluídas e as explicações de mudanças de escopo. As alterações de outros membros e agentes aparecem no plano à medida que são feitas. Uma ferramenta que substitui o plano inteiro ainda substitui os trechos que reescreve, então peça aos agentes que editem apenas a parte que mudam.

Para implementar o plano, copie o prompt do problema para seu próprio agente de código, como descrito abaixo. Uma tarefa marcada não prova por si só que o código passa nos testes. Leia resultado, mudanças e verificações antes de marcar o problema como concluído.

### Copiar um prompt para outro agente de código {#copy-issue-prompt}

Para entregar um problema a um agente de código fora do Minddy, como Claude Code, Codex ou Cursor, abra o menu de ações do problema, escolha **Copiar como prompt** e depois **Gerar um plano** (ou **Revisar o plano** quando já existir um), **Implementar o problema**, **Verificar a implementação** ou **Personalizado…**. Com vários problemas selecionados, **Copiar o prompt combinado** reúne todos em um único prompt. Copiar não executa nenhum modelo de IA nem consome sua cota de IA: o Minddy reúne o que já tem armazenado e o agente explora o repositório por conta própria. Se **Iniciar o problema ou tarefa quando eu copiar seu prompt** estiver ativado nas preferências da conta, copiar também inicia um problema que ainda não foi iniciado. Consulte [Trabalho de código e pull requests](/docs/code-work) para o fluxo completo e a revisão de pull requests.

O prompt traz os campos do problema, suas categorias, suas relações, o número de recursos anexados e o progresso do plano, mas não o texto do plano, que o agente lê pelo servidor MCP do Minddy ou pede a você. Ele também indica o repositório vinculado ao projeto e cada pull request vinculada ao problema, com seu estado e suas branches quando conhecidos. O agente continua uma pull request aberta na branch dela e trata as mescladas ou fechadas como histórico. Sem uma pull request aberta, o prompt sugere um nome de branch formado pelo identificador do problema e um título curto, por exemplo `min-42-keyboard-navigation`. É apenas uma sugestão: o agente verifica primeiro as branches existentes e segue a convenção de nomes do repositório. Manter o identificador no nome da branch, no título da pull request ou em uma linha `Fixes MIN-42` permite que o Minddy vincule a pull request ao problema quando o repositório está vinculado.

Se as informações de pull request não puderem ser carregadas, o prompt informa isso em vez de afirmar que não há nenhuma. Os prompts de plano e de revisão do plano pedem que o agente pare antes de implementar. Um prompt personalizado mantém seu pedido e o escopo dele como você escreveu. O conteúdo do problema e seu pedido mantêm o idioma original; as instruções ao redor ficam em inglês.

## Repetir um problema depois de concluído {#recurring-issues}

Crie ou abra um problema que continue útil a cada repetição, como uma verificação periódica de dependências. Defina um prazo, depois escolha uma recorrência diária, semanal, mensal ou anual no controle de data do problema. Uma recorrência sem prazo é rejeitada. Revise propriedades e responsável antes de salvar. As configurações de recorrências do projeto listam as séries ativas; use-as para mudar a frequência ou interromper a repetição.

Problemas recorrentes são recriados depois que o anterior fica “Concluído”; o próximo é criado no Backlog. Confira o identificador e as propriedades do próximo problema após concluir uma recorrência.

O próximo prazo é calculado somando um intervalo de recorrência ao prazo anterior, não a partir do dia em que você concluiu a tarefa. O sucessor copia título, descrição, prioridade, esforço, responsável, objetivo e categorias. Não copia o plano de implementação, a relação com o pai, os recursos nem os comentários. A recorrência passa para o sucessor; reabrir e concluir novamente o problema antigo não cria outra ocorrência. Se a criação do sucessor falhar, a série para em vez de tentar repetidamente a partir do problema concluído. Examine o resultado e configure a recorrência na próxima tarefa apropriada depois de resolver a falha. Não suponha que um calendário execute código ou conclua o novo problema por você.


![Seletor de prazo no modo recorrente com prévia semanal aos domingos e horário opcional.](/documentation/pt-BR/issue-date-recurrence.png)

### Mudar ou interromper a repetição {#recurrence-change}

Use as configurações de recorrência para editar ou desabilitar repetições futuras. Inspecione separadamente os problemas já criados: parar a criação futura não significa que o trabalho existente foi concluído ou removido.

Uma rotina do Numo é um objeto diferente: ela agenda uma conversa e pode usar o orçamento de IA do proprietário e os provedores configurados. Escolha problemas recorrentes para uma tarefa repetida acompanhável e uma rotina para uma instrução que precisa ser executada em um horário. Se o próximo problema não aparecer, confira se o anterior foi marcado como concluído, se a recorrência ainda está habilitada e se está vendo o Backlog sem filtros restritivos.

## Atualizar vários problemas juntos {#bulk-issue-actions}

No quadro, mantenha Shift pressionado e clique em cada cartão para adicioná-lo à seleção ou removê-lo dela. Com o mouse, você também pode arrastar um retângulo de seleção a partir de um espaço vazio do quadro. Shift, Command ou Ctrl fazem esse gesto ampliar a seleção existente. O retângulo não é um modo de seleção para telas sensíveis ao toque. Confira a quantidade selecionada e os identificadores visíveis antes de abrir as ações em lote. A seleção é um conjunto de trabalho para a ação, não uma visualização salva nem uma concessão de permissão. Abra-as com **Ações** na barra de seleção ou pressione Command+K no macOS ou Ctrl+K no Windows/Linux enquanto houver problemas selecionados.

Escolha Ações na barra flutuante de seleção para abrir a paleta de comandos. Escolha estado, prioridade, esforço ou responsável, defina o valor e confirme o formulário integrado. A ação de objetivo aparece somente quando a seleção pertence a um único projeto com objetivos disponíveis. Outras ações, como adicionar ou remover do ciclo, vincular dois problemas ou enviar a seleção ao Numo, aparecem quando o quadro atual oferece suporte a elas. Confira os problemas afetados depois. Em um dispositivo somente de toque sem um gesto de seleção múltipla compatível, edite cada problema pelo painel de detalhes.

### Resultados parciais e ações destrutivas {#bulk-results}

Ao trabalhar entre projetos, verifique sua participação em cada projeto afetado. Leia os resultados de falhas parciais: alterações bem-sucedidas podem já estar salvas mesmo que outro problema tenha sido rejeitado. Inspecione o resultado antes de repetir a seleção inteira.

A exclusão afeta todos os itens selecionados, então confirme o conjunto antes de continuar. Limpe a seleção depois da operação se for passar para outro trabalho. Se a atualização mudar os resultados dos filtros, problemas podem sair da visualização exibida e permanecer no projeto. Pesquise os identificadores para verificar o novo estado em vez de recriá-los.

## Importar um backlog CSV após conferir o mapeamento {#import-issues}

O proprietário do projeto abre Importação nas configurações do projeto e seleciona uma exportação CSV. Os formatos do Linear e do Jira são reconhecidos; os demais CSVs usam o mapeamento genérico. O limite por importação é de 5 MiB e 5.000 tarefas. Divida uma exportação maior de forma planejada e, quando possível, mantenha as referências às tarefas pai no mesmo lote.

Mapeie a coluna de título antes de importar. Confira descrição, status, prioridade, esforço, prazo, categorias e responsáveis. Associe as pessoas a membros reais do projeto e examine as novas categorias. As referências aos pais correspondem a chaves externas no lote e permitem um único nível. Os CSVs não importam os bytes dos arquivos anexos.

Uma proposta de IA só é solicitada para lacunas no mapeamento. Ela pode ser editada; se o provedor falhar ou estiver indisponível, o mapeamento manual continua disponível. Uma correção manual impede que uma proposta tardia sobrescreva suas escolhas.

### Importar e verificar {#result}

Depois de cada mudança de mapeamento, leia as contagens de tarefas, a distribuição de status e os avisos. Corrija as linhas ignoradas ou inválidas antes de confirmar. A importação cria novas tarefas; não suponha que enviar o arquivo novamente seja uma atualização que elimina duplicatas. Após o sucesso, confira tarefas representativas, responsáveis, datas e vínculos com pais. Se a resposta se perder, examine o projeto antes de reenviar o arquivo inteiro, para evitar trabalho duplicado.

![Prévia CSV de duas linhas de demonstração traduzidas e das colunas detectadas.](/documentation/pt-BR/import-issues-preview-workflow.png)

## Exportar issues em CSV {#export-issues}

Como membro conectado de um projeto, abra a paleta com Command+K no macOS ou Ctrl+K nos outros sistemas e procure “Exporte os problemas como CSV”. Escolha o comando, selecione um projeto ou todos os projetos acessíveis e confira as caixas de status. A página do projeto atual pré-seleciona esse projeto. Issues concluídas, canceladas e duplicadas ficam excluídas por padrão; inclua-as para obter o histórico completo. Pelo menos um status deve permanecer selecionado. Os filtros do quadro e os cartões selecionados não definem essa exportação.

Escolha Exportar e confira a confirmação do download e a quantidade informada. O CSV UTF-8 contém identificadores, títulos, descrições Markdown, status, prioridades, esforço, categorias, responsáveis, objetivos, nomes de projetos, datas e identificadores das issues pai. O acesso fica limitado aos seus projetos acessíveis. Um arquivo somente com cabeçalhos pode indicar que nenhuma issue acessível corresponde aos critérios. Ao compartilhar o arquivo, considere as descrições e os nomes como dados do projeto.

### Conferir a integridade e reimportar {#export-issues-limits}

A exportação é limitada a 20.000 issues. Um aviso de truncamento indica que o arquivo pode estar incompleto. Reduza o escopo por projeto e status, exporte grupos separados e compare as quantidades. Repetir o mesmo escopo não busca uma página seguinte. Se o download falhar, confira o erro, sua sessão e o acesso ao projeto antes de tentar novamente.

O formato pode ser [importado no minddy](#import-issues), com permissão do proprietário de destino e após revisar o mapeamento. A importação cria novas issues; não restaura os identificadores originais nem atualiza as existentes. Mantenha as linhas pai no mesmo lote de importação. O CSV transporta dados das issues, não um backup de anexos, comentários, configurações da conta ou credenciais. Para transferir uma conta, use o [guia de transferência entre instâncias](/docs/transfer-between-instances).
