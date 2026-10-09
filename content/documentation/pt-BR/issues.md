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
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "captures/shots/relations/intent.md",
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
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "alt": "Rascunho não enviado com título, descrição e propriedades que podem ser escolhidas manualmente.",
      "caption": "Descreva o resultado esperado e escolha as propriedades úteis antes de criar o ticket.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        368
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
      "revision": 5,
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
      "revision": 5,
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
      "revision": 5,
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
      "revision": 5,
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
      "revision": 5,
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
      "revision": 5,
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
      "revision": 5,
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
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-bulk-actions.png",
      "alt": "Menu de ações para dois tickets de demonstração selecionados.",
      "caption": "O menu atua nos tickets selecionados. Nenhuma alteração em grupo foi enviada nesta captura.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        506
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24
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
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

Um problema, também chamado de issue nesta documentação, descreve uma atividade do projeto, desde a triagem até a verificação do resultado. Você pode acrescentar discussão, recursos, dependências, subproblemas e um plano, além de gerenciar recorrências ou ações em massa. A importação CSV cria novos problemas e exige o proprietário do projeto.

## Criar e editar um problema {#create-an-issue}

Você precisa participar do projeto de destino. Abra o projeto e o controle para criar uma tarefa. Informe um título que identifique o trabalho, depois acrescente contexto, resultado esperado e restrições na descrição. Escolha o projeto deliberadamente ao criar em uma visualização pessoal ou entre projetos.

Para criar a tarefa manualmente, desative Preenchimento inteligente se o botão estiver visível e ativado. Isso mostra os controles de prioridade, esforço, categorias e objetivo para que você os defina. A escolha vale para essa tarefa; ao reabrir o formulário de criação, a preferência da conta é restaurada. Ela é independente dos controles de automação e Smart Assign do projeto.

Defina as propriedades úteis antes de confirmar: estado, prioridade, esforço, responsável, objetivo, categorias, prazo e recorrência. O responsável é um membro do projeto; um objetivo agrupa tarefas em torno de um resultado do projeto. Você pode deixar propriedades opcionais sem valor em vez de adivinhar. A prioridade vai de nenhuma a baixa, média, alta e urgente; o esforço usa XS, S, M, L e XL.

Confirme a criação e abra a nova tarefa. Confira seu identificador e projeto. Abra novamente os seletores de propriedades para mudar valores conforme a tarefa ficar mais clara. A descrição explica o trabalho; o plano de implementação é mantido separadamente na aba do plano.


![Rascunho não enviado com título, descrição e propriedades que podem ser escolhidas manualmente.](/documentation/pt-BR/new-issue.png)

### Verificar salvamento e visibilidade {#issue-save}

Depois de mudar uma propriedade, verifique o valor exibido. Os filtros podem remover uma tarefa da visualização atual imediatamente quando seu responsável, estado ou categoria mudar. Pesquise o identificador ou abra o projeto sem esses filtros antes de criar um substituto.

Se a criação ou o salvamento falhar, preserve o texto, leia o erro e confira se a participação e o destino ainda existem. Antes de repetir após uma falha de rede, verifique se a tarefa já foi criada. Vincule páginas do projeto como recursos atualizados quando precisar do conteúdo atual e use comentários para discutir a tarefa.

## Analisar trabalho recebido na triagem {#triage-incoming-work}

Abra o destino Triagem do projeto. Leia o problema recebido e o contexto de origem antes de aceitá-lo no trabalho planejado. Confira se um problema existente já representa a solicitação. Esclareça resultado esperado, projeto, responsável, prioridade e esforço conforme necessário.

Escolha Aceitar e confirme para mover ao Backlog um problema que pretende manter. Escolha Recusar e confirme para definir o estado Cancelada. Se for uma duplicata, use o seletor de duplicatas para escolher o problema que será mantido. O problema recebido assume o estado Duplicado e aponta para o escolhido. Quando um item sai da triagem, o seguinte é selecionado. Confira o estado resultante ou o link da duplicata no próprio problema. Passar de um cartão para outro sem realizar uma dessas ações não encerra o problema.

### Ordenação e limites {#triage-order}

O Smart Triage usa regras de ordenação determinísticas.

Dentro de cada coluna de estado, os problemas abertos que bloqueiam outro trabalho aberto ficam primeiro, antes dos problemas sem bloqueio. Problemas bloqueados por trabalho aberto ficam por último, mesmo que também bloqueiem outros. Pontas encerradas da relação deixam de gerar essa prioridade. Dentro de cada nível, prioridade maior, esforço menor e prazos vencidos ou próximos adiantam o trabalho. No mesmo nível de bloqueio, os problemas de um objetivo permanecem juntos, e o grupo é ordenado pelo seu problema mais bem posicionado. Os empates são resolvidos pelo prazo, pela data de criação mais antiga, pela posição manual e, por fim, pelo identificador, que mantém a ordem estável. Uma relação de vínculo não afeta essa ordenação. Ele não é um modo experimental de triagem com IA. A ordem ajuda a decidir quais itens analisar primeiro; ela não comprova a veracidade de uma descrição, não resolve duplicatas automaticamente nem concede permissões.

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

