---
{
  "id": "objectives",
  "locale": "pt-BR",
  "title": "Objetivos",
  "summary": "Defina o resultado de um projeto, vincule o trabalho e interprete o progresso, as dependências e o ritmo.",
  "topic": "Projetos e tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 23,
  "sourceRevision": 22,
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-field-shortcuts.ts",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts",
      "lib/objective-order.ts",
      "components/objective-label.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "app/(app)/projects/[id]/page.tsx",
      "components/objectives/objectives-page.tsx",
      "components/app-sidebar.tsx"
    ]
  },
  "review": {
    "revision": 23,
    "fact": "agent:claude-code (desktop sidebar staying on the objectives list with the shown objective highlighted while a project board shows one objective's issues, and switching objectives from that list; checked against app/(app)/projects/[id]/page.tsx, components/objectives/objectives-page.tsx and components/app-sidebar.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the objective board sidebar)",
    "language": "agent:claude-code (pt-BR changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Acompanhar um resultado com um objetivo",
    "Interpretar dependências e ritmo dos objetivos"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-objectives.png",
      "alt": "Janela de criação de objetivo não enviada no projeto Aurora com um nome de resultado de exemplo e o botão Criar objetivo.",
      "caption": "Defina o resultado antes de escolher responsável, data prevista e status. Essa janela não criou um segundo objetivo.",
      "revision": 23,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Um objetivo reúne os tickets de um projeto para acompanhar um resultado. Suas dependências mostram os impedimentos, enquanto o progresso e o ritmo ajudam a interpretar o trabalho vinculado. Esses indicadores não substituem a verificação do resultado nem garantem uma data de entrega.

## Acompanhar um resultado com um objetivo {#objectives}

Abra o destino de objetivos do projeto e crie um objetivo. Ao criá-lo em outro lugar do aplicativo, escolha o projeto em **Criar em**, no canto superior esquerdo do formulário (ao lado do título **Novo objetivo** no celular); trocar de projeto remove o responsável e as relações escolhidos para o anterior. No computador, Command/Ctrl+Shift+P abre esse menu mesmo enquanto você digita o nome ou a descrição; ao escolher um projeto ou fechar o menu, o cursor volta exatamente para onde estava. A pílula mostra esse atalho, que só existe quando mais de um projeto pode ser escolhido; no celular, nenhum atalho é indicado. Dê um nome ao resultado desejado, acrescente contexto útil e defina os campos disponíveis de responsável, data-alvo, cor e estado. Em um computador, as mesmas teclas dos campos de um ticket os abrem assim que o cursor sai do nome e da descrição: S o estado, A o responsável, D a data-alvo, R uma relação e C a cor; a dica de cada seletor mostra sua tecla. Um objetivo pertence a um projeto e é diferente de um ciclo pessoal que abrange vários projetos. A pessoa responsável acompanha o resultado; escolhê-la não transfere a propriedade do projeto. Só o proprietário ou um Membro pode ser responsável por um objetivo, e um responsável cujo papel muda para Leitor é removido dele.

A descrição do objetivo e seus comentários usam o mesmo editor das páginas do projeto, sem as alças de bloco: digite `/` para inserir blocos e `@` para mencionar uma pessoa, um ticket, um objetivo ou uma página. O menu `@` também lista os recursos anexados ao que você está escrevendo: o ticket ou objetivo para a descrição e o plano, um comentário para os próprios arquivos ou uma janela de criação para os arquivos adicionados nela. Uma menção a um recurso anexado em outro lugar aparece como **Indisponível**. Várias pessoas podem editar a descrição ao mesmo tempo, com o cursor de cada uma exibido com seu nome e sua cor. Selecione um texto para formatá-lo ou adicionar um link. Cole ou solte uma imagem, ou escolha **Imagem** no menu `/`, para inseri-la na descrição. No celular, a barra acima do teclado substitui a barra de seleção e o menu `@` digitado; o [guia de páginas](/pt-br/documentacao/pages#editor-formatting) a descreve.

Abra cada ticket relevante e escolha o objetivo nas propriedades, ou use os controles de tickets do objetivo. O seletor de objetivos mostra os objetivos abertos antes dos concluídos e cancelados; em cada grupo, aparecem primeiro os que receberam mais tickets nos últimos 30 dias. Cada um mostra seu status e seu nome na sua cor. Confira se o trabalho desejado aparece sob o objetivo. Use a discussão e os recursos para decisões e páginas de referência que se apliquem ao resultado inteiro.

![Janela de criação de objetivo não enviada no projeto Aurora com um nome de resultado de exemplo e o botão Criar objetivo.](/documentation/pt-BR/reader-objectives.png)

### Ler o progresso antes de encerrar {#objective-progress}

Revise tickets concluídos e ativos junto com o progresso do objetivo. Um indicador resume o trabalho vinculado; ele não determina se um resultado de produto é aceitável. Inspecione tarefas ausentes e trabalho cancelado ou duplicado antes de marcar o objetivo como concluído. O quadro do objetivo mostra primeiro o trabalho aberto: selecione **Concluído** e **Cancelado** no filtro **Status** dele para revisar ali os tickets fechados. Em um computador, enquanto o quadro mostra os tickets de um objetivo, a barra lateral continua na lista de objetivos, sob a linha de voltar **Objetivos**, com esse objetivo destacado; escolha outro objetivo nessa lista para mudar o quadro para ele.

Use o ciclo de vida do objetivo para distinguir resultados planejados, em andamento, concluídos e cancelados. Uma data-alvo é uma meta, enquanto uma previsão é uma estimativa baseada na atividade. Se o objetivo parecer vazio, confira a associação dos tickets e os filtros da visualização em vez de recriá-lo. A exclusão de um objetivo usa a lixeira recuperável e não é uma mudança de estado comum.

## Interpretar dependências e ritmo dos objetivos {#objective-dependencies-and-momentum}

Abra o objetivo e suas relações. Na página do objetivo, fora de um campo de texto, R abre a escolha do tipo de relação. Escolhido o tipo, o ticket ou objetivo é escolhido na paleta de comandos, como em um ticket. Confira qual resultado depende de outro e leia as relações de bloqueio entre tickets quando explicarem a restrição. A organização entre pai e filho, um vínculo relacionado e uma dependência de bloqueio respondem a perguntas diferentes; confira a direção antes de mudar uma relação.

Uma relação de bloqueio pode conectar um ticket ou outro objetivo a este objetivo, dentro do mesmo projeto. Seus tickets abertos herdam o bloqueio não resolvido: a relação exibida identifica tanto o pré-requisito real quanto o objetivo que o transmite. Não é salva uma nova relação direta em cada ticket. Encerrar o pré-requisito ou o objetivo bloqueado, ou retirar um ticket desse objetivo, elimina o bloqueio herdado correspondente. Resolva o pré-requisito real ou corrija uma relação obsoleta. Mudar apenas a data-alvo de um objetivo não conclui os tickets que o bloqueiam.

### Interpretar o sinal de ritmo {#momentum}

O painel Ritmo aparece apenas quando o objetivo tem uma data-alvo. Ao remover essa data, o painel fica oculto, incluindo o histórico, as estatísticas de ritmo e a data estimada de conclusão. Adicione uma data-alvo para exibi-lo novamente; o indicador de progresso geral continua disponível sem ela.

O ritmo resume trabalho concluído recentemente. Ele pode estar acelerando, estável, desacelerando ou parado, com estados separados para objetivos não iniciados, concluídos e cancelados. Use-o para identificar um resultado que precisa de atenção, depois leia os tickets e a atividade subjacentes.

A data estimada de conclusão exige pelo menos duas conclusões, uma semana inteira observada, esforço entregue positivo e trabalho restante. Apenas os tickets atualmente vinculados contribuem; uma conclusão anterior à criação do objetivo não produz um ritmo recente artificial.

Com uma data-alvo válida, o histórico vai da criação até essa data e o ritmo de entrega usa o tempo observado desde a criação, incluindo o período depois de um prazo não cumprido. Se uma data-alvo estiver definida, mas não determinar um período válido após a criação, o cálculo usa um histórico móvel de oito semanas e uma janela de previsão de 28 dias.

Histórico escasso ou mudança recente de escopo reduzem sua utilidade. A estimativa não é um prazo prometido e não inclui trabalho invisível que você não vinculou. Compare a data-alvo, o trabalho restante e as restrições reais antes de mudar compromissos.


## Escolher um objetivo para um feedback {#objective-feedback}

Nas propriedades do objetivo, a contagem de feedbacks abre a seção Feedback do projeto filtrada por esse objetivo, incluindo solicitações resolvidas. O valor zero também é exibido. As solicitações continuam separadas do progresso dos tickets e do ritmo.

Um feedback pode pertencer a um objetivo sem virar um ticket. Nos feedbacks do projeto, escolha o objetivo nas propriedades da solicitação. Elas não contribuem para o progresso ou o ritmo dos tickets. A conversão herda o objetivo e as categorias, respeitando as alterações no formulário de criação.
