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
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
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
      "components/global-page-panel.tsx",
      "lib/page-database-number.ts",
      "lib/page-database-schema-patch.ts",
      "lib/use-page-database.ts",
      "lib/undo/undo-context.tsx",
      "components/pages/database-choice.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/database-tool-schema.ts",
      "supabase/migrations/20270109200126_page_database_metadata_recurrence_formats.sql"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (MIN-990 changes mirrored from en revision 20; labels checked against messages/pt-BR.json; agent review, not human acceptance)",
    "language": "agent:claude-code (pt-BR translation of the changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 21,
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
      "alt": "Seletor de tipo de coluna com um campo de busca, texto, número, seleções, data, pessoas, caixa de seleção e os quatro tipos somente leitura.",
      "caption": "Escolha um tipo adequado aos valores que serão armazenados.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
      "viewport": [
        448,
        453
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
      "revision": 21,
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
      "revision": 21,
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
      "revision": 21,
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
      "alt": "Prévia do componente Editar opções com status em português, alças de arraste, lixeiras e a explicação da exclusão.",
      "caption": "Edite nomes, cores e ordem das opções em conjunto. Arraste uma alça para reordenar; a lixeira remove uma opção do rascunho; Salvar aplica as alterações. São exibidos dados de demonstração.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-14",
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Abra “Colunas” e escolha “Adicionar coluna”, ou use a coluna + na borda direita da tabela. Dê um nome à coluna e escolha Texto, Número, Seleção, Seleção múltipla, Data, Pessoas, Caixa de seleção, Data de criação, Última edição, Criado por ou Última edição por. Use o seletor com pesquisa para encontrar o tipo. Salve, adicione uma entrada e confira se a coluna aparece na tabela e na página da entrada.


![Prévia do componente com cartões para configurar uma nova base de dados com Numo ou importar uma existente.](/documentation/pt-BR/database-setup-cards.png)

### Escolher tipos e respeitar limites {#database-types}

Um banco de dados aceita até 30 colunas de propriedades além do nome da entrada. Seleção permite uma opção; Seleção múltipla permite várias, com até 100 opções por coluna. Células de texto aceitam 2.000 caracteres. Número aceita um valor escrito com ponto ou vírgula, com separadores de milhar, um símbolo de moeda ou um sinal de porcentagem, e rejeita letras. Também aceita um cálculo: digite `14 + 2` e a célula guarda 16. Os cálculos aceitam `+`, `-`, `*`, `/`, `^` e parênteses, e uma porcentagem dentro de um cálculo se aplica ao que vem antes dela; assim, `80 + 20 %` dá 96.

Uma coluna Número adapta a exibição ao que você digita. Digite um valor com um símbolo ou código de moeda, por exemplo `12 €`, `$40` ou `40 CHF`, e toda a coluna mostra valores nessa moeda. Digite um número seguido do sinal de porcentagem, por exemplo `25 %`, e a coluna mostra porcentagens. Um número simples ou um cálculo deixa a coluna como está. Para voltar aos números simples, abra o menu do cabeçalho da coluna e escolha **Mostrar como número simples**. O formato muda a exibição dos valores e nunca o número armazenado. Um número simples é exibido com separadores de milhar a partir de cinco dígitos, então um ano continua aparecendo como 2026.

Quatro tipos de coluna são preenchidos automaticamente a partir de cada entrada e não podem ser editados: Data de criação e Última edição mostram quando a entrada foi criada e alterada pela última vez, Criado por e Última edição por mostram quem fez isso. Uma alteração feita pelo Numo ou por um agente MCP aparece como feita pelo minddy.

Pessoas seleciona membros do projeto, não e-mails arbitrários de contas. Membros recém-mencionados podem receber notificações. Uma entrada de banco de dados também é uma página completa com conteúdo normal, comentários e anexos.

Fórmulas avançadas e automações não estão disponíveis. Escolha uma propriedade de texto ou um documento vinculado quando os dados não couberem em um tipo compatível; não descreva uma fórmula não aceita como uma coluna funcional.


![Seletor de tipo de coluna com um campo de busca, texto, número, seleções, data, pessoas, caixa de seleção e os quatro tipos somente leitura.](/documentation/pt-BR/database-property-types.png)

## Editar valores e páginas de entradas de banco de dados {#database-cells-and-entries}

No editor de opções, adicione uma opção abaixo das linhas existentes, mesmo quando a lista estiver vazia. Dê a cada opção um nome distinto e não vazio, e salve. Isso funciona tanto para seleção simples quanto múltipla.

Clique em uma célula da tabela ou na propriedade acima do corpo de uma entrada. Enter salva, Escape cancela e Shift+Enter insere uma linha de texto. Sair do editor salva. Um número inválido mantém o editor aberto até ser corrigido; uma falha de salvamento reverte o valor e mostra um erro.

Use uma célula de Seleção para uma opção ou Seleção múltipla para várias. Pesquise opções existentes ou crie uma nova pelo menu. Abra “Editar opções” em uma célula, ou no menu do cabeçalho de uma coluna de Seleção ou Seleção múltipla (clique no nome da coluna), para mudar nomes ou cores, depois salve em conjunto ou cancele. Data, Pessoas e Caixa de seleção usam seus controles correspondentes; Data de criação, Última edição, Criado por e Última edição por continuam somente leitura.

As novas opções recebem uma cor aleatória da paleta que ainda não é usada na coluna, tanto ao criá-las em uma célula quanto no diálogo de opções. Depois que as dez cores forem usadas, elas poderão se repetir. Você ainda pode escolher a cor manualmente.

Em “Editar opções”, arraste a alça no início de uma linha para reordenar as opções. Pelo teclado, coloque o foco na alça, pressione Espaço, mova a opção com as setas para cima e para baixo e pressione Espaço de novo para soltá-la; Esc cancela. Use a lixeira da linha para excluir uma opção. Salvar aplica nomes, cores, ordem e exclusões em conjunto; se você excluiu opções, ele primeiro as lista e pede para confirmar com **Excluir e salvar**. Em seguida, uma notificação oferece **Desfazer**, que traz de volta as opções com os valores que as usavam. Uma opção excluída é removida de todas as entradas que a usam, inclusive as da lixeira; as outras opções selecionadas são mantidas. Cancelar descarta as alterações do rascunho.

Escolha um dia em Data. Para incluir um horário, ative Adicione um horário e preencha Hora. O valor é salvo durante a edição e o seletor permanece aberto. Valores com horário são exibidos no fuso horário do dispositivo, inclusive à meia-noite. Ao desativar Adicione um horário, o dia exibido é mantido como data sem horário. Os filtros de data correspondem ao dia exibido.

Uma data pode se repetir, como a data de vencimento de um ticket. No seletor de data, escolha **Recorrente** em vez de **Uma vez** e depois um ritmo: todos os dias, todas as semanas, todos os meses ou todos os anos. A célula mostra um ícone de repetição e a próxima ocorrência, que avança sozinha depois que o dia passa; a ordenação e os filtros usam essa ocorrência. Escolha **Uma vez** para voltar a ter uma única data.

![Prévia do componente Editar opções com status em português, alças de arraste, lixeiras e a explicação da exclusão.](/documentation/pt-BR/database-options.png)

![Prévia do seletor de data com 24 de julho de 2026 selecionado, Adicione um horário ativado e Hora definida como 02:00 AM.](/documentation/pt-BR/database-date-time.png)

### Abrir, selecionar e inserir entradas {#entry-actions}

O conteúdo de uma entrada vazia mostra um texto indicativo para localizar a área de escrita. A duplicação pelas ações de uma linha ou por uma seleção de várias linhas pede confirmação antes de criar as cópias. Mover as entradas para a lixeira também pede confirmação e permite recuperá-las, sem excluí-las definitivamente.

Abra uma entrada para editar sua página completa em um painel flutuante. “Expandir” abre como página completa depois que os salvamentos pendentes do documento terminarem. Se o salvamento falhar, o painel permanece aberto para resolver. O cabeçalho do painel também tem o menu **Opções de página** (`…`) da entrada, entre “Expandir” e fechar; mover a entrada para a lixeira por ali fecha o painel e mantém a tabela no lugar. Uma entrada vazia fica no banco até ser excluída.

Use caixas de seleção de linhas para selecionar e Shift-clique para um intervalo. A dica de cada caixa indica **Selecionar** ou **Desmarcar**. A caixa do cabeçalho (**Selecionar todas as entradas**, ou **Desmarcar todas** quando todas estão selecionadas) mostra um traço quando só parte das entradas está selecionada e uma marca quando todas estão; clicar nela a partir de uma seleção parcial seleciona todas as entradas. Passe o ponteiro sobre uma linha para mostrar sua margem: a alça abre o menu da entrada e pode reordenar entradas em ordem manual, e o + insere abaixo da entrada; Option/Alt insere acima. A inserção adjacente limpa os filtros da visualização ativa para deixar a nova entrada visível. As entradas marcadas abrem a barra de seleção flutuante: escolha **Ações**, ou pressione Command+K no macOS ou Ctrl+K nos outros sistemas, para promovê-las a tickets, **Duplicar** ou **Mover para a lixeira**, cada uma após sua confirmação, e **Pergunte ao Numo** abre o Numo com todas as entradas marcadas no contexto. Em uma tela sensível ao toque, as linhas não têm margem e suas caixas continuam visíveis; a mesma barra de seleção age sobre as entradas marcadas, e mover uma entrada para cima ou para baixo não está disponível ali.

O menu da alça de uma única entrada começa com **Abrir página** e depois oferece o que a barra lateral oferece para qualquer página: **Adicionar uma subpágina**, **Adicionar aos favoritos**, **Copiar**, **Promover a ticket**, **Publicar…** e **Exportar**, seguidos de **Duplicar** e **Mover para a lixeira**. Um leitor vê **Abrir página**, **Copiar** e **Exportar**. Quando o menu se aplica a várias linhas selecionadas, ele mantém **Duplicar** e **Mover para a lixeira**.

Nesse menu, o proprietário ou um Membro pode escolher **Promover a ticket** para que o Numo transforme essa entrada, o conteúdo e as propriedades dela em um ticket. A entrada continua no banco de dados. Quando o menu se aplica a várias linhas selecionadas, promova-as pela opção **Ações** da barra de seleção: uma única conversa com o Numo cria um ticket por entrada. O [guia de páginas](/pt-br/documentacao/pages#promote-page-to-issue) descreve as perguntas do Numo e o que fazer quando a entrada não pode ser salva antes.

### Visualizações do banco de dados {#database-display}

Um banco de dados mostra suas entradas por meio de visualizações, listadas acima da tabela. Cada visualização guarda sua própria ordenação, seu filtro e suas colunas ocultas, e todos os membros do projeto veem as mesmas visualizações. O proprietário ou um Membro adiciona uma visualização com **Nova visualização** (+), que parte da visualização na tela, clica com o botão direito em uma visualização para escolher **Renomear visualização** ou **Excluir visualização**, e arrasta as visualizações para reordená-las. As mudanças de ordenação, filtro e colunas são salvas na visualização ativa para todos. Um banco de dados mantém pelo menos uma visualização; antes da primeira mudança, ele mostra a visualização padrão **Tabela**. Leitores alternam entre visualizações e podem ajustar uma para si até sair da página. Seu navegador lembra a última visualização aberta; a pesquisa nunca é salva. A ordem manual é compartilhada com a árvore de páginas. Role horizontalmente com gesto de trackpad, Shift e roda do mouse ou a barra de rolagem na parte inferior da janela. Uma tela sensível ao toque não mostra essa barra: deslize a tabela com o dedo. Uma prévia de texto cortada não encurta o valor armazenado. Entradas com valores de colunas podem ser reordenadas dentro do banco, mas não movidas para fora. O Numo pode listar as visualizações de um banco de dados e, quando você pede, criá-las, renomeá-las, reordená-las ou excluí-las (nunca a última), ou mudar sua ordenação, seus filtros (todos ou qualquer um) e suas colunas ocultas. Na página de um banco de dados, o Numo entende “uma visualização” como uma visualização do banco de dados, não do quadro de tickets. A ordem das colunas não faz parte de uma visualização: ela pertence ao esquema do banco de dados. Os clientes do minddy MCP não podem gerenciar visualizações.

Abra **Ordenar por** para escolher uma coluna e depois uma direção, formulada conforme o conteúdo da coluna: **De A a Z** ou **De Z a A** para texto e pessoas, **Primeira opção primeiro** ou **Última opção primeiro** para uma coluna Seleção ou Seleção múltipla, que é ordenada na ordem de suas opções, **Menor primeiro** ou **Maior primeiro** para um número, **Mais antigo primeiro** ou **Mais recente primeiro** para uma data, **Desmarcadas primeiro** ou **Marcadas primeiro** para uma caixa de seleção, e **De cima para baixo** ou **De baixo para cima** para a ordem manual. As listas de colunas de **Ordenar por** e **Filtrar** mostram o ícone do tipo de cada coluna.

Arraste a borda direita do cabeçalho de uma coluna para definir a largura dela; clique duas vezes nessa borda para voltar à largura padrão. Sob uma coluna Número, passe o cursor sobre a parte inferior da tabela e escolha **Calcular** para mostrar a **Soma**, a **Média**, o **Mínimo**, o **Máximo** ou a **Contagem** das entradas que a visualização mantém. As larguras e os cálculos são salvos com a visualização, assim como a ordenação e os filtros.

Abra **Filtrar** para montar uma lista de condições com **Adicionar um filtro**; **Remover este filtro** apaga uma. Cada condição escolhe uma coluna, uma condição e um valor, e as condições dependem do tipo da coluna. Texto oferece contém, não contém, é, não é, está vazio e não está vazio. Número oferece é, não é, maior que, menor que, está vazio e não está vazio. Seleção oferece é, não é, está vazio e não está vazio. Seleção múltipla e Pessoas oferecem contém, não contém, está vazio e não está vazio. Data, Data de criação e Última edição oferecem é em, é depois de, é antes de, está vazio e não está vazio. Criado por e Última edição por oferecem é e não é, com um membro do projeto. Caixa de seleção corresponde a **Marcada** ou **Desmarcada**. Uma condição sem valor ainda não filtra. Com duas ou mais condições, escolha **Todos os filtros** para manter as entradas que atendem a todas, ou **Qualquer filtro** para as que atendem a pelo menos uma. Uma visualização aceita até 10 condições; uma visualização salva antes com um único filtro o mantém.

As visualizações se atualizam ao vivo: uma visualização que alguém da equipe ou o Numo cria ou altera aparece sem recarregar a página. Enquanto um banco de dados não tiver nenhuma visualização salva, clique com o botão direito na visualização padrão para escolher **Renomear visualização**: renomeá-la a salva como visualização nomeada com as configurações atuais, e **Excluir visualização** continua indisponível.

No celular, escolha uma visualização no menu suspenso acima da tabela; o menu dele oferece **Nova visualização**, **Renomear visualização** e **Excluir visualização**. A barra de ferramentas mostra apenas a pesquisa, **Configurações da visualização** e **Novo**. **Configurações da visualização** abre uma folha com **Ordenar por**, **Filtrar** e **Colunas**, e cada um abre sua própria folha. A pesquisa abre um campo abaixo da barra de ferramentas, com um botão para fechá-lo. A tabela ocupa toda a largura, com linhas mais altas e caixas de seleção sempre visíveis. Células de texto e número abrem em uma folha inferior com um botão **Salvar**, como já fazem seleções, pessoas e datas.

Um banco de dados aberto no painel lateral, por uma menção, uma referência inversa, uma página anexada a um ticket ou um link em um comentário, também usa essa barra de ferramentas compacta no computador: o menu suspenso de visualizações, que oferece **Nova visualização**, **Renomear visualização** e **Excluir visualização**, depois a pesquisa, **Configurações da visualização** e **Novo**. A pesquisa abre um campo em um popover. **Configurações da visualização** abre um menu: **Ordenar por** mostra as colunas e a direção da ordenação em um submenu, enquanto **Filtrar** e **Colunas** abrem cada um seu popover abaixo do botão. A tabela rola na horizontal dentro do painel, com sua própria barra de rolagem. Um registro aberto dessa tabela toma o lugar dela no painel; **Voltar**, no canto superior esquerdo do painel, retorna à tabela, e **Expandir** abre como página inteira o que o painel mostra.


![Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.](/documentation/pt-BR/database-entry.png)

### Desfazer e refazer {#database-undo}

Pressione ⌘Z (Ctrl+Z no Windows e no Linux) para desfazer sua última alteração em um banco de dados, e ⌘⇧Z (Ctrl+Shift+Z) para refazê-la. Isso abrange o valor de uma célula, uma coluna adicionada, renomeada, reordenada, convertida para outro tipo ou excluída, opções editadas, uma entrada criada, duplicada, reordenada ou movida para a lixeira, e as configurações de uma visualização: ordenação, filtros, colunas ocultas, larguras de coluna e cálculos. Desfazer a exclusão de uma coluna ou de uma opção restaura os valores que ela removeu. Uma alteração feita em várias entradas selecionadas é desfeita em uma única etapa.

O histórico pertence à aba aberta e contém suas próprias alterações: ele se perde quando você recarrega a página e não inclui as alterações feitas por colegas de equipe, pelo Numo ou por um agente MCP. Enquanto o cursor estiver em um campo de texto ou no corpo de uma página, as mesmas teclas desfazem a digitação. Se outra pessoa tiver alterado o mesmo valor nesse meio-tempo, o desfazer é recusado e a tabela mostra o valor atual.

## Alterar o esquema de um banco de dados com segurança {#change-a-database-schema}

O arraste de uma coluna começa após um movimento do ponteiro e permanece horizontal. O cursor de arraste aparece somente enquanto você arrasta; um clique normal continua abrindo as ações da coluna. Com o foco no cabeçalho de uma coluna, Enter ou Espaço abre suas ações. Pressione F8 para iniciar a reordenação, use Esquerda ou Direita e depois Enter para confirmar ou Esc para cancelar.

Em Colunas, use o controle com o ícone de olho para mostrar ou ocultar propriedades e arraste a alça de uma linha dessa lista para reordenar as colunas. Pelo teclado, coloque o foco na alça, pressione Espaço, mova a coluna com as setas para cima e para baixo e pressione Espaço de novo para soltá-la; Esc cancela. Clique ou clique com o botão direito em um cabeçalho para abrir seu menu, por exemplo para renomear a coluna, ou arraste os cabeçalhos para reorganizá-los. A coluna com o nome da entrada permanece na primeira posição. As opções de Seleção ou Seleção múltipla podem ser editadas pelo menu da célula ou em Colunas; os nomes e as cores são salvos juntos.

Ocultar uma coluna altera as preferências de exibição e preserva seus valores. Para excluir uma coluna personalizada, escolha **Excluir coluna** no menu do cabeçalho dela ou o botão de lixeira dela em Colunas; os dois pedem confirmação. A exclusão remove seus valores de todas as entradas. Em seguida, uma notificação oferece **Desfazer**, e [desfazer](#database-undo) traz de volta a coluna e seus valores enquanto a página continuar aberta; depois disso, a exclusão é definitiva.

### Converter o tipo de uma propriedade {#convert-column}

Escolha Editar coluna em uma propriedade personalizada e selecione o novo tipo. A janela converte os valores existentes ao salvar. Se alguns valores forem incompatíveis, o aviso informa quantas células serão esvaziadas. Continue somente se aceitar a perda desses valores, ou cancele para manter o tipo anterior e todos os valores.

A mudança para Data de criação, Última edição, Criado por ou Última edição por substitui os valores existentes pelo que o minddy registra para cada entrada e exibe um aviso antes de fazer isso. Após a conversão, confira entradas representativas, principalmente quando um número, uma seleção ou uma data puderem ser interpretados de outra forma.

O Numo e os agentes MCP leem e gravam as mesmas colunas: podem adicionar as colunas somente leitura, definir um formato de número e gravar uma data recorrente. As alterações de esquema feitas por um agente usam a revisão atual do banco e um token de prévia da conversão. Alterações simultâneas invalidam essa prévia. Leia o estado atual novamente e gere outra prévia em vez de forçar uma conversão desatualizada. Esvaziar valores incompatíveis exige confirmação explícita.


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