Os estados são fixos e não são personalizados por projeto. Triagem e Duplicado estão disponíveis nos seletores, mas ficam deliberadamente fora das colunas kanban normais. A ausência de uma coluna não indica que o estado ou a tarefa não exista.


![Os oito estados do ticket no seletor, com Backlog selecionado.](/documentation/pt-BR/issue-statuses.png)

### Estados finais e verificação {#closed-work}

Concluído, Cancelada e Duplicado são estados finais para acompanhamento: deixam de bloquear tarefas dependentes e saem das contagens ativas. Encerrar como Cancelada não significa que a tarefa foi entregue. Ao marcar uma duplicata, identifique a tarefa mantida para dar um destino claro à discussão e ao progresso.

Confira os filtros se uma tarefa desaparecer depois de encerrada. Abra-a novamente pelo identificador para inspecionar o resultado e mudar o estado se a encerrou por engano. Para trabalho bloqueado, confira também a direção da dependência: mudar o estado de uma tarefa não reescreve sua descrição ou plano.

## Discutir o trabalho e anexar seu contexto {#issue-discussion-and-resources}

Abra a linha do tempo da discussão do problema para adicionar um comentário. Explique uma decisão, pergunta ou resultado de verificação para que outro membro entenda o que mudou. Use menções quando precisar de uma pessoa ou objeto vinculado no contexto; as notificações ainda dependem das preferências do destinatário e da entrega no dispositivo.

Anexe uma página relevante do projeto, um arquivo ou um link pelos controles de recursos. Uma página vinculada é um recurso atualizado: seu título acompanha renomeações e o conteúdo pode evoluir. Um arquivo é um anexo armazenado, não uma garantia de que uma URL externa continuará disponível.

![Janela para adicionar um link com um endereço de contato de exemplo.](/documentation/pt-BR/work-resources.png)

### Visibilidade e uploads com falha {#resource-access}

A participação e o acesso ao projeto regem a discussão e os recursos internos. Adicionar um recurso a um problema não o publica para visitantes anônimos. Ao se referir ao feedback, diferencie a discussão interna da equipe de uma resposta pública antes de enviar texto.

Depois da operação, confira se o recurso enviado aparece e pode ser aberto. Se houver falha, preserve o arquivo original, leia o erro de upload e verifique o limite aplicável de tamanho de arquivo ou armazenamento da conta. Operadores de instâncias auto-hospedadas também precisam de metadados, políticas e bytes do Storage funcionais. Evite anexar credenciais ou despejos privados de diagnóstico.

## Vincular dependências e problemas relacionados {#issue-dependencies}

Abra os controles de relações de um problema e encontre o outro pelo título ou identificador. Escolha uma relação de bloqueio quando uma tarefa precisar terminar antes que outra possa avançar. Se A bloqueia B, A é o pré-requisito e B é bloqueado por A. Uma relação de vínculo acrescenta contexto sem impor essa ordem.

Leia os dois identificadores e a direção exibida antes de confirmar. Por exemplo, “Preparar o endpoint” bloqueia “Conectar o cliente”, e não o contrário. Uma dependência não transforma nenhum problema em subproblema, e uma relação de pai e filho não substitui uma relação de bloqueio.

![Busca de um ticket bloqueador pelo identificador.](/documentation/pt-BR/work-dependencies.png)

### Bloqueios resolvidos e herdados {#blocker-state}

Os estados finais Concluído, Cancelada e Duplicado fazem um problema deixar de bloquear trabalho. As relações conectam problemas ou objetivos do mesmo projeto; as duas pontas precisam estar acessíveis nele. Elas não conectam trabalho privado arbitrário entre projetos nem publicam nenhuma das pontas.

Um problema aberto pode herdar um bloqueio pelo seu objetivo aberto. Se A bloqueia o objetivo B, os problemas abertos vinculados a B mostram A como bloqueio herdado, mesmo sem uma relação direta de A ao problema. A interface identifica o pré-requisito real e o objetivo que transmite o bloqueio. Examine essa relação do objetivo antes de tentar removê-la do problema. Encerrar A, encerrar B ou retirar o problema de B elimina o bloqueio herdado. Esse mecanismo segue a participação no objetivo, não a hierarquia entre problema pai e subproblemas.

Remova uma relação pelos seus controles quando ela deixar de fazer sentido, depois verifique tanto o rótulo quanto o indicador de bloqueio. Marcar um problema como duplicata tem efeitos no ciclo de vida e aponta para o trabalho mantido. Use essa ação para tarefas duplicadas, em vez de criar uma relação comum e supor que isso encerra a duplicata.

Se o seletor de relações não encontrar um problema, confira o acesso ao projeto e o identificador. Não exponha conteúdo de outro projeto colando a URL de um problema privado em uma resposta pública de feedback.

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

Recue cada linha de tarefa com dois espaços por nível de aninhamento; uma tabulação conta como quatro espaços. O aninhamento organiza as etapas do plano e não cria relações entre problemas pai e filho. Cada tarefa de trabalho não cancelada continua contando para o progresso, inclusive as aninhadas.

