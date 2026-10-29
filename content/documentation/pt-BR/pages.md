---
{
  "id": "pages",
  "locale": "pt-BR",
  "title": "Páginas",
  "summary": "Organize e edite páginas, gerencie discussões, arquivos e histórico, publique ou exporte documentos e importe arquivos de banco de dados em um banco vazio.",
  "topic": "Páginas e bancos de dados",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 23,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx",
      "lib/server/page-database-views.ts",
      "components/pages/page-comment-bubble.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "components/editor/rich-editor.tsx",
      "components/pages/page-extensions.ts",
      "components/pages/blocks/image.ts",
      "lib/pages-markdown.ts",
      "components/pages/blocks/subpage.ts",
      "lib/server/pages.ts",
      "lib/pages-subpage.ts",
      "lib/pages-export.ts",
      "components/public-page-body.tsx",
      "components/pages/page-comment-dialog.tsx",
      "lib/keyboard/shortcuts.ts",
      "components/editor/find-bar.tsx",
      "components/editor/find-replace.ts",
      "lib/keyboard/find-shortcut.ts",
      "components/pages/blocks/math.ts",
      "components/editor/math-edit-menu.tsx",
      "components/code-block-lowlight.ts",
      "app/globals.css",
      "components/pages/page-peek-panel.tsx",
      "components/global-page-panel.tsx",
      "components/pages/pages-shell.tsx",
      "components/pages/block-gutter.tsx",
      "components/editor/suggestion-menu.tsx",
      "components/editor/suggestion-chip.ts",
      "components/editor/suggestion-menu.test.tsx",
      "components/editor/block-selection.ts",
      "components/editor/document-editor.tsx",
      "app/tokens.css",
      "components/pages/block-actions.ts",
      "lib/selection-menu-visibility.test.ts",
      "lib/mention-menu.ts",
      "components/pages/block-menu.tsx",
      "lib/action-menu-search.ts"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (block menu search field reaching every action, block types and colors included, with submenu entries shown behind their path such as Turn into › Heading 1 (MIN-845), checked against components/pages/block-menu.tsx, components/issue-context-menu.tsx and lib/action-menu-search.ts; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the changed controls)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; equivalent meaning to en revision 21; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Criar uma wiki do projeto",
    "Escrever uma página com blocos e menções",
    "Discutir uma página e lidar com conflitos",
    "Anexar e recuperar arquivos de páginas",
    "Inspecionar e restaurar uma versão de página",
    "Publicar uma página e revogar seu link",
    "Exportar ou imprimir uma página",
    "Importar, exportar ou imprimir uma página"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-create-menu.png",
      "alt": "Menu de criação com Nova página e Novo banco de dados.",
      "caption": "Use os controles de páginas do projeto para escolher um documento ou um banco de dados.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        248,
        129
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-editor.png",
      "alt": "Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.",
      "caption": "Os títulos, os blocos de tarefas e a menção AUR-2 organizam a página. O conteúdo é um exemplo de demonstração.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-comments.png",
      "alt": "Atividade da página ainda sem eventos e campo de comentário vazio.",
      "caption": "Leia a atividade e escreva um comentário no campo. Nenhum comentário foi enviado neste exemplo.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        608,
        616
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-file-states.png",
      "alt": "Página de demonstração com um upload incompleto e um arquivo salvo de 67 bytes com a opção Baixar.",
      "caption": "Confira o estado real do arquivo: o segundo anexo está disponível, mas o primeiro upload incompleto não.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-history-preview.png",
      "alt": "Aba Versões com um estado anterior expandido, autor, Restaurar e aviso de retenção por 30 dias.",
      "caption": "Confira a prévia de um estado salvo e compare com a página atual antes de restaurá-lo.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-publish.png",
      "alt": "Janela de publicação com Privado selecionado e opções de senha ou link.",
      "caption": "Privado mantém a página no projeto. Confira quem deve ler o conteúdo antes de mudar a publicação.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-export.png",
      "alt": "Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.",
      "caption": "Escolha Markdown para baixar o documento ou Imprimir / PDF para abrir a visualização de impressão.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/file-preview.png",
      "alt": "Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar, Renomear e Remover.",
      "caption": "O visualizador compartilhado mantém Fechar abaixo da prévia. O menu Ações do arquivo oferece Baixar e, quando permitido, Renomear e Remover.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-12",
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
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

As páginas formam a wiki do projeto, com documentos, subpáginas, arquivos e discussões. Você pode organizar e editar conteúdo, colaborar, gerenciar o histórico, publicar ou exportar um ramo. O menu do documento não oferece importação genérica: importe um arquivo em um banco novo e vazio seguindo o [guia de bancos de dados](/pt-br/documentacao/databases#import-a-database).

## Criar uma wiki do projeto {#create-and-organize-pages}

Abra Páginas em um projeto como proprietário ou Membro; os leitores podem abrir páginas, mas não criá-las. Use o menu + e escolha uma página para um documento ou um banco de dados para uma lista estruturada. Dê um título útil e escreva a especificação, decisão ou procedimento que a página precisa preservar.

Crie subpáginas para documentos relacionados e use os controles da árvore para mover ou reordenar. Uma página não pode se tornar descendente de si mesma. Duplicar uma página cria conteúdo novo, não uma referência atualizada ao original. Revise a ramificação duplicada antes de editar ou compartilhar. Para criar uma subpágina enquanto escreve, digite `/` e escolha **Subpágina**: o minddy cria a página filha sob a atual, insere a menção dela no cursor seguida de um espaço e abre a nova página no painel lateral, ao lado da página em que você está escrevendo; escolha **Expandir** para abri-la por inteiro. Você pode continuar digitando depois da menção na mesma linha, como depois de qualquer menção. Uma página criada pela barra lateral abre por inteiro. Uma página mais antiga ainda pode mostrar blocos de subpágina: na primeira vez que alguém que pode editá-la a abre, cada bloco vira uma linha que contém apenas a menção da filha, e comentários e links de bloco continuam apontando para ela. Abrir a página como leitor não converte nada. Ao duplicar uma página com suas subpáginas, as menções das páginas copiadas apontam para as cópias, inclusive menções dentro de uma frase.

### Favoritos e exclusão {#page-tree}

Marque uma página como favorita para destacá-la no topo da árvore do projeto. Esses favoritos são compartilhados no projeto, ao contrário de uma nota privada do caderno. Vincule uma página a um ticket quando o documento atual for contexto do ticket; o título do recurso acompanha renomeações da página. No menu `…` da página aberta, **Copiar** oferece **Copiar link** e **Copiar o conteúdo da página**, que copia o título e o corpo em Markdown (não disponível em um banco de dados). Command+Shift+L no macOS ou Ctrl+Shift+L no Windows/Linux copia o link da página aberta.

A exclusão envia para a lixeira as páginas que permitem recuperação. Em um menu de página, **Mover para a lixeira** pede confirmação antes, com o nome da página e quantas subpáginas vão junto; elas podem ser restauradas da lixeira por 30 dias. Apagar uma menção nunca move uma página para a lixeira. Mover uma página filha para a lixeira pela árvore remove da página principal a linha que contém apenas a menção dela; restaurar a página adiciona essa linha de volta ao final da página principal, a menos que ela ainda mencione a página em outro lugar. Uma menção dentro de uma frase nunca é removida. Confira a ramificação selecionada antes de excluir e use a recuperação em vez de recriar uma página perdida quando o conteúdo precisa ser mantido. Entradas com valores de banco de dados armazenados podem ser reordenadas dentro do banco, mas não movidas para fora. Se um movimento for rejeitado, inspecione hierarquia e tipo de entrada em vez de forçar por tentativas repetidas.


![Menu de criação com Nova página e Novo banco de dados.](/documentation/pt-BR/page-create-menu.png)

## Promover uma página a ticket {#promote-page-to-issue}

Quando uma página descreve trabalho a fazer, o proprietário ou um Membro pode transformá-la em um ticket com o Numo. Os leitores não veem essa ação. É necessário ter uso de IA disponível ou uma chave pessoal compatível.

1. Escolha **Promover a ticket** no menu da página na árvore (`…` ou clique com o botão direito na linha) ou no menu `…` da página aberta (**Opções de página**). A mesma ação aparece para uma entrada de banco de dados aberta no painel lateral e no menu da alça de uma única entrada, como explica o [guia de bancos de dados](/pt-br/documentacao/databases#entry-actions).
2. Se a página aberta tiver alterações não salvas, o minddy as salva primeiro. Se esse salvamento falhar, o minddy informa que não foi possível salvar a página e o Numo não abre. Promova a página novamente depois que ela for salva.
3. O Numo abre no projeto da página, com a página como contexto, e recebe uma solicitação para ler o título, o conteúdo e, no caso de uma entrada de banco de dados, as propriedades dela. Se a página não estiver clara, ou se um banco de dados deixar ambíguo o escopo do ticket, o Numo faz perguntas antes de criar qualquer coisa. Responda na conversa.
4. O Numo cria um único ticket e anexa a página a ele. Abra o ticket e confira o identificador, o escopo, as propriedades e a página anexada.

Diferentemente de uma tarefa do caderno levada para o projeto, a página não é removida: ela continua no mesmo lugar da árvore, com o conteúdo e as subpáginas. Se a criação falhar ou o resultado ficar incerto após um erro de rede, procure o ticket antes de promover a página novamente.

## Escrever uma página com blocos e menções {#page-editor}

Abra a página e edite título ou corpo como proprietário ou Membro. Os leitores podem abrir e ler páginas, mas não podem editá-las, importá-las, duplicá-las, marcá-las como favoritas nem publicá-las, nem restaurar uma versão. Use o menu de comandos de barra e os controles de formatação para inserir títulos, texto, listas de marcadores, numeradas e de tarefas, citações, avisos, blocos de código, equações, divisores, seções recolhíveis, subpáginas, imagens e arquivos. Um aviso pode ter ícone emoji e cor da paleta; escolha-os para distinguir informação útil, não como a única forma de comunicar uma advertência. Uma **Equação** é escrita em LaTeX e exibida com o KaTeX. Escolha-a no menu `/` para uma equação em linha própria, ou digite LaTeX entre `$$` em uma frase, como `$$x^2$$`, para uma equação no texto. Clique em uma equação para editar o LaTeX com visualização ao vivo, em um popover no computador ou em um painel no celular. LaTeX que não pode ser renderizado aparece em vermelho com uma mensagem, e salvar uma equação vazia a remove.

O menu `/` agrupa os blocos em **Blocos básicos**, **Listas** e **Blocos avançados**, e o menu `@` agrupa por tipo o que você pode mencionar, como **Pessoas**, **Tickets** ou **Páginas**. Enquanto um menu está aberto, a `/` ou o `@` e o que você digita depois aparecem no texto como uma etiqueta destacada, com **Digite para pesquisar** até você digitar uma letra. As setas percorrem todas as seções, e Enter ou Tab escolhe. Pressione Esc, digite dois espaços seguidos ou escolha **Fechar menu**, no fim do menu, para fechá-lo: o que você digitou continua como texto simples. Um espaço logo depois da `/` ou do `@` sozinho também fecha o menu. Depois que você digita uma busca, um espaço sozinho faz parte dela, então `/lista com marcadores` ou `@Camille Roy` é buscado como digitado. O menu também fecha quando a busca não encontra nada, a menos que uma busca pelo sentido ainda esteja em andamento.

Use menções para vincular tickets, objetivos, pessoas ou páginas relevantes. Digite `@` seguido de um identificador, um nome ou um título, que pode conter espaços simples; o menu fecha das mesmas formas que o menu `/`, e ao escolher um item. Uma palavra que descreve o trabalho em vez de nomeá-lo também lista tickets encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**, depois das correspondências de texto. Referências inversas ajudam leitores a encontrar páginas que apontam para a atual. Um link fornece contexto, não acesso a um objeto privado de outro projeto. A menção de uma página que ainda não tem título mostra **Sem título**.

Clicar na menção de uma página, em uma referência inversa, em uma página anexada a um ticket ou objetivo, ou em um link para uma página em um comentário ou resposta do Numo abre essa página em um painel lateral sobre o que você estava lendo. Leia ou edite ali, escolha **Expandir** para abrir a página inteira ou feche o painel para voltar. Entre **Expandir** e fechar, o menu **Opções de página** (`…`) do painel oferece as mesmas ações da página inteira; mover a página para a lixeira por ali fecha o painel e deixa você na página que está por baixo. Um banco de dados também abre no painel, com a barra de ferramentas compacta descrita no [guia de bancos de dados](/docs/databases#database-display); um registro aberto da tabela dele toma o seu lugar, e **Voltar**, no canto superior esquerdo do painel, retorna à tabela.


![Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.](/documentation/pt-BR/page-editor.png)

### Formatar texto e escrever no celular {#editor-formatting}

Páginas, descrições, comentários e o caderno de tarefas compartilham o mesmo editor. Selecione um texto, ou blocos inteiros como descrito abaixo, para abrir a barra de seleção. A primeira linha mostra o tipo do bloco atual: escolha-a para abrir **Transformar em** e mudar o bloco. Em seguida vêm **Cor**, para o texto ou o plano de fundo, **Negrito**, **Itálico**, **Sublinhado**, **Tachado**, **Código**, **Adicionar link** (ou **Remover link** sobre um link), **Equação em linha**, que transforma o texto selecionado em uma equação em linha ou o contrário, **Limpar formatação** e **Copiar**, que copia a seleção. No computador, uma linha **Pergunte ao Numo** envia o trecho ao Numo, como descreve o [guia do Numo](/pt-br/documentacao/numo#work-with-numo), e em uma página uma linha **Comentário** ancora um comentário na seleção. **Transformar em** marca apenas o tipo do bloco em que a seleção está. Nas listas de cores, aqui e no menu do bloco, cada cor aparece pelo nome, escrita nessa cor ou sobre esse fundo. Clicar fora do editor encerra a seleção e oculta a barra, assim como escolher **Comentário**. As dicas mostram os atalhos: Command+B, Command+I, Command+U, Command+Shift+S e Command+E no macOS, ou Ctrl com as mesmas teclas no Windows/Linux. Em um editor, Command/Ctrl+B aplica negrito; fora dele, o atalho continua mostrando ou ocultando a barra lateral. Em um bloco de código, a barra mostra apenas o tipo do bloco, **Cor**, **Copiar**, **Pergunte ao Numo** e **Comentário**: uma cor de texto substitui o realce de sintaxe do código, uma cor de fundo o mantém e a cor padrão o restaura. As cores de texto e de fundo não são mantidas em Markdown. A barra acompanha o trecho selecionado enquanto a página rola e fecha quando o trecho sai da tela.

Shift+Enter começa uma nova linha dentro do mesmo bloco. Command/Ctrl+Enter não insere quebra de linha: em um comentário ou outro compositor, ele envia, qualquer que seja o atalho de envio escolhido nas suas [preferências](/pt-br/documentacao/accounts#preferences), e, se você escolheu Enter como atalho de envio, Enter também envia.

Para selecionar blocos inteiros, arraste de um bloco para outro ou desenhe um retângulo de seleção de fora do texto: pressione na margem ao lado dele ou no espaço vazio abaixo da página e arraste sobre os blocos. Cada bloco que o retângulo toca é selecionado; um clique ali sem arrastar continua colocando o cursor nessa linha, e Esc cancela o retângulo. Cada bloco alcançado é destacado com cantos arredondados, na cor do texto selecionado. Quando um único bloco está selecionado, a barra de seleção abre acima dele: suas ações (**Transformar em**, **Cor**, **Negrito** e os outros formatos, **Copiar**, **Pergunte ao Numo**, **Comentário**) se aplicam ao bloco, e depois de **Transformar em** ele continua selecionado para que outra ação possa vir em seguida. Com vários blocos selecionados, a barra fica oculta: abra o menu da alça de um bloco selecionado, que age sobre todos. Shift+clique em outro bloco, ou Shift+seta para cima e Shift+seta para baixo na borda de um bloco, ampliam a seleção em blocos inteiros. Esc seleciona o bloco em que você está escrevendo, e Esc de novo limpa a seleção. Command+A no macOS ou Ctrl+A no Windows/Linux seleciona primeiro o texto do bloco em que você está, inclusive em um bloco de código, e, pressionado de novo, todos os blocos. Com blocos selecionados, a seta para cima e a seta para baixo selecionam o bloco acima ou abaixo, Shift+seta para cima e Shift+seta para baixo adicionam ou removem blocos, Backspace ou Delete os exclui, Command/Ctrl+C os copia, Command/Ctrl+X os recorta, e Enter em um único bloco coloca o cursor no fim dele; digitar não faz nada. O menu do bloco age sobre todos os blocos selecionados. Digite no campo de busca do menu do bloco para chegar a qualquer uma das suas ações, incluindo tipos de bloco e cores: uma entrada de um submenu mostra o caminho, por exemplo **Transformar em** › **Título 1**. Imagens, arquivos, blocos de código, equações, divisores, menções e código em linha mostram o mesmo destaque quando estão selecionados, sozinhos ou dentro de uma seleção. Enquanto você escreve ou edita um comentário, Esc continua fechando ou cancelando o comentário. Em uma tela sensível ao toque, o toque longo continua selecionando texto, e arrastar não seleciona blocos.

No celular, o editor não mostra alças de bloco nem barra de seleção, e digitar `@` deixa um caractere comum. Enquanto um editor está em foco, uma barra flutuante fica acima do teclado e se oculta quando o teclado fecha: **Inserir um bloco** (+) lista os blocos deste editor, nas mesmas seções do menu `/`, e insere o escolhido no cursor, como `/`; **Mencionar** (@) lista pessoas, tickets, objetivos e páginas para mencionar, agrupados por tipo; depois vêm **Negrito**, **Itálico**, **Tachado**, **Código**, **Cor** (uma folha para a cor do texto ou do fundo), **Adicionar link**, **Diminuir recuo** e **Aumentar recuo** em uma lista, **Comentário** em uma página e **Ocultar teclado**, que fica fixo na extremidade direita. Uma folha inferior em que você escreve cresce até a altura total da tela, e a linha que você está digitando fica acima do teclado. Um toque longo seleciona texto em um editor, e a barra e suas folhas também funcionam no caderno de tarefas. A navegação inferior se oculta enquanto um campo de texto está em foco, como o título de uma página ou um comentário. Em uma tela sensível ao toque, **Adicionar ícone** fica sempre visível em uma página.

### Localizar e substituir em uma página {#find-and-replace}

Enquanto uma página está na tela, Command+F no macOS ou Ctrl+F no Windows/Linux abre uma barra de busca no canto superior direito do documento, esteja o cursor onde estiver; em uma página aberta no painel lateral, ela busca nessa página. O texto que você tinha selecionado vira a busca. Cada resultado é destacado, o atual com mais força, e a barra mostra a posição dele, por exemplo 2 de 7. Enter vai para o próximo resultado e Shift+Enter para o anterior; pressionar Command/Ctrl+F de novo seleciona o texto buscado. **Diferenciar maiúsculas e minúsculas**, **Palavra inteira** e **Expressão regular** refinam a busca; uma expressão inválida é sinalizada e não destaca nada. A busca abrange o corpo da página, não o título.

Se você pode editar a página, **Mostrar substituição** adiciona um campo para o texto de substituição, com **Substituir**, que substitui o resultado atual e passa ao próximo, e **Substituir tudo**. Em uma expressão regular, `$1` a `$9` inserem os grupos encontrados e `$&` o resultado inteiro; uma busca simples insere o texto exatamente como você digitou. Uma substituição é uma edição comum: ela é salva e chega aos outros editores como a digitação, e Command/Ctrl+Z a desfaz, **Substituir tudo** de uma só vez. Esc fecha a barra e volta ao texto. O caderno de tarefas tem a mesma barra. No restante do minddy, e quando outra caixa de diálogo está aberta sobre a página, Command/Ctrl+F abre a busca do navegador.

### Salvamento e portabilidade {#editor-save}

A página é salva enquanto você digita: cada alteração chega ao servidor em instantes, e o indicador de salvamento mostra o salvamento em andamento até o servidor aceitá-la. Várias pessoas podem editar a mesma página ao mesmo tempo, inclusive o mesmo parágrafo ou o título. As alterações de cada pessoa aparecem para as outras enquanto ela digita, assim como as edições que o Numo ou um agente conectado por MCP fazem na página.

Se a conexão cair, mantenha a página aberta. As alterações não salvas permanecem na página e são enviadas quando a conexão volta; as alterações dos outros chegam ao mesmo tempo e se mesclam com as suas. O minddy só abre outra página depois que suas alterações são salvas: enquanto elas não podem ser enviadas, ele mantém você na página e informa que o salvamento falhou. Fechar uma aba do navegador com alterações não salvas pede uma confirmação antes; sair do aplicativo para desktop não pede, e as alterações não salvas são perdidas. Se você perder o acesso à página ou a permissão para editá-la enquanto houver alterações não salvas, o minddy as desfaz e exibe uma mensagem. Quando o servidor recusa uma alteração, por exemplo um título com mais de 500 caracteres ou um link cujo protocolo não é permitido, o minddy desfaz essa alteração e exibe uma mensagem. O histórico pode ajudar a inspecionar versões salvas anteriormente.

Exportações Markdown e leituras de páginas por agentes preservam ícones e cores dos avisos na representação compatível. Uma imagem redimensionada também mantém sua largura, escrita como título da imagem (`![alt](src "width=60%")`), então edições do Numo, de agentes MCP ou do caderno de tarefas não a redefinem. Agentes leem e escrevem uma menção de página como `[@Title](mention:page/<id>)`; a forma antiga `[[page:<id>]]` continua aceita e é lida como a mesma menção, inclusive dentro de uma linha. As equações trafegam como LaTeX: `$E = mc^2$` dentro de uma linha e um bloco entre duas linhas `$$`. Um valor como `$5` continua sendo texto. Os formatos de exportação diferem na fidelidade e no tratamento de anexos, então confira o documento resultante antes de substituir uma fonte original. Use blocos de código para comandos literais e preserve os pré-requisitos e avisos no texto ao redor.

## Discutir uma página e lidar com conflitos {#page-comments-and-collaboration}

Abra uma página do projeto e os controles de comentários. Selecione o conteúdo relevante ao criar um comentário ancorado, explique a pergunta ou mudança proposta e use menções para envolver um membro. Um leitor pode comentar quando o proprietário ativou **Pode comentar** para ele. Responda na discussão para manter a decisão junto ao contexto. Resolva a discussão quando a pergunta tiver sido realmente atendida. A discussão de um bloco abre em uma caixa de diálogo no computador e em uma folha inferior no celular, em vez de ao lado do bloco: ela mostra o trecho citado, as discussões existentes com suas respostas e um campo para um novo comentário. Abra-a pelo selo de comentários do bloco, por **Comentário** na barra de seleção ou pelo menu do bloco. No computador, passar o ponteiro sobre um bloco sem comentários mostra à direita um botão **Comentar este bloco**, na altura da alça do bloco; um bloco comentado mostra ali seu selo de comentários. Passar o ponteiro sobre esse botão destaca o bloco dele como uma seleção. Esse botão não aparece no celular.

Avatares de presença identificam quem está vendo a página. Enquanto alguém edita, o cursor e a seleção dessa pessoa aparecem no corpo e no título, em uma cor própria e identificados com o nome dela. O cursor de um leitor não é exibido. Um cursor mostra onde alguém está trabalhando, não que o texto dessa pessoa esteja salvo: o indicador de salvamento reflete apenas as suas alterações.


![Atividade da página ainda sem eventos e campo de comentário vazio.](/documentation/pt-BR/page-comments.png)

### Recuperar um conflito de salvamento {#page-conflict}

Edições simultâneas são mescladas automaticamente, caractere por caractere, inclusive dentro do mesmo parágrafo. Um aviso de conflito ainda pode aparecer quando o minddy precisa recarregar a página enquanto você tem alterações não salvas: depois de uma desconexão durante a qual muitas alterações foram feitas, ou depois de uma alteração feita sem edição ao vivo, como uma importação em um banco de dados. Se as suas alterações e a versão recarregada modificaram o mesmo bloco de primeiro nível, o documento mantém a versão recarregada desse bloco e o aviso oferece a sua para análise.

Compare o bloco identificado com o documento atual. Escolha restaurar sua versão apenas quando realmente quiser substituir esse bloco por ela. Se sua ação em conflito foi uma exclusão, a opção de excluí-lo novamente aplica essa exclusão de forma explícita. Dispensar o aviso mantém o documento adotado e fecha o alerta; não restaura sua versão. Preserve o texto que deseja recuperar antes de dispensar e use o histórico para examinar versões salvas quando precisar de uma recuperação mais ampla. Essas escolhas afetam o bloco identificado, sem substituir toda a página às cegas.

Uma âncora pode desaparecer após edições do documento; leia a discussão antes de mover ou excluir o bloco referido. Comentários e atividade são internos ao projeto, salvo publicação explícita de conteúdo por um caminho compatível. Teste uma página publicada para determinar a visão real do visitante, em vez de supor que os controles de colaboração se tornem públicos.

## Anexar e recuperar arquivos de páginas {#page-files}

Abra a página como membro do projeto e use os controles de anexo ou upload. Selecione um arquivo não vazio dentro do limite de 10 MB por arquivo. A cota de armazenamento da conta ou instância pode impor um limite adicional. Preserve o original até o upload ter êxito.

Imagens podem ser inseridas como blocos de imagem, e outros documentos podem ser anexados como blocos de arquivo. O servidor determina o tipo de mídia armazenado pelos bytes, sem confiar no nome do arquivo ou no rótulo do navegador. A aceitação do upload não garante uma prévia na página para todos os formatos; baixe o arquivo quando não houver prévia.

No editor do projeto, clique em uma imagem ou no nome de um bloco de arquivo compatível para abrir o mesmo visualizador de janela inteira usado pelos anexos dos tickets. Markdown (`.md`), texto simples (`.txt`, `.text`), CSV, PDF e formatos de áudio ou vídeo compatíveis abrem em contêineres próprios. Use Fechar ou Escape para voltar à página. O menu Ações do arquivo (`…`) oferece Baixar. Em uma página editável, um bloco de arquivo oferece também Renomear, que muda o nome exibido na página, e imagens e arquivos oferecem Remover: pede confirmação, remove o bloco do documento e você pode desfazer isso no editor. O bloco de arquivo também mantém o controle direto Baixar. Os formatos não compatíveis, os links para arquivos externos e os blocos de arquivo em páginas publicadas mantêm o comportamento de download. As imagens publicadas usam o visualizador sem a ação de remoção.

![Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar, Renomear e Remover.](/documentation/pt-BR/file-preview.png)

Confira se o arquivo aparece na página e abra ou baixe. Os bytes ficam no Storage, enquanto os metadados da página e do arquivo determinam o acesso. Salvar a página com sucesso não prova, por si só, que os bytes do arquivo estejam disponíveis.

### Arquivos compartilhados e falhas {#file-access}

Um arquivo referenciado em uma página publicada pode ficar disponível para seus visitantes. Arquivos de páginas fora da ramificação publicada não ganham acesso apenas porque outra página contém uma referência. Revise a página e os descendentes incluídos na publicação antes de compartilhar.

Se o upload falhar, confira tamanho, cota e mensagem de erro. Um operador de instância auto-hospedada também deve verificar configuração e políticas do Storage. Para um arquivo ausente após restauração, recupere os bytes brutos do Storage e os metadados correspondentes; restaurar apenas o banco de dados não recria o arquivo. As URLs de arquivos publicados são assinadas por até 24 horas quando a página é renderizada. Revogar um compartilhamento impede novas visitas autorizadas à página, mas não invalida imediatamente URLs de arquivos já entregues; elas podem continuar utilizáveis até expirar. Você não pode retirar cópias já baixadas pelos visitantes.


![Página de demonstração com um upload incompleto e um arquivo salvo de 67 bytes com a opção Baixar.](/documentation/pt-BR/page-file-states.png)

## Inspecionar e restaurar uma versão de página {#page-history}

Abra o indicador de salvamento ou histórico da página para ver versões, ou o controle de comentários e atividade para inspecionar ações. Essas abas respondem a perguntas diferentes: uma versão salva é um estado do documento, enquanto a atividade pode incluir renomeação, exclusão ou restauração sem a mesma cópia de conteúdo.

Selecione uma versão para visualizar antes de restaurar. O histórico identifica autores e atividade de agentes, então compare o conteúdo com a mudança que quer desfazer. A interface anuncia uma janela de histórico de 30 dias; não trate o histórico como backup externo permanente.

### Restaurar e verificar {#restore-page-version}

Como membro autorizado do projeto, restaure a versão selecionada somente depois de revisar o conteúdo atual que será substituído. O estado anterior à restauração também entra no histórico, permitindo recuperá-lo depois enquanto for mantido.

Reabra ou atualize o editor depois da restauração e confira o corpo real da página. Um editor já aberto mantém uma versão desatualizada e não deve sobrescrever cegamente o estado restaurado. Versões de página não são backups completos da instância: bytes de anexos, arquivos excluídos e objetos relacionados podem ter ciclos de vida separados. Use os guias de recuperação de arquivos e do operador quando a informação ausente estiver fora do corpo salvo.


![Aba Versões com um estado anterior expandido, autor, Restaurar e aviso de retenção por 30 dias.](/documentation/pt-BR/page-history-preview.png)

## Publicar uma página e revogar seu link {#publish-a-page}

Abra uma página do projeto como proprietário ou Membro e use os controles de publicação. Revise primeiro conteúdo e anexos. Escolha acesso privado, protegido por senha ou público. A senha exige pelo menos oito caracteres e é aplicada depois do envio; selecionar o modo sozinho não cria um link protegido.

Copie o link /p/ gerado depois que a publicação tiver êxito. Se a página tiver descendentes, revise a opção de incluí-los e a quantidade. Incluí-los publica a ramificação selecionada; excluí-los mantém o conteúdo fora dessa publicação. Um banco de dados sem descendentes publicados não expõe automaticamente todos os corpos das entradas.

Abra o link em uma sessão separada do navegador sem sua conta. Teste a senha se habilitada, conteúdo da página, subpáginas desejadas e downloads. Uma menção de uma página do conjunto publicado mostra o título dela e a abre pelo mesmo link; uma menção de qualquer outra página mostra **Subpágina não publicada** e não abre. Isso verifica o acesso somente leitura do visitante, não suas permissões mais amplas de membro.


![Janela de publicação com Privado selecionado e opções de senha ou link.](/documentation/pt-BR/page-publish.png)

### Revogar e verificar {#revoke-page}

Volte aos controles de publicação, escolha privado e confirme com **Despublicar**: o link antigo para de funcionar, e publicar de novo cria um novo link. Depois da revogação bem-sucedida, abra o link antigo anonimamente e confira se o acesso é negado. Você não pode retirar cópias ou capturas já recebidas pelos visitantes. As URLs de download de arquivos já entregues por uma página publicada são assinadas por até 24 horas. A revogação impede novas visitas à página, mas essas URLs de arquivos já emitidas podem permanecer válidas até expirar.

Links de páginas de usuários continuam `noindex` e são separados do manual oficial indexado. Noindex é uma política de descoberta, não uma senha de acesso. Se um descendente ou arquivo puder ser lido inesperadamente, revogue primeiro, inspecione a ramificação publicada e teste novamente antes de encaminhar um link corrigido. Arquivos de páginas não publicadas não ganham acesso por uma referência interna.

## Exportar ou imprimir uma página {#import-export-and-print-pages}

Abra o menu do documento da página e escolha Exportar. Selecione Markdown para uma página (.md) ou um ramo (.zip), PDF para abrir a visualização de impressão ou o arquivo de banco de dados quando a página for um banco de dados. Confira o escopo oferecido antes de confirmar: uma página, seu ramo e um arquivo de banco de dados contêm elementos diferentes.

Abra a exportação e confira os títulos, os blocos de aviso, os links e os anexos necessários para quem vai ler. Na exportação, as menções mostram os títulos atuais das páginas, e as menções de páginas incluídas na exportação viram links relativos. A ação PDF abre uma visualização de impressão legível sem toda a navegação do aplicativo. Use os controles de impressão do navegador para imprimir ou salvar um PDF. O menu do documento não oferece uma ação de importação geral. As importações aceitas começam em um banco vazio, conforme o [guia de importação de bancos de dados](/pt-br/documentacao/databases#import-a-database).


![Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.](/documentation/pt-BR/page-export.png)

### Arquivos de banco de dados e limites {#export-fidelity}

Um arquivo de banco de dados (.zip) inclui seu ramo: Markdown e CSV, o esquema exato e as cores das opções, valores, conteúdos, datas e horários, páginas aninhadas e os dados dos arquivos. Importe-o em um banco novo e vazio para restaurar essa estrutura. As visualizações salvas do banco de dados não fazem parte do arquivo: recrie-as depois da importação. Duplicar um banco de dados mantém suas visualizações.

Uma exportação não transfere senhas, credenciais de provedores de conta nem assinaturas. Para mover o trabalho de uma conta entre instâncias, use o guia de transferência de dados da conta. Se um formato importado não conseguir preservar um bloco ou uma propriedade externa, confira o resultado antes de usá-lo como substituto. Não exclua o original só porque foi criado um arquivo para download.


## Rotinas para novas entradas {#entry-routines}

O proprietário pode escolher este banco como gatilho em [Rotinas](/docs/scheduled-routines#conditions). As condições usam as propriedades tipadas da entrada. Uma entrada vazia pode aguardar o preenchimento das propriedades. Criação, duplicação, importação de banco e movimentação permitida para o banco contam como chegadas; restauração não. Remover uma propriedade referenciada ou mudar seu tipo exige corrigir o filtro da rotina.
