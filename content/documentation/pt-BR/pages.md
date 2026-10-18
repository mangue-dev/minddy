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
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-680); MIN-693 project roles; MIN-718 hybrid issue search; MIN-688 live collaboration",
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
      "components/pages/page-comment-popover.tsx",
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
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-680-file-preview.md",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "content/documentation/reviews/min-688-live-collaboration.md"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:/root (MIN-680 source, focused route/UI tests and isolated browser review; prior controls retain existing evidence); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-688 live collaboration: source, convergence/authority unit tests and a rollback-only database probe; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (pt-BR changed-text and retained-meaning self-review); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (pt-BR translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min688_pt-BR with agent:/root (pt-BR MIN-688 translation of the rewritten saving, presence and conflict passages; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        272,
        152
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        948
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-comments.png",
      "alt": "Atividade da página com uma edição de demonstração e campo de comentário vazio.",
      "caption": "Leia a atividade e escreva um comentário no campo. Nenhum comentário foi enviado neste exemplo.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        625
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/page-file-states.png",
      "alt": "Página de demonstração com um upload incompleto e um arquivo salvo de 67 bytes com a opção Baixar.",
      "caption": "Confira o estado real do arquivo: o segundo anexo está disponível, mas o primeiro upload incompleto não.",
      "revision": 12,
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
      "revision": 12,
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "alt": "Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar e Remover.",
      "caption": "O visualizador compartilhado mantém Fechar abaixo da prévia. O menu Ações do arquivo oferece Baixar e, quando permitido, Remover.",
      "revision": 12,
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

Abra Páginas em um projeto do qual você participa. Use o menu + e escolha uma página para um documento ou um banco de dados para uma lista estruturada. Dê um título útil e escreva a especificação, decisão ou procedimento que a página precisa preservar.

Crie subpáginas para documentos relacionados e use os controles da árvore para mover ou reordenar. Uma página não pode se tornar descendente de si mesma. Duplicar uma página cria conteúdo novo, não uma referência atualizada ao original. Revise a ramificação duplicada antes de editar ou compartilhar.

### Favoritos e exclusão {#page-tree}

Marque uma página como favorita para destacá-la no topo da árvore do projeto. Esses favoritos são compartilhados no projeto, ao contrário de uma nota privada do caderno. Vincule uma página a uma tarefa quando o documento atual for contexto da tarefa; o título do recurso acompanha renomeações da página.

A exclusão envia para a lixeira as páginas que permitem recuperação. Confira a ramificação selecionada antes de excluir e use a recuperação em vez de recriar uma página perdida quando o conteúdo precisa ser mantido. Entradas com valores de banco de dados armazenados podem ser reordenadas dentro do banco, mas não movidas para fora. Se um movimento for rejeitado, inspecione hierarquia e tipo de entrada em vez de forçar por tentativas repetidas.


![Menu de criação com Nova página e Novo banco de dados.](/documentation/pt-BR/page-create-menu.png)

## Escrever uma página com blocos e menções {#page-editor}

Abra a página e edite título ou corpo como proprietário ou Membro. Os leitores podem abrir e ler páginas, mas não podem editá-las, importá-las, duplicá-las, marcá-las como favoritas nem publicá-las, nem restaurar uma versão. Use o menu de comandos de barra e os controles de formatação para inserir títulos, parágrafos, listas, tarefas, código, seções recolhíveis e avisos. Um aviso pode ter ícone emoji e cor da paleta; escolha-os para distinguir informação útil, não como a única forma de comunicar uma advertência.

