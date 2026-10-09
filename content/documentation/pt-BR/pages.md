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
  "revision": 6,
  "sourceRevision": 6,
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
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
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

Abra a página e edite título ou corpo como membro do projeto. Use o menu de comandos de barra e os controles de formatação para inserir títulos, parágrafos, listas, tarefas, código, seções recolhíveis e avisos. Um aviso pode ter ícone emoji e cor da paleta; escolha-os para distinguir informação útil, não como a única forma de comunicar uma advertência.

Use menções para vincular problemas, objetivos, pessoas ou páginas relevantes. Referências inversas ajudam leitores a encontrar páginas que apontam para a atual. Um link fornece contexto, não acesso a um objeto privado de outro projeto.


![Página de demonstração com títulos, parágrafos, caixas de tarefas e menção a um ticket.](/documentation/pt-BR/page-editor.png)

### Salvamento e portabilidade {#editor-save}

Observe o indicador de salvamento antes de sair de uma edição importante. Se outra edição criar um conflito, use os controles de recuperação exibidos e preserve seu texto; não suponha que ambas foram mescladas. O histórico pode ajudar a inspecionar versões salvas anteriormente.

Exportações Markdown e leituras de páginas por agentes preservam ícones e cores dos avisos na representação compatível. Os formatos de exportação diferem na fidelidade e no tratamento de anexos, então confira o documento resultante antes de substituir uma fonte original. Use blocos de código para comandos literais e preserve os pré-requisitos e avisos no texto ao redor.

## Discutir uma página e lidar com conflitos {#page-comments-and-collaboration}

Abra uma página do projeto e os controles de comentários. Selecione o conteúdo relevante ao criar um comentário ancorado, explique a pergunta ou mudança proposta e use menções para envolver um membro. Responda na discussão para manter a decisão junto ao contexto. Resolva a discussão quando a pergunta tiver sido realmente atendida.

Avatares de presença identificam quem está vendo a página. Eles não provam que o texto não salvo de outra pessoa chegou ao servidor nem que edições simultâneas sejam mescladas automaticamente. Leia o estado atual de salvamento antes de sair.


![Atividade da página com uma edição de demonstração e campo de comentário vazio.](/documentation/pt-BR/page-comments.png)

### Recuperar um conflito de salvamento {#page-conflict}

O minddy combina edições de blocos diferentes no primeiro nível do documento quando consegue preservar as duas alterações. Ele não mescla caractere por caractere edições simultâneas dentro do mesmo bloco. Se as duas pessoas alteraram esse bloco, o documento mantém a versão remota e um aviso oferece seu bloco anterior para análise.

Compare o bloco identificado com o documento atual. Escolha restaurar sua versão apenas quando realmente quiser substituir esse bloco por ela. Se sua ação em conflito foi uma exclusão, a opção de excluí-lo novamente aplica essa exclusão de forma explícita. Dispensar o aviso mantém o documento adotado e fecha o alerta; não restaura sua versão. Preserve o texto que deseja recuperar antes de dispensar e use o histórico para examinar versões salvas quando precisar de uma recuperação mais ampla. Essas escolhas afetam o bloco identificado, sem substituir toda a página às cegas.

Uma âncora pode desaparecer após edições do documento; leia a discussão antes de mover ou excluir o bloco referido. Comentários e atividade são internos ao projeto, salvo publicação explícita de conteúdo por um caminho compatível. Teste uma página publicada para determinar a visão real do visitante, em vez de supor que os controles de colaboração se tornem públicos.

## Anexar e recuperar arquivos de páginas {#page-files}

Abra a página como membro do projeto e use os controles de anexo ou upload. Selecione um arquivo não vazio dentro do limite de 10 MB por arquivo. A cota de armazenamento da conta ou instância pode impor um limite adicional. Preserve o original até o upload ter êxito.

