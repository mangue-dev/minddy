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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-684 page promotion",
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
      "content/documentation/reviews/second-pass-workflows-2026-10-10.md",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/database-date-options-2026-10-12.md",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "content/documentation/reviews/database-property-types-2026-10-18.json",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "content/documentation/reviews/min-684-promote-page.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root (optional-time and option-control source, component and isolated SQL review; unchanged claims retain prior evidence); agent:/root (MIN-690 recapture of create-a-database-steps on next dev at 8371778c4 with a throwaway database, record content/documentation/reviews/database-property-types-2026-10-18.json; other figures unchanged, evidence retained); agent:/root (MIN-684 page promotion: source and focused unit-test review of the menu entries, reader gating, save-before-promote and the Numo request; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (pt-BR changed-passage and figure parity self-review); agent:/root (pt-BR updated alt text for the column type picker; agent review, not human acceptance); agent:/root (pt-BR translation of the MIN-684 single-entry promotion passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 13,
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
      "revision": 13,
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
      "revision": 13,
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
      "revision": 13,
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
      "revision": 13,
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
      "revision": 13,
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
      "alt": "Prévia do seletor de data com 12 de outubro de 2026 selecionado, Adicione um horário ativado e Hora definida como 14:30.",
      "caption": "Ative Adicione um horário para inserir um horário. Esta prévia do componente usa dados de demonstração e o fuso horário do dispositivo.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        324,
        444
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

A área de configuração de uma nova base de dados oferece dois cartões: pedir ao Numo que prepare a estrutura ou importar uma base existente. O controle de fechar tem uma dica e oculta essas sugestões; a edição manual continua disponível.

Como membro do projeto, abra Páginas, use + e escolha um banco de dados. Um banco novo tem o nome das entradas e nenhuma coluna opcional. O aviso “Novo banco de dados” oferece configuração com Numo ou importação de um banco existente. A configuração manual continua disponível sem IA. Escolher a configuração com o Numo abre uma solicitação preparada com este banco de dados como contexto de página, depois que a criação termina. Confira e envie a solicitação para pedir a estrutura de que precisa; abrir a conversa não conclui a configuração. O trabalho real de IA exige um provedor configurado e uso disponível ou uma chave pessoal compatível. Examine o esquema e as entradas resultantes antes de confiar neles.

Abra “Colunas” e escolha “Adicionar coluna”, ou use a coluna + na borda direita da tabela. Dê um nome à coluna e escolha Texto, Número, Seleção, Seleção múltipla, Data de criação, Data, Pessoas ou Caixa de seleção. Use o seletor com pesquisa para encontrar o tipo. Salve, adicione uma entrada e confira se a coluna aparece na tabela e na página da entrada.


![Prévia do componente com cartões para configurar uma nova base de dados com Numo ou importar uma existente.](/documentation/pt-BR/database-setup-cards.png)

### Escolher tipos e respeitar limites {#database-types}

Um banco de dados aceita até 30 colunas de propriedades além do nome da entrada. Seleção permite uma opção; Seleção múltipla permite várias, com até 100 opções por coluna. Células de texto aceitam 2.000 caracteres. Número aceita decimais com sinal, ponto ou vírgula e rejeita letras. Data de criação é o horário original de criação da entrada e não pode ser editada.

Pessoas seleciona membros do projeto, não e-mails arbitrários de contas. Membros recém-mencionados podem receber notificações. Uma entrada de banco de dados também é uma página completa com conteúdo normal, comentários e anexos.

Fórmulas avançadas, automações e visualizações adicionais de banco de dados não estão disponíveis. Escolha uma propriedade de texto ou um documento vinculado quando os dados não couberem em um tipo compatível; não descreva uma fórmula não aceita como uma coluna funcional.


![Seletor de tipo de coluna com um campo de busca, texto, número, seleções, datas, pessoas e caixa de seleção.](/documentation/pt-BR/database-property-types.png)

## Editar valores e páginas de entradas de banco de dados {#database-cells-and-entries}

No editor de opções, adicione uma opção abaixo das linhas existentes, mesmo quando a lista estiver vazia. Dê a cada opção um nome distinto e não vazio, e salve. Isso funciona tanto para seleção simples quanto múltipla.

Clique em uma célula da tabela ou na propriedade acima do corpo de uma entrada. Enter salva, Escape cancela e Shift+Enter insere uma linha de texto. Sair do editor salva. Um número inválido mantém o editor aberto até ser corrigido; uma falha de salvamento reverte o valor e mostra um erro.

Use uma célula de Seleção para uma opção ou Seleção múltipla para várias. Pesquise opções existentes ou crie uma nova pelo menu. Abra “Editar opções” para mudar nomes ou cores, depois salve em conjunto ou cancele. Data, Pessoas e Caixa de seleção usam seus controles correspondentes; Data de criação continua somente leitura.

As novas opções recebem uma cor aleatória da paleta que ainda não é usada na coluna, tanto ao criá-las em uma célula quanto no diálogo de opções. Depois que as dez cores forem usadas, elas poderão se repetir. Você ainda pode escolher a cor manualmente.

Em “Editar opções”, use as setas para cima e para baixo ao lado de uma linha para reordenar as opções. Use a lixeira da linha para excluir uma opção. Salvar aplica nomes, cores, ordem e exclusões em conjunto. Uma opção excluída é removida de todas as entradas que a usam, inclusive as da lixeira; as outras opções selecionadas são mantidas. Cancelar descarta as alterações do rascunho.

Escolha um dia em Data. Para incluir um horário, ative Adicione um horário e preencha Hora. O valor é salvo durante a edição e o seletor permanece aberto. Valores com horário são exibidos no fuso horário do dispositivo, inclusive à meia-noite. Ao desativar Adicione um horário, o dia exibido é mantido como data sem horário. Os filtros de data correspondem ao dia exibido.

![Prévia do componente Editar opções com status em português, setas para cima e para baixo, lixeiras e a explicação da exclusão.](/documentation/pt-BR/database-options.png)

![Prévia do seletor de data com 12 de outubro de 2026 selecionado, Adicione um horário ativado e Hora definida como 14:30.](/documentation/pt-BR/database-date-time.png)

### Abrir, selecionar e inserir entradas {#entry-actions}

O conteúdo de uma entrada vazia mostra um texto indicativo para localizar a área de escrita. A duplicação pelas ações de uma linha ou por uma seleção de várias linhas pede confirmação antes de criar as cópias. Mover as entradas para a lixeira também pede confirmação e permite recuperá-las, sem excluí-las definitivamente.

Abra uma entrada para editar sua página completa em um painel flutuante. “Expandir” abre como página completa depois que os salvamentos pendentes do documento terminarem. Se o salvamento falhar, o painel permanece aberto para resolver. Uma entrada vazia fica no banco até ser excluída.

Use caixas de seleção de linhas para selecionar e Shift-clique para um intervalo. A alça abre ações e pode reordenar entradas em ordem manual. O + na margem insere abaixo de uma entrada; Option/Alt insere acima. A inserção adjacente volta à ordem manual e limpa filtros para deixar a nova entrada visível.

No menu da alça de uma única entrada, o proprietário ou um Membro pode escolher **Promover a problema** para que o Numo transforme essa entrada, o conteúdo e as propriedades dela em um problema. A entrada continua no banco de dados. A ação não aparece quando o menu se aplica a várias linhas selecionadas: não há promoção em massa, então promova cada entrada separadamente. O [guia de páginas](/pt-br/documentacao/pages#promote-page-to-issue) descreve as perguntas do Numo e o que fazer quando a entrada não pode ser salva antes.

### Preferências de exibição {#database-display}

Pesquise, filtre, ordene e oculte colunas na única visualização de lista. Essas preferências ficam salvas no seu dispositivo; a ordem manual é compartilhada com a árvore de páginas. Role horizontalmente com gesto de trackpad, Shift e roda do mouse, toque ou barra inferior. Uma prévia de texto cortada não encurta o valor armazenado. Entradas com valores de colunas podem ser reordenadas dentro do banco, mas não movidas para fora.


![Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.](/documentation/pt-BR/database-entry.png)

## Alterar o esquema de um banco de dados com segurança {#change-a-database-schema}

O arraste de uma coluna começa após um movimento do ponteiro e permanece horizontal. O cursor de arraste aparece somente enquanto você arrasta; um clique normal continua abrindo as ações da coluna. Com o foco no cabeçalho de uma coluna, Enter ou Espaço abre suas ações. Pressione F8 para iniciar a reordenação, use Esquerda ou Direita e depois Enter para confirmar ou Esc para cancelar.

Em Colunas, use o controle com o ícone de olho para mostrar ou ocultar propriedades. Clique em um cabeçalho para renomeá-lo ou arraste os cabeçalhos para reorganizá-los. A coluna com o nome da entrada permanece na primeira posição. As opções de Seleção ou Seleção múltipla podem ser editadas pelo menu da célula ou em Colunas; os nomes e as cores são salvos juntos.

Ocultar uma coluna altera as preferências de exibição e preserva seus valores. Excluir uma coluna personalizada remove seus valores de todas as entradas, sem possibilidade de desfazer. Considere essa consequência antes de confirmar a exclusão.

### Converter o tipo de uma propriedade {#convert-column}

Escolha Editar coluna em uma propriedade personalizada e selecione o novo tipo. A janela converte os valores existentes ao salvar. Se alguns valores forem incompatíveis, o aviso informa quantas células serão esvaziadas. Continue somente se aceitar a perda desses valores, ou cancele para manter o tipo anterior e todos os valores.

A mudança para Data de criação usa a data de criação original de cada entrada e exibe um aviso antes de substituir os valores existentes. Após a conversão, confira entradas representativas, principalmente quando um número, uma seleção ou uma data puderem ser interpretados de outra forma.

As alterações de esquema feitas por um agente usam a revisão atual do banco e um token de prévia da conversão. Alterações simultâneas invalidam essa prévia. Leia o estado atual novamente e gere outra prévia em vez de forçar uma conversão desatualizada. Esvaziar valores incompatíveis exige confirmação explícita.


![Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.](/documentation/pt-BR/database-conversion-warning.png)

## Importar um banco de dados com o conteúdo das entradas {#import-a-database}

Crie um banco de dados sem colunas opcionais nem entradas existentes. No banner do novo banco, escolha Importar um banco existente. Envie um ZIP do Notion no formato Markdown & CSV com subpáginas, um CSV de banco de dados ou um arquivo de banco de dados do minddy. Se o arquivo contiver vários bancos, selecione aquele que deseja importar.

Antes de confirmar, confira os nomes e tipos de coluna sugeridos e depois a quantidade de páginas. Quando a assistência à importação está configurada, o Numo pode sugerir tipos com base em uma amostra pequena; o mapeamento manual continua disponível. Propriedades de origem sem suporte são mantidas como texto. Valores incompatíveis bloqueiam a importação em vez de serem apagados sem aviso.

### O que é preservado e o que precisa ser conferido {#database-import-result}

A importação inclui o conteúdo das entradas, os documentos aninhados e os arquivos locais presentes no arquivo enviado. Um arquivo do minddy também preserva o esquema exato e as cores das opções e remapeia os links internos para páginas e arquivos. Pessoas podem ser associadas a membros do projeto de destino. Uma exportação do Notion não contém o esquema original, as cores das opções nem as definições das fórmulas; essas informações ausentes não podem ser recuperadas.

Os arquivos podem ter no máximo 20 MB compactados, 50 MB descompactados, 1.000 páginas e 100 anexos. Cada anexo mantém o limite de 10 MB dos arquivos de página. A gravação no banco de dados é transacional. Repetir a mesma tentativa no diálogo aberto mantém seu identificador de solicitação; assim, uma tentativa já concluída é retornada sem duplicar linhas. Carregar outro arquivo ou reabrir um novo diálogo pode criar uma tentativa diferente. Após um resultado de rede incerto, confira o destino antes de recomeçar; um banco já preenchido deixa de cumprir o requisito de destino vazio.

Após a conclusão, confira algumas entradas, valores, páginas aninhadas e anexos. Mantenha o arquivo original até terminar essa verificação. Se a importação falhar, leia o primeiro erro e corrija o formato ou o mapeamento antes de tentar novamente. Não preencha o banco de destino manualmente supondo que ele continuará atendendo ao requisito de estar vazio.


![Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.](/documentation/pt-BR/database-import-review.png)


## Rotinas para novas entradas {#entry-routines}

O proprietário pode escolher este banco como gatilho em [Rotinas](/docs/scheduled-routines#conditions). As condições usam as propriedades tipadas da entrada. Uma entrada vazia pode aguardar o preenchimento das propriedades. Criação, duplicação, importação de banco e movimentação permitida para o banco contam como chegadas; restauração não. Remover uma propriedade referenciada ou mudar seu tipo exige corrigir o filtro da rotina.