O plano usa linhas de tarefas Markdown: `- [ ]` para pendente, `- [~]` para em andamento, `- [x]` para concluída e `- [-]` para cancelada. Escreva o texto da tarefa após o marcador, por exemplo `- [ ] Verificar o link de contato no celular`. Tarefas canceladas ficam fora da contagem de conclusão. As tarefas sob um título Questions reconhecido são tratadas como perguntas e também ficam fora do progresso; mantenha os passos de trabalho em outra seção no mesmo nível de título. O título reconhecido é `Questions`, com essa palavra em inglês. Salve as alterações explícitas com o controle de salvar; cancelar descarta o rascunho. Marcar uma tarefa exibida atualiza seu estado. Use pendente, em andamento, concluída e cancelada para representar o que aconteceu, sem sugerir verificações que não foram executadas.

![Plano de demonstração com duas tarefas de trabalho concluídas de seis.](/documentation/pt-BR/work-implementation-plan.png)

### Preservar progresso e edições simultâneas {#plan-progress}

Amplie ou altere o plano existente em vez de substituí-lo por uma cópia nova sem marcações. Preserve as etapas concluídas e as explicações de mudanças de escopo. Antes de salvar uma reescrita importante, compare-a com o plano mais recente se outro membro ou agente trabalhou no problema.

Um plano escrito pode ser entregue ao Numo para implementação quando o trabalho no repositório e o ambiente isolado configurado estiverem disponíveis. Quando já existir trabalho concluído, a interface também oferece verificar a implementação. Essas ações iniciam trabalho; uma caixa marcada não prova por si só que o código passa nos testes. Leia resultado, mudanças e verificações antes de marcar o problema como concluído.

## Repetir um problema depois de concluído {#recurring-issues}

Crie ou abra um problema que continue útil a cada repetição, como uma verificação periódica de dependências. Defina um prazo, depois escolha uma recorrência diária, semanal, mensal ou anual no controle de data do problema. Uma recorrência sem prazo é rejeitada. Revise propriedades e responsável antes de salvar. As configurações de recorrências do projeto listam as séries ativas; use-as para mudar a frequência ou interromper a repetição.

Problemas recorrentes são recriados depois que o anterior fica “Concluído”; o próximo é criado no Backlog. Confira o identificador e as propriedades do próximo problema após concluir uma recorrência.

O próximo prazo é calculado somando um intervalo de recorrência ao prazo anterior, não a partir do dia em que você concluiu a tarefa. O sucessor copia título, descrição, prioridade, esforço, responsável, objetivo e categorias. Não copia o plano de implementação, a relação com o pai, os recursos nem os comentários. A recorrência passa para o sucessor; reabrir e concluir novamente o problema antigo não cria outra ocorrência. Se a criação do sucessor falhar, a série para em vez de tentar repetidamente a partir do problema concluído. Examine o resultado e configure a recorrência na próxima tarefa apropriada depois de resolver a falha. Não suponha que um calendário execute código ou conclua o novo problema por você.


![Seletor de prazo no modo recorrente com prévia semanal aos domingos e horário opcional.](/documentation/pt-BR/issue-date-recurrence.png)

### Mudar ou interromper a repetição {#recurrence-change}

Use as configurações de recorrência para editar ou desabilitar repetições futuras. Inspecione separadamente os problemas já criados: parar a criação futura não significa que o trabalho existente foi concluído ou removido.

Uma rotina do Numo é um objeto diferente: ela agenda uma conversa e pode usar o orçamento de IA do proprietário e os provedores configurados. Escolha problemas recorrentes para uma tarefa repetida acompanhável e uma rotina para uma instrução que precisa ser executada em um horário. Se o próximo problema não aparecer, confira se o anterior foi marcado como concluído, se a recorrência ainda está habilitada e se está vendo o Backlog sem filtros restritivos.

## Atualizar vários problemas juntos {#bulk-issue-actions}

No quadro, mantenha Shift pressionado e clique em cada cartão para adicioná-lo à seleção ou removê-lo dela. Com o mouse, você também pode arrastar um retângulo de seleção a partir de um espaço vazio do quadro. Shift, Command ou Ctrl fazem esse gesto ampliar a seleção existente. O retângulo não é um modo de seleção para telas sensíveis ao toque. Confira a quantidade selecionada e os identificadores visíveis antes de abrir as ações em lote. A seleção é um conjunto de trabalho para a ação, não uma visualização salva nem uma concessão de permissão.

Escolha Ações na barra flutuante de seleção para abrir a paleta de comandos. Escolha estado, prioridade, esforço ou responsável, defina o valor e confirme o formulário integrado. A ação de objetivo aparece somente quando a seleção pertence a um único projeto com objetivos disponíveis. Outras ações, como adicionar ou remover do ciclo, vincular dois problemas ou enviar a seleção ao Numo, aparecem quando o quadro atual oferece suporte a elas. Confira os problemas afetados depois. Em um dispositivo somente de toque sem um gesto de seleção múltipla compatível, edite cada problema pelo painel de detalhes.

![Menu de ações para dois tickets de demonstração selecionados.](/documentation/pt-BR/work-bulk-actions.png)

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