Imagens podem ser inseridas como blocos de imagem, e outros documentos podem ser anexados como blocos de arquivo. O servidor determina o tipo de mídia armazenado pelos bytes, sem confiar no nome do arquivo ou no rótulo do navegador. A aceitação do upload não garante uma prévia na página para todos os formatos; baixe o arquivo quando não houver prévia.

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

Abra uma página do projeto como membro e use os controles de publicação. Revise primeiro conteúdo e anexos. Escolha acesso privado, protegido por senha ou público. A senha exige pelo menos oito caracteres e é aplicada depois do envio; selecionar o modo sozinho não cria um link protegido.

Copie o link /p/ gerado depois que a publicação tiver êxito. Se a página tiver descendentes, revise a opção de incluí-los e a quantidade. Incluí-los publica a ramificação selecionada; excluí-los mantém o conteúdo fora dessa publicação. Um banco de dados sem descendentes publicados não expõe automaticamente todos os corpos das entradas.

Abra o link em uma sessão separada do navegador sem sua conta. Teste a senha se habilitada, conteúdo da página, subpáginas desejadas e downloads. Isso verifica o acesso somente leitura do visitante, não suas permissões mais amplas de membro.


![Janela de publicação com Privado selecionado e opções de senha ou link.](/documentation/pt-BR/page-publish.png)

### Revogar e verificar {#revoke-page}

Volte aos controles de publicação e escolha privado. Depois da revogação bem-sucedida, abra o link antigo anonimamente e confira se o acesso é negado. Você não pode retirar cópias ou capturas já recebidas pelos visitantes. As URLs de download de arquivos já entregues por uma página publicada são assinadas por até 24 horas. A revogação impede novas visitas à página, mas essas URLs de arquivos já emitidas podem permanecer válidas até expirar.

Links de páginas de usuários continuam noindex e são separados do manual oficial indexado. Noindex é uma política de descoberta, não uma senha de acesso. Se um descendente ou arquivo puder ser lido inesperadamente, revogue primeiro, inspecione a ramificação publicada e teste novamente antes de encaminhar um link corrigido. Arquivos de páginas não publicadas não ganham acesso por uma referência interna.

## Exportar ou imprimir uma página {#import-export-and-print-pages}

Abra o menu do documento da página e escolha Exportar. Selecione Markdown para uma página (.md) ou um ramo (.zip), PDF para abrir a visualização de impressão ou o arquivo de banco de dados quando a página for um banco de dados. Confira o escopo oferecido antes de confirmar: uma página, seu ramo e um arquivo de banco de dados contêm elementos diferentes.

Abra a exportação e confira os títulos, os blocos de aviso, os links e os anexos necessários para quem vai ler. A ação PDF abre uma visualização de impressão legível sem toda a navegação do aplicativo. Use os controles de impressão do navegador para imprimir ou salvar um PDF. O menu do documento não oferece uma ação de importação geral. As importações aceitas começam em um banco vazio, conforme o [guia de importação de bancos de dados](/pt-br/documentacao/databases#import-a-database).


![Menu de exportação do documento com Markdown (.md) e Imprimir / PDF.](/documentation/pt-BR/page-export.png)

### Arquivos de banco de dados e limites {#export-fidelity}

Um arquivo de banco de dados (.zip) inclui seu ramo: Markdown e CSV, o esquema exato e as cores das opções, valores, conteúdos, datas e horários, páginas aninhadas e os dados dos arquivos. Importe-o em um banco novo e vazio para restaurar essa estrutura. Os filtros, a ordenação e as preferências de colunas ocultas específicas do dispositivo permanecem no dispositivo original.

Uma exportação não transfere senhas, credenciais de provedores de conta nem assinaturas. Para mover o trabalho de uma conta entre instâncias, use o guia de transferência de dados da conta. Se um formato importado não conseguir preservar um bloco ou uma propriedade externa, confira o resultado antes de usá-lo como substituto. Não exclua o original só porque foi criado um arquivo para download.
