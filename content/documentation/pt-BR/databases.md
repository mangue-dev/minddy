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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "lib/server/database-import.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-property-types.png",
      "alt": "Seletor de tipo de coluna com texto, número, seleções, datas, pessoas e caixa de seleção.",
      "caption": "Escolha um tipo adequado aos valores que serão armazenados.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-entry.png",
      "alt": "Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.",
      "caption": "Abra um registro para ler o texto completo e editar os valores conforme o tipo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-conversion-warning.png",
      "alt": "Aviso de conversão: mudar de Texto para Número limpa uma célula incompatível, com botões para cancelar ou confirmar.",
      "caption": "Confira o número real de células incompatíveis antes de confirmar. Cancelar preserva os valores atuais.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/database-import-review.png",
      "alt": "Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.",
      "caption": "Confira os registros analisados e o número de colunas antes de importar para o banco vazio.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
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

Um banco de dados organiza páginas como entradas com propriedades estruturadas. Você pode definir colunas, editar valores e conteúdo e ajustar o esquema. As conversões exigem conferir a prévia; a importação de um arquivo completo começa em um banco novo e vazio.

## Criar um banco de dados e suas colunas {#create-a-database}

Como membro do projeto, abra Páginas, use + e escolha um banco de dados. Um banco novo tem o nome das entradas e nenhuma coluna opcional. O aviso “Novo banco de dados” oferece configuração com Numo ou importação de um banco existente. A configuração manual continua disponível sem IA. Escolher a configuração com o Numo abre uma solicitação preparada com este banco de dados como contexto de página, depois que a criação termina. Confira e envie a solicitação para pedir a estrutura de que precisa; abrir a conversa não conclui a configuração. O trabalho real de IA exige um provedor configurado e uso disponível ou uma chave pessoal compatível. Examine o esquema e as entradas resultantes antes de confiar neles.

Abra “Colunas” e escolha “Adicionar coluna”, ou use a coluna + na borda direita da tabela. Dê um nome à coluna e escolha Texto, Número, Seleção, Seleção múltipla, Data de criação, Data, Pessoas ou Caixa de seleção. Use o seletor com pesquisa para encontrar o tipo. Salve, adicione uma entrada e confira se a coluna aparece na tabela e na página da entrada.

### Escolher tipos e respeitar limites {#database-types}

Um banco de dados aceita até 30 colunas de propriedades além do nome da entrada. Seleção permite uma opção; Seleção múltipla permite várias, com até 100 opções por coluna. Células de texto aceitam 2.000 caracteres. Número aceita decimais com sinal, ponto ou vírgula e rejeita letras. Data de criação é o horário original de criação da entrada e não pode ser editada.

Pessoas seleciona membros do projeto, não e-mails arbitrários de contas. Membros recém-mencionados podem receber notificações. Uma entrada de banco de dados também é uma página completa com conteúdo normal, comentários e anexos.

Fórmulas avançadas, automações e visualizações adicionais de banco de dados não estão disponíveis. Escolha uma propriedade de texto ou um documento vinculado quando os dados não couberem em um tipo compatível; não descreva uma fórmula não aceita como uma coluna funcional.


![Seletor de tipo de coluna com texto, número, seleções, datas, pessoas e caixa de seleção.](/documentation/pt-BR/database-property-types.png)

## Editar valores e páginas de entradas de banco de dados {#database-cells-and-entries}

Clique em uma célula da tabela ou na propriedade acima do corpo de uma entrada. Enter salva, Escape cancela e Shift+Enter insere uma linha de texto. Sair do editor salva. Um número inválido mantém o editor aberto até ser corrigido; uma falha de salvamento reverte o valor e mostra um erro.

Use uma célula de Seleção para uma opção ou Seleção múltipla para várias. Pesquise opções existentes ou crie uma nova pelo menu. Abra “Editar opções” para mudar nomes ou cores, depois salve em conjunto ou cancele. Data, Pessoas e Caixa de seleção usam seus controles correspondentes; Data de criação continua somente leitura.

### Abrir, selecionar e inserir entradas {#entry-actions}

Abra uma entrada para editar sua página completa em um painel flutuante. “Expandir” abre como página completa depois que os salvamentos pendentes do documento terminarem. Se o salvamento falhar, o painel permanece aberto para resolver. Uma entrada vazia fica no banco até ser excluída.

Use caixas de seleção de linhas para selecionar e Shift-clique para um intervalo. A alça abre ações e pode reordenar entradas em ordem manual. O + na margem insere abaixo de uma entrada; Option/Alt insere acima. A inserção adjacente volta à ordem manual e limpa filtros para deixar a nova entrada visível.

### Preferências de exibição {#database-display}

Pesquise, filtre, ordene e oculte colunas na única visualização de lista. Essas preferências ficam salvas no seu dispositivo; a ordem manual é compartilhada com a árvore de páginas. Role horizontalmente com gesto de trackpad, Shift e roda do mouse, toque ou barra inferior. Uma prévia de texto cortada não encurta o valor armazenado. Entradas com valores de colunas podem ser reordenadas dentro do banco, mas não movidas para fora.


![Registro de demonstração com descrição, duração 2.5, caixa marcada e seleção vazia.](/documentation/pt-BR/database-entry.png)

## Alterar o esquema de um banco de dados com segurança {#change-a-database-schema}

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

Os arquivos podem ter no máximo 20 MB compactados, 50 MB descompactados e 1.000 páginas. Cada anexo mantém o limite de 10 MB dos arquivos de página. A gravação no banco de dados é transacional. Repetir a mesma tentativa no diálogo aberto mantém seu identificador de solicitação; assim, uma tentativa já concluída é retornada sem duplicar linhas. Carregar outro arquivo ou reabrir um novo diálogo pode criar uma tentativa diferente. Após um resultado de rede incerto, confira o destino antes de recomeçar; um banco já preenchido deixa de cumprir o requisito de destino vazio.

Após a conclusão, confira algumas entradas, valores, páginas aninhadas e anexos. Mantenha o arquivo original até terminar essa verificação. Se a importação falhar, leia o primeiro erro e corrija o formato ou o mapeamento antes de tentar novamente. Não preencha o banco de destino manualmente supondo que ele continuará atendendo ao requisito de estar vazio.


![Revisão de um CSV local: duas páginas de registros e duas colunas, com o botão Importar banco de dados.](/documentation/pt-BR/database-import-review.png)