Use menções para vincular problemas, objetivos, pessoas ou páginas relevantes. Digite `@` seguido de um identificador, palavras do título ou uma breve descrição; uma busca descritiva também lista problemas encontrados [pelo sentido](/docs/navigation#search-by-meaning) em **Relacionados pelo sentido**, depois das correspondências de texto. Referências inversas ajudam leitores a encontrar páginas que apontam para a atual. Um link fornece contexto, não acesso a um objeto privado de outro projeto.


![Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.](/documentation/pt-BR/page-editor.png)

### Salvamento e portabilidade {#editor-save}

A página é salva enquanto você digita: cada alteração chega ao servidor em instantes, e o indicador de salvamento mostra o salvamento em andamento até o servidor aceitá-la. Várias pessoas podem editar a mesma página ao mesmo tempo, inclusive o mesmo parágrafo ou o título. As alterações de cada pessoa aparecem para as outras enquanto ela digita, assim como as edições que o Numo ou um agente conectado por MCP fazem na página.

Se a conexão cair, mantenha a página aberta. As alterações não salvas permanecem na página e são enviadas quando a conexão volta; as alterações dos outros chegam ao mesmo tempo e se mesclam com as suas. O minddy só abre outra página depois que suas alterações são salvas: enquanto elas não podem ser enviadas, ele mantém você na página e informa que o salvamento falhou. Fechar uma aba do navegador com alterações não salvas pede uma confirmação antes; sair do aplicativo para desktop não pede, e as alterações não salvas são perdidas. Se você perder o acesso à página ou a permissão para editá-la enquanto houver alterações não salvas, o minddy as desfaz e exibe uma mensagem. Quando o servidor recusa uma alteração, por exemplo um título com mais de 500 caracteres ou um link cujo protocolo não é permitido, o minddy desfaz essa alteração e exibe uma mensagem. O histórico pode ajudar a inspecionar versões salvas anteriormente.

Exportações Markdown e leituras de páginas por agentes preservam ícones e cores dos avisos na representação compatível. Os formatos de exportação diferem na fidelidade e no tratamento de anexos, então confira o documento resultante antes de substituir uma fonte original. Use blocos de código para comandos literais e preserve os pré-requisitos e avisos no texto ao redor.

## Discutir uma página e lidar com conflitos {#page-comments-and-collaboration}

Abra uma página do projeto e os controles de comentários. Selecione o conteúdo relevante ao criar um comentário ancorado, explique a pergunta ou mudança proposta e use menções para envolver um membro. Um leitor pode comentar quando o proprietário ativou **Pode comentar** para ele. Responda na discussão para manter a decisão junto ao contexto. Resolva a discussão quando a pergunta tiver sido realmente atendida.

Avatares de presença identificam quem está vendo a página. Enquanto alguém edita, o cursor e a seleção dessa pessoa aparecem no corpo e no título, em uma cor própria e identificados com o nome dela. O cursor de um leitor não é exibido. Um cursor mostra onde alguém está trabalhando, não que o texto dessa pessoa esteja salvo: o indicador de salvamento reflete apenas as suas alterações.


![Atividade da página com uma edição de demonstração e campo de comentário vazio.](/documentation/pt-BR/page-comments.png)

### Recuperar um conflito de salvamento {#page-conflict}

Edições simultâneas são mescladas automaticamente, caractere por caractere, inclusive dentro do mesmo parágrafo. Um aviso de conflito ainda pode aparecer quando o minddy precisa recarregar a página enquanto você tem alterações não salvas: depois de uma desconexão durante a qual muitas alterações foram feitas, ou depois de uma alteração feita sem edição ao vivo, como uma importação em um banco de dados. Se as suas alterações e a versão recarregada modificaram o mesmo bloco de primeiro nível, o documento mantém a versão recarregada desse bloco e o aviso oferece a sua para análise.

Compare o bloco identificado com o documento atual. Escolha restaurar sua versão apenas quando realmente quiser substituir esse bloco por ela. Se sua ação em conflito foi uma exclusão, a opção de excluí-lo novamente aplica essa exclusão de forma explícita. Dispensar o aviso mantém o documento adotado e fecha o alerta; não restaura sua versão. Preserve o texto que deseja recuperar antes de dispensar e use o histórico para examinar versões salvas quando precisar de uma recuperação mais ampla. Essas escolhas afetam o bloco identificado, sem substituir toda a página às cegas.

Uma âncora pode desaparecer após edições do documento; leia a discussão antes de mover ou excluir o bloco referido. Comentários e atividade são internos ao projeto, salvo publicação explícita de conteúdo por um caminho compatível. Teste uma página publicada para determinar a visão real do visitante, em vez de supor que os controles de colaboração se tornem públicos.

## Anexar e recuperar arquivos de páginas {#page-files}

Abra a página como membro do projeto e use os controles de anexo ou upload. Selecione um arquivo não vazio dentro do limite de 10 MB por arquivo. A cota de armazenamento da conta ou instância pode impor um limite adicional. Preserve o original até o upload ter êxito.

Imagens podem ser inseridas como blocos de imagem, e outros documentos podem ser anexados como blocos de arquivo. O servidor determina o tipo de mídia armazenado pelos bytes, sem confiar no nome do arquivo ou no rótulo do navegador. A aceitação do upload não garante uma prévia na página para todos os formatos; baixe o arquivo quando não houver prévia.

No editor do projeto, clique em uma imagem ou no nome de um bloco de arquivo compatível para abrir o mesmo visualizador de janela inteira usado pelos anexos dos tickets. Markdown (`.md`), texto simples (`.txt`, `.text`), CSV, PDF e formatos de áudio ou vídeo compatíveis abrem em contêineres próprios. Use Fechar ou Escape para voltar à página. O menu Ações do arquivo (`…`) oferece Baixar; Remover só aparece em páginas editáveis e remove o bloco do documento. O bloco de arquivo também mantém o controle direto Baixar. Os formatos não compatíveis, os links para arquivos externos e os blocos de arquivo em páginas publicadas mantêm o comportamento de download. As imagens publicadas usam o visualizador sem a ação de remoção.

![Visualizador CSV de janela inteira com tarefas de exemplo, um botão Fechar grande e o menu Ações do arquivo com Baixar e Remover.](/documentation/pt-BR/file-preview.png)

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

Abra o link em uma sessão separada do navegador sem sua conta. Teste a senha se habilitada, conteúdo da página, subpáginas desejadas e downloads. Isso verifica o acesso somente leitura do visitante, não suas permissões mais amplas de membro.


![Janela de publicação com Privado selecionado e opções de senha ou link.](/documentation/pt-BR/page-publish.png)

### Revogar e verificar {#revoke-page}

Volte aos controles de publicação e escolha privado. Depois da revogação bem-sucedida, abra o link antigo anonimamente e confira se o acesso é negado. Você não pode retirar cópias ou capturas já recebidas pelos visitantes. As URLs de download de arquivos já entregues por uma página publicada são assinadas por até 24 horas. A revogação impede novas visitas à página, mas essas URLs de arquivos já emitidas podem permanecer válidas até expirar.

Links de páginas de usuários continuam `noindex` e são separados do manual oficial indexado. Noindex é uma política de descoberta, não uma senha de acesso. Se um descendente ou arquivo puder ser lido inesperadamente, revogue primeiro, inspecione a ramificação publicada e teste novamente antes de encaminhar um link corrigido. Arquivos de páginas não publicadas não ganham acesso por uma referência interna.

## Exportar ou imprimir uma página {#import-export-and-print-pages}

Abra o menu do documento da página e escolha Exportar. Selecione Markdown para uma página (.md) ou um ramo (.zip), PDF para abrir a visualização de impressão ou o arquivo de banco de dados quando a página for um banco de dados. Confira o escopo oferecido antes de confirmar: uma página, seu ramo e um arquivo de banco de dados contêm elementos diferentes.

Abra a exportação e confira os títulos, os blocos de aviso, os links e os anexos necessários para quem vai ler. A ação PDF abre uma visualização de impressão legível sem toda a navegação do aplicativo. Use os controles de impressão do navegador para imprimir ou salvar um PDF. O menu do documento não oferece uma ação de importação geral. As importações aceitas começam em um banco vazio, conforme o [guia de importação de bancos de dados](/pt-br/documentacao/databases#import-a-database).


![Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.](/documentation/pt-BR/page-export.png)

### Arquivos de banco de dados e limites {#export-fidelity}

Um arquivo de banco de dados (.zip) inclui seu ramo: Markdown e CSV, o esquema exato e as cores das opções, valores, conteúdos, datas e horários, páginas aninhadas e os dados dos arquivos. Importe-o em um banco novo e vazio para restaurar essa estrutura. Os filtros, a ordenação e as preferências de colunas ocultas específicas do dispositivo permanecem no dispositivo original.

Uma exportação não transfere senhas, credenciais de provedores de conta nem assinaturas. Para mover o trabalho de uma conta entre instâncias, use o guia de transferência de dados da conta. Se um formato importado não conseguir preservar um bloco ou uma propriedade externa, confira o resultado antes de usá-lo como substituto. Não exclua o original só porque foi criado um arquivo para download.


## Rotinas para novas entradas {#entry-routines}

O proprietário pode escolher este banco como gatilho em [Rotinas](/docs/scheduled-routines#conditions). As condições usam as propriedades tipadas da entrada. Uma entrada vazia pode aguardar o preenchimento das propriedades. Criação, duplicação, importação de banco e movimentação permitida para o banco contam como chegadas; restauração não. Remover uma propriedade referenciada ou mudar seu tipo exige corrigir o filtro da rotina.
