---
{
  "id": "databases",
  "locale": "pt-BR",
  "title": "Bancos de dados",
  "summary": "Crie um banco de dados, edite valores e páginas de registros, altere o esquema e importe um banco completo com as verificações necessárias.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 20,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts",
      "components/pages/database-table-scroll.tsx",
      "components/ui/checkbox.tsx",
      "lib/server/database-view-tools.ts",
      "lib/page-database-filters.ts",
      "components/pages/database-filter-editor.tsx",
      "supabase/migrations/20270109200092_page_database_views_realtime.sql",
      "components/pages/page-peek-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/global-page-panel.tsx"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:claude-code (column header menu Delete column with confirmation and right-click opening, hover-only row gutter, touch-screen rows without gutter, checkbox tooltips and partial header state, bottom scrollbar hidden on touch screens, view rename/delete by right-click, column reordering by handle in Columns, Numo view tools and no MCP view tools checked against components/pages/database-column-name.tsx, page-database-view.tsx, database-view-strip.tsx, database-table-scroll.tsx, components/ui/checkbox.tsx, lib/server/assistant/tools.ts and lib/server/database-view-tools.ts; several filter conditions with All/Any match, operators per column type, up to 10 conditions, single filters kept, live view updates, default view rename, phone view dropdown, View settings sheets, search field and cell sheets checked against lib/page-database-filters.ts, components/pages/database-filter-editor.tsx, lib/use-page-database-views.ts, supabase/migrations/20270109200092_page_database_views_realtime.sql, components/pages/database-view-strip.tsx, components/pages/page-database-view.tsx and components/pages/database-cell-editor.tsx; Page options in the entry side panel checked against components/pages/page-peek-panel.tsx and components/pages/pages-shell.tsx; the side panel's compact database toolbar (view dropdown, search popover, View settings menu with a Sort by submenu and Filter and Columns popovers, in-panel horizontal scrollbar, entries opened in place with Back) checked against components/pages/page-database-view.tsx, components/pages/database-view-strip.tsx, components/pages/database-table-scroll.tsx, components/global-page-panel.tsx and components/pages/page-peek-panel.tsx; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; equivalent meaning to en revision 19; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Criar um banco de dados e suas colunas",
    "Editar valores e páginas de entradas de banco de dados",
    "Alterar o esquema de um banco de dados com segurança",
    "Importar um banco de dados com o conteúdo das entradas"
  ],
  "figures": [
    {
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-setup-cards.png",
      "alt": "Prévia do componente com cartões para configurar uma nova base de dados com Numo ou importar uma existente.",
      "caption": "Sugestões para uma nova base com dados de demonstração. Escolha Numo ou importação, ou feche os cartões para continuar manualmente.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-property-types.png",
      "alt": "Seletor de tipo de coluna com um campo de busca, texto, número, seleções, datas, pessoas e caixa de seleção.",
      "caption": "Escolha um tipo adequado aos valores que serão armazenados.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        448,
        357
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-entry.png",
      "alt": "Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.",
      "caption": "Abra um registro para ler o texto completo e editar os valores conforme o tipo.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-conversion-warning.png",
      "alt": "Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.",
      "caption": "Confira o número real de células incompatíveis antes de confirmar. Cancelar preserva os valores atuais.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        282
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-import-review.png",
      "alt": "Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.",
      "caption": "Confira os registros analisados e o número de colunas antes de importar para o banco vazio.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-options.png",
      "alt": "Prévia do componente Editar opções com status em português, setas para cima e para baixo, lixeiras e a explicação da exclusão.",
      "caption": "Edite nomes, cores e ordem das opções em conjunto. A lixeira remove uma opção do rascunho; Salvar aplica as alterações. São exibidos dados de demonstração.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-date-time.png",
      "alt": "Prévia do seletor de data com 24 de julho de 2026 selecionado, Adicione um horário ativado e Hora definida como 02:00 AM.",
      "caption": "Ative Adicione um horário para inserir um horário. Esta prévia do componente usa dados de demonstração e o fuso horário do dispositivo.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        324,
        498
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Um banco de dados combina uma tabela de propriedades estruturadas com uma página completa para cada entrada. Você pode criar colunas e editar entradas manualmente ou importar um banco em um destino novo e vazio. Antes de converter uma propriedade ou excluir uma coluna, confira quais valores serão substituídos ou perdidos.

## Criar um banco de dados e suas colunas {#create-a-database}

A área de configuração de uma nova base de dados oferece dois cartões: **Criar com o Numo**, para preparar a estrutura, e **Importar um banco de dados existente**. O controle de fechar, com o rótulo **Dispensar a configuração do banco de dados**, oculta essas sugestões; a edição manual continua disponível.

Como proprietário ou Membro do projeto, abra Páginas, use + e escolha um banco de dados. Um banco novo tem o nome das entradas e nenhuma coluna opcional. O aviso “Novo banco de dados” oferece configuração com Numo ou importação de um banco existente. A configuração manual continua disponível sem IA. Escolher **Criar com o Numo** abre uma solicitação preparada com este banco de dados como contexto de página, depois que a criação termina. Confira e envie a solicitação para pedir a estrutura de que precisa; abrir a conversa não conclui a configuração. O trabalho real de IA exige um provedor configurado e uso disponível ou uma chave pessoal compatível. Examine o esquema e as entradas resultantes antes de confiar neles.

Abra “Colunas” e escolha “Adicionar coluna”, ou use a coluna + na borda direita da tabela. Dê um nome à coluna e escolha Texto, Número, Seleção, Seleção múltipla, Data de criação, Data, Pessoas ou Caixa de seleção. Use o seletor com pesquisa para encontrar o tipo. Salve, adicione uma entrada e confira se a coluna aparece na tabela e na página da entrada.


![Prévia do componente com cartões para configurar uma nova base de dados com Numo ou importar uma existente.](/documentation/pt-BR/database-setup-cards.png)

### Escolher tipos e respeitar limites {#database-types}

Um banco de dados aceita até 30 colunas de propriedades além do nome da entrada. Seleção permite uma opção; Seleção múltipla permite várias, com até 100 opções por coluna. Células de texto aceitam 2.000 caracteres. Número aceita decimais com sinal, ponto ou vírgula e rejeita letras. Data de criação é o horário original de criação da entrada e não pode ser editada.

Pessoas seleciona membros do projeto, não e-mails arbitrários de contas. Membros recém-mencionados podem receber notificações. Uma entrada de banco de dados também é uma página completa com conteúdo normal, comentários e anexos.

Fórmulas avançadas e automações não estão disponíveis. Escolha uma propriedade de texto ou um documento vinculado quando os dados não couberem em um tipo compatível; não descreva uma fórmula não aceita como uma coluna funcional.


![Seletor de tipo de coluna com um campo de busca, texto, número, seleções, datas, pessoas e caixa de seleção.](/documentation/pt-BR/database-property-types.png)

## Editar valores e páginas de entradas de banco de dados {#database-cells-and-entries}

No editor de opções, adicione uma opção abaixo das linhas existentes, mesmo quando a lista estiver vazia. Dê a cada opção um nome distinto e não vazio, e salve. Isso funciona tanto para seleção simples quanto múltipla.

Clique em uma célula da tabela ou na propriedade acima do corpo de uma entrada. Enter salva, Escape cancela e Shift+Enter insere uma linha de texto. Sair do editor salva. Um número inválido mantém o editor aberto até ser corrigido; uma falha de salvamento reverte o valor e mostra um erro.

Use uma célula de Seleção para uma opção ou Seleção múltipla para várias. Pesquise opções existentes ou crie uma nova pelo menu. Abra “Editar opções” em uma célula, ou no menu do cabeçalho de uma coluna de Seleção ou Seleção múltipla (clique no nome da coluna), para mudar nomes ou cores, depois salve em conjunto ou cancele. Data, Pessoas e Caixa de seleção usam seus controles correspondentes; Data de criação continua somente leitura.

As novas opções recebem uma cor aleatória da paleta que ainda não é usada na coluna, tanto ao criá-las em uma célula quanto no diálogo de opções. Depois que as dez cores forem usadas, elas poderão se repetir. Você ainda pode escolher a cor manualmente.

Em “Editar opções”, use as setas para cima e para baixo ao lado de uma linha para reordenar as opções. Use a lixeira da linha para excluir uma opção. Salvar aplica nomes, cores, ordem e exclusões em conjunto; se você excluiu opções, ele primeiro as lista e pede para confirmar com **Excluir e salvar**, porque a exclusão não pode ser desfeita. Uma opção excluída é removida de todas as entradas que a usam, inclusive as da lixeira; as outras opções selecionadas são mantidas. Cancelar descarta as alterações do rascunho.

Escolha um dia em Data. Para incluir um horário, ative Adicione um horário e preencha Hora. O valor é salvo durante a edição e o seletor permanece aberto. Valores com horário são exibidos no fuso horário do dispositivo, inclusive à meia-noite. Ao desativar Adicione um horário, o dia exibido é mantido como data sem horário. Os filtros de data correspondem ao dia exibido.

![Prévia do componente Editar opções com status em português, setas para cima e para baixo, lixeiras e a explicação da exclusão.](/documentation/pt-BR/database-options.png)

![Prévia do seletor de data com 24 de julho de 2026 selecionado, Adicione um horário ativado e Hora definida como 02:00 AM.](/documentation/pt-BR/database-date-time.png)

### Abrir, selecionar e inserir entradas {#entry-actions}

O conteúdo de uma entrada vazia mostra um texto indicativo para localizar a área de escrita. A duplicação pelas ações de uma linha ou por uma seleção de várias linhas pede confirmação antes de criar as cópias. Mover as entradas para a lixeira também pede confirmação e permite recuperá-las, sem excluí-las definitivamente.

Abra uma entrada para editar sua página completa em um painel flutuante. “Expandir” abre como página completa depois que os salvamentos pendentes do documento terminarem. Se o salvamento falhar, o painel permanece aberto para resolver. O cabeçalho do painel também tem o menu **Opções de página** (`…`) da entrada, entre “Expandir” e fechar; mover a entrada para a lixeira por ali fecha o painel e mantém a tabela no lugar. Uma entrada vazia fica no banco até ser excluída.

Use caixas de seleção de linhas para selecionar e Shift-clique para um intervalo. A dica de cada caixa indica **Selecionar** ou **Desmarcar**. A caixa do cabeçalho (**Selecionar todas as entradas**, ou **Desmarcar todas** quando todas estão selecionadas) mostra um traço quando só parte das entradas está selecionada e uma marca quando todas estão; clicar nela a partir de uma seleção parcial seleciona todas as entradas. Passe o ponteiro sobre uma linha para mostrar sua margem: a alça abre ações e pode reordenar entradas em ordem manual, e o + insere abaixo da entrada; Option/Alt insere acima. A inserção adjacente limpa os filtros da visualização ativa para deixar a nova entrada visível. Em uma tela sensível ao toque, as linhas não têm margem e suas caixas continuam visíveis: selecione as entradas e use **Duplicar** ou **Mover para a lixeira** na barra de seleção. **Promover a ticket** e mover uma entrada para cima ou para baixo não estão disponíveis ali.

No menu da alça de uma única entrada, o proprietário ou um Membro pode escolher **Promover a ticket** para que o Numo transforme essa entrada, o conteúdo e as propriedades dela em um ticket. A entrada continua no banco de dados. A ação não aparece quando o menu se aplica a várias linhas selecionadas: não há promoção em massa, então promova cada entrada separadamente. O [guia de páginas](/pt-br/documentacao/pages#promote-page-to-issue) descreve as perguntas do Numo e o que fazer quando a entrada não pode ser salva antes.

### Visualizações do banco de dados {#database-display}

Um banco de dados mostra suas entradas por meio de visualizações, listadas acima da tabela. Cada visualização guarda sua própria ordenação, seu filtro e suas colunas ocultas, e todos os membros do projeto veem as mesmas visualizações. O proprietário ou um Membro adiciona uma visualização com **Nova visualização** (+), que parte da visualização na tela, clica com o botão direito em uma visualização para escolher **Renomear visualização** ou **Excluir visualização**, e arrasta as visualizações para reordená-las. As mudanças de ordenação, filtro e colunas são salvas na visualização ativa para todos. Um banco de dados mantém pelo menos uma visualização; antes da primeira mudança, ele mostra a visualização padrão **Tabela**. Leitores alternam entre visualizações e podem ajustar uma para si até sair da página. Seu navegador lembra a última visualização aberta; a pesquisa nunca é salva. A ordem manual é compartilhada com a árvore de páginas. Role horizontalmente com gesto de trackpad, Shift e roda do mouse ou a barra de rolagem na parte inferior da janela. Uma tela sensível ao toque não mostra essa barra: deslize a tabela com o dedo. Uma prévia de texto cortada não encurta o valor armazenado. Entradas com valores de colunas podem ser reordenadas dentro do banco, mas não movidas para fora. O Numo pode listar as visualizações de um banco de dados e, quando você pede, criá-las, renomeá-las, reordená-las ou excluí-las (nunca a última), ou mudar sua ordenação, seus filtros (todos ou qualquer um) e suas colunas ocultas. Na página de um banco de dados, o Numo entende “uma visualização” como uma visualização do banco de dados, não do quadro de tickets. A ordem das colunas não faz parte de uma visualização: ela pertence ao esquema do banco de dados. Os clientes do minddy MCP não podem gerenciar visualizações.

Abra **Filtrar** para montar uma lista de condições com **Adicionar um filtro**; **Remover este filtro** apaga uma. Cada condição escolhe uma coluna, uma condição e um valor, e as condições dependem do tipo da coluna. Texto oferece contém, não contém, é, não é, está vazio e não está vazio. Número oferece é, não é, maior que, menor que, está vazio e não está vazio. Seleção oferece é, não é, está vazio e não está vazio. Seleção múltipla e Pessoas oferecem contém, não contém, está vazio e não está vazio. Data e Data de criação oferecem é em, é depois de, é antes de, está vazio e não está vazio. Caixa de seleção corresponde a **Marcada** ou **Desmarcada**. Uma condição sem valor ainda não filtra. Com duas ou mais condições, escolha **Todos os filtros** para manter as entradas que atendem a todas, ou **Qualquer filtro** para as que atendem a pelo menos uma. Uma visualização aceita até 10 condições; uma visualização salva antes com um único filtro o mantém.

As visualizações se atualizam ao vivo: uma visualização que alguém da equipe ou o Numo cria ou altera aparece sem recarregar a página. Enquanto um banco de dados não tiver nenhuma visualização salva, clique com o botão direito na visualização padrão para escolher **Renomear visualização**: renomeá-la a salva como visualização nomeada com as configurações atuais, e **Excluir visualização** continua indisponível.

No celular, escolha uma visualização no menu suspenso acima da tabela; o menu dele oferece **Nova visualização**, **Renomear visualização** e **Excluir visualização**. A barra de ferramentas mostra apenas a pesquisa, **Configurações da visualização** e **Novo**. **Configurações da visualização** abre uma folha com **Ordenar por**, **Filtrar** e **Colunas**, e cada um abre sua própria folha. A pesquisa abre um campo abaixo da barra de ferramentas, com um botão para fechá-lo. A tabela ocupa toda a largura, com linhas mais altas e caixas de seleção sempre visíveis. Células de texto e número abrem em uma folha inferior com um botão **Salvar**, como já fazem seleções, pessoas e datas.

Um banco de dados aberto no painel lateral, por uma menção, uma referência inversa, uma página anexada a um ticket ou um link em um comentário, também usa essa barra de ferramentas compacta no computador: o menu suspenso de visualizações, que oferece **Nova visualização**, **Renomear visualização** e **Excluir visualização**, depois a pesquisa, **Configurações da visualização** e **Novo**. A pesquisa abre um campo em um popover. **Configurações da visualização** abre um menu: **Ordenar por** mostra as colunas e a direção da ordenação em um submenu, enquanto **Filtrar** e **Colunas** abrem cada um seu popover abaixo do botão. A tabela rola na horizontal dentro do painel, com sua própria barra de rolagem. Um registro aberto dessa tabela toma o lugar dela no painel; **Voltar**, no canto superior esquerdo do painel, retorna à tabela, e **Expandir** abre como página inteira o que o painel mostra.


![Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.](/documentation/pt-BR/database-entry.png)

## Alterar o esquema de um banco de dados com segurança {#change-a-database-schema}

O arraste de uma coluna começa após um movimento do ponteiro e permanece horizontal. O cursor de arraste aparece somente enquanto você arrasta; um clique normal continua abrindo as ações da coluna. Com o foco no cabeçalho de uma coluna, Enter ou Espaço abre suas ações. Pressione F8 para iniciar a reordenação, use Esquerda ou Direita e depois Enter para confirmar ou Esc para cancelar.

Em Colunas, use o controle com o ícone de olho para mostrar ou ocultar propriedades e arraste a alça de uma linha dessa lista para reordenar as colunas. Pelo teclado, coloque o foco na alça, pressione Espaço, mova a coluna com as setas para cima e para baixo e pressione Espaço de novo para soltá-la; Esc cancela. Clique ou clique com o botão direito em um cabeçalho para abrir seu menu, por exemplo para renomear a coluna, ou arraste os cabeçalhos para reorganizá-los. A coluna com o nome da entrada permanece na primeira posição. As opções de Seleção ou Seleção múltipla podem ser editadas pelo menu da célula ou em Colunas; os nomes e as cores são salvos juntos.

Ocultar uma coluna altera as preferências de exibição e preserva seus valores. Para excluir uma coluna personalizada, escolha **Excluir coluna** no menu do cabeçalho dela ou o botão de lixeira dela em Colunas; os dois pedem confirmação. A exclusão remove seus valores de todas as entradas, sem possibilidade de desfazer. Considere essa consequência antes de confirmar a exclusão.

### Converter o tipo de uma propriedade {#convert-column}

Escolha Editar coluna em uma propriedade personalizada e selecione o novo tipo. A janela converte os valores existentes ao salvar. Se alguns valores forem incompatíveis, o aviso informa quantas células serão esvaziadas. Continue somente se aceitar a perda desses valores, ou cancele para manter o tipo anterior e todos os valores.

A mudança para Data de criação usa a data de criação original de cada entrada e exibe um aviso antes de substituir os valores existentes. Após a conversão, confira entradas representativas, principalmente quando um número, uma seleção ou uma data puderem ser interpretados de outra forma.

As alterações de esquema feitas por um agente usam a revisão atual do banco e um token de prévia da conversão. Alterações simultâneas invalidam essa prévia. Leia o estado atual novamente e gere outra prévia em vez de forçar uma conversão desatualizada. Esvaziar valores incompatíveis exige confirmação explícita.


![Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.](/documentation/pt-BR/database-conversion-warning.png)

## Importar um banco de dados com o conteúdo das entradas {#import-a-database}

Crie um banco de dados sem colunas opcionais nem entradas existentes. No banner do novo banco, escolha **Importar um banco de dados existente**. Envie um ZIP do Notion no formato Markdown & CSV com subpáginas, um CSV de banco de dados ou um arquivo de banco de dados do minddy. Se o arquivo contiver vários bancos, selecione aquele que deseja importar.

Antes de confirmar, confira os nomes e tipos de coluna sugeridos e depois a quantidade de páginas. Quando a assistência à importação está configurada, o Numo pode sugerir tipos com base em uma amostra pequena; o mapeamento manual continua disponível. Propriedades de origem sem suporte são mantidas como texto. Valores incompatíveis bloqueiam a importação em vez de serem apagados sem aviso.

### O que é preservado e o que precisa ser conferido {#database-import-result}

A importação inclui o conteúdo das entradas, os documentos aninhados e os arquivos locais presentes no arquivo enviado. Um arquivo do minddy também preserva o esquema exato e as cores das opções e remapeia os links internos para páginas e arquivos. Pessoas podem ser associadas a membros do projeto de destino. Uma exportação do Notion não contém o esquema original, as cores das opções nem as definições das fórmulas; essas informações ausentes não podem ser recuperadas.

Os arquivos podem ter no máximo 20 MB compactados, 50 MB descompactados, 1.000 páginas e 100 anexos. Cada anexo mantém o limite de 10 MB dos arquivos de página. A gravação no banco de dados é transacional. Repetir a mesma tentativa no diálogo aberto mantém seu identificador de solicitação; assim, uma tentativa já concluída é retornada sem duplicar linhas. Carregar outro arquivo ou reabrir um novo diálogo pode criar uma tentativa diferente. Após um resultado de rede incerto, confira o destino antes de recomeçar; um banco já preenchido deixa de cumprir o requisito de destino vazio.

Após a conclusão, confira algumas entradas, valores, páginas aninhadas e anexos. Mantenha o arquivo original até terminar essa verificação. Se a importação falhar, leia o primeiro erro e corrija o formato ou o mapeamento antes de tentar novamente. Não preencha o banco de destino manualmente supondo que ele continuará atendendo ao requisito de estar vazio.


![Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.](/documentation/pt-BR/database-import-review.png)


## Rotinas para novas entradas {#entry-routines}

O proprietário pode escolher este banco como gatilho em [Rotinas](/docs/scheduled-routines#conditions). As condições usam as propriedades tipadas da entrada. Uma entrada vazia pode aguardar o preenchimento das propriedades. Criação, duplicação, importação de banco e movimentação permitida para o banco contam como chegadas; restauração não. Remover uma propriedade referenciada ou mudar seu tipo exige corrigir o filtro da rotina.
