---
{
  "id": "objectives",
  "locale": "pt-BR",
  "title": "Objetivos",
  "summary": "Defina o resultado de um projeto, vincule o trabalho e interprete o progresso, as dependências e o ritmo.",
  "topic": "Projetos e problemas",
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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-693 project roles; MIN-728 one editor engine; MIN-736 closed columns hidden by default; MIN-741 creation dialogs",
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
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "content/documentation/reviews/min-728-one-editor-engine.md",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "content/documentation/reviews/min-741-creation-dialogs.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained); agent:/root (UI refinements source and control review; unchanged procedural evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-736 objective board status filter: source review of the project page and objective header; no browser walkthrough, no new captures); agent:/root (MIN-741 creation dialogs: source and unit-test review of the Create in project control, the cleared lead and relations and the Create objective button; objectives-steps recaptured on 2026-10-19 in all six locales from the local candidate (documentation-product screen reader-objectives) and inspected; no other browser walkthrough)",
    "language": "agent:/root (pt-BR changed-passage review against English revision 7; earlier unchanged prose reviews retained); agent:/root (MIN-670 source, pt-BR wording and new-control review; existing procedural evidence retained); agent:/root (pt-BR changed-passage parity and localized-label review); agent:/root/min693_pt-BR with agent:/root (pt-BR MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (pt-BR translation of the MIN-728 passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR MIN-736 added sentence with catalog status labels; agent review, not human acceptance); agent:/root (pt-BR MIN-741 Create in passages and figure alt text with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        720,
        358
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Um objetivo reúne os problemas de um projeto para acompanhar um resultado. Suas dependências mostram os impedimentos, enquanto o progresso e o ritmo ajudam a interpretar o trabalho vinculado. Esses indicadores não substituem a verificação do resultado nem garantem uma data de entrega.

## Acompanhar um resultado com um objetivo {#objectives}

Abra o destino de objetivos do projeto e crie um objetivo. Ao criá-lo em outro lugar do aplicativo, escolha o projeto em **Criar em**, no canto superior esquerdo do formulário (ao lado do título **Novo objetivo** no celular); trocar de projeto remove o responsável e as relações escolhidos para o anterior. Dê um nome ao resultado desejado, acrescente contexto útil e defina os campos disponíveis de responsável, data-alvo, cor e estado. Um objetivo pertence a um projeto e é diferente de um ciclo pessoal que abrange vários projetos. A pessoa responsável acompanha o resultado; escolhê-la não transfere a propriedade do projeto. Só o proprietário ou um Membro pode ser responsável por um objetivo, e um responsável cujo papel muda para Leitor é removido dele.

A descrição do objetivo e seus comentários usam o mesmo editor das páginas do projeto, sem as alças de bloco: digite `/` para inserir blocos e `@` para mencionar uma pessoa, um problema, um objetivo ou uma página. Várias pessoas podem editar a descrição ao mesmo tempo, com o cursor de cada uma exibido com seu nome e sua cor. Selecione um texto para formatá-lo ou adicionar um link, e cole ou solte uma imagem para inseri-la na descrição.

Abra cada problema relevante e escolha o objetivo nas propriedades, ou use os controles de problemas do objetivo. Confira se o trabalho desejado aparece sob o objetivo. Use a discussão e os recursos para decisões e páginas de referência que se apliquem ao resultado inteiro.

![Janela de criação de objetivo não enviada no projeto Aurora com um nome de resultado de exemplo e o botão Criar objetivo.](/documentation/pt-BR/reader-objectives.png)

### Ler o progresso antes de encerrar {#objective-progress}

Revise problemas concluídos e ativos junto com o progresso do objetivo. Um indicador resume o trabalho vinculado; ele não determina se um resultado de produto é aceitável. Inspecione tarefas ausentes e trabalho cancelado ou duplicado antes de marcar o objetivo como concluído. O quadro do objetivo mostra primeiro o trabalho aberto: selecione **Concluído** e **Cancelada** no filtro **Status** dele para revisar ali os problemas fechados.

Use o ciclo de vida do objetivo para distinguir resultados planejados, em andamento, concluídos e cancelados. Uma data-alvo é uma meta, enquanto uma previsão é uma estimativa baseada na atividade. Se o objetivo parecer vazio, confira a associação dos problemas e os filtros da visualização em vez de recriá-lo. A exclusão de um objetivo usa a lixeira recuperável e não é uma mudança de estado comum.

## Interpretar dependências e ritmo dos objetivos {#objective-dependencies-and-momentum}

Abra o objetivo e suas relações. Confira qual resultado depende de outro e leia as relações de bloqueio entre problemas quando explicarem a restrição. A organização entre pai e filho, um vínculo relacionado e uma dependência de bloqueio respondem a perguntas diferentes; confira a direção antes de mudar uma relação.

Uma relação de bloqueio pode conectar um problema ou outro objetivo a este objetivo, dentro do mesmo projeto. Seus problemas abertos herdam o bloqueio não resolvido: a relação exibida identifica tanto o pré-requisito real quanto o objetivo que o transmite. Não é salva uma nova relação direta em cada problema. Encerrar o pré-requisito ou o objetivo bloqueado, ou retirar um problema desse objetivo, elimina o bloqueio herdado correspondente. Resolva o pré-requisito real ou corrija uma relação obsoleta. Mudar apenas a data-alvo de um objetivo não conclui os problemas que o bloqueiam.

### Interpretar o sinal de ritmo {#momentum}

O painel Ritmo aparece apenas quando o objetivo tem uma data-alvo. Ao remover essa data, o painel fica oculto, incluindo o histórico, as estatísticas de ritmo e a data estimada de conclusão. Adicione uma data-alvo para exibi-lo novamente; o indicador de progresso geral continua disponível sem ela.

O ritmo resume trabalho concluído recentemente. Ele pode estar acelerando, estável, desacelerando ou parado, com estados separados para objetivos não iniciados, concluídos e cancelados. Use-o para identificar um resultado que precisa de atenção, depois leia os problemas e a atividade subjacentes.

A data estimada de conclusão exige pelo menos duas conclusões, uma semana inteira observada, esforço entregue positivo e trabalho restante. Apenas os problemas atualmente vinculados contribuem; uma conclusão anterior à criação do objetivo não produz um ritmo recente artificial.

Com uma data-alvo válida, o histórico vai da criação até essa data e o ritmo de entrega usa o tempo observado desde a criação, incluindo o período depois de um prazo não cumprido. Se uma data-alvo estiver definida, mas não determinar um período válido após a criação, o cálculo usa um histórico móvel de oito semanas e uma janela de previsão de 28 dias.

Histórico escasso ou mudança recente de escopo reduzem sua utilidade. A estimativa não é um prazo prometido e não inclui trabalho invisível que você não vinculou. Compare a data-alvo, o trabalho restante e as restrições reais antes de mudar compromissos.


## Escolher um objetivo para um feedback {#objective-feedback}

Nas propriedades do objetivo, a contagem de feedbacks abre a seção Feedback do projeto filtrada por esse objetivo, incluindo solicitações resolvidas. O valor zero também é exibido. As solicitações continuam separadas do progresso dos tickets e do ritmo.

Um feedback pode pertencer a um objetivo sem virar um ticket. Nos feedbacks do projeto, escolha o objetivo nas propriedades da solicitação. Elas não contribuem para o progresso ou o ritmo dos tickets. A conversão herda o objetivo e as categorias, respeitando as alterações no formulário de criação.
