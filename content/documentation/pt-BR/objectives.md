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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "alt": "Janela de criação de objetivo não enviada com um nome de resultado de exemplo.",
      "caption": "Defina o resultado antes de escolher responsável, data prevista e status. Essa janela não criou um segundo objetivo.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        330
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-objective-momentum.png",
      "alt": "Ritmo do objetivo após a conclusão real de um ticket de demonstração.",
      "caption": "Leia o ritmo junto ao trabalho vinculado. O histórico disponível ainda não é suficiente para mostrar uma data estimada de conclusão.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps",
    "objective-dependencies-and-momentum-steps"
  ]
}
---

Um objetivo reúne os problemas de um projeto para acompanhar um resultado. Suas dependências mostram os impedimentos, enquanto o progresso e o ritmo ajudam a interpretar o trabalho vinculado. Esses indicadores não substituem a verificação do resultado nem garantem uma data de entrega.

## Acompanhar um resultado com um objetivo {#objectives}

Abra o destino de objetivos do projeto e crie um objetivo. Dê um nome ao resultado desejado, acrescente contexto útil e defina os campos disponíveis de responsável, data-alvo, cor e estado. Um objetivo pertence a um projeto e é diferente de um ciclo pessoal que abrange vários projetos. A pessoa responsável acompanha o resultado; escolhê-la não transfere a propriedade do projeto.

Abra cada problema relevante e escolha o objetivo nas propriedades, ou use os controles de problemas do objetivo. Confira se o trabalho desejado aparece sob o objetivo. Use a discussão e os recursos para decisões e páginas de referência que se apliquem ao resultado inteiro.

![Janela de criação de objetivo não enviada com um nome de resultado de exemplo.](/documentation/pt-BR/reader-objectives.png)

### Ler o progresso antes de encerrar {#objective-progress}

Revise problemas concluídos e ativos junto com o progresso do objetivo. Um indicador resume o trabalho vinculado; ele não determina se um resultado de produto é aceitável. Inspecione tarefas ausentes e trabalho cancelado ou duplicado antes de marcar o objetivo como concluído.

Use o ciclo de vida do objetivo para distinguir resultados planejados, em andamento, concluídos e cancelados. Uma data-alvo é uma meta, enquanto uma previsão é uma estimativa baseada na atividade. Se o objetivo parecer vazio, confira a associação dos problemas e os filtros da visualização em vez de recriá-lo. A exclusão de um objetivo usa a lixeira recuperável e não é uma mudança de estado comum.

## Interpretar dependências e ritmo dos objetivos {#objective-dependencies-and-momentum}

Abra o objetivo e suas relações. Confira qual resultado depende de outro e leia as relações de bloqueio entre problemas quando explicarem a restrição. A organização entre pai e filho, um vínculo relacionado e uma dependência de bloqueio respondem a perguntas diferentes; confira a direção antes de mudar uma relação.

Uma relação de bloqueio pode conectar um problema ou outro objetivo a este objetivo, dentro do mesmo projeto. Seus problemas abertos herdam o bloqueio não resolvido: a relação exibida identifica tanto o pré-requisito real quanto o objetivo que o transmite. Não é salva uma nova relação direta em cada problema. Encerrar o pré-requisito ou o objetivo bloqueado, ou retirar um problema desse objetivo, elimina o bloqueio herdado correspondente. Resolva o pré-requisito real ou corrija uma relação obsoleta. Mudar apenas a data-alvo de um objetivo não conclui os problemas que o bloqueiam.

### Interpretar o sinal de ritmo {#momentum}

O ritmo resume trabalho concluído recentemente. Ele pode estar acelerando, estável, desacelerando ou parado, com estados separados para objetivos não iniciados, concluídos e cancelados. Use-o para identificar um resultado que precisa de atenção, depois leia os problemas e a atividade subjacentes.

A data estimada de conclusão exige pelo menos duas conclusões, uma semana inteira observada, esforço entregue positivo e trabalho restante. Apenas os problemas atualmente vinculados contribuem; uma conclusão anterior à criação do objetivo não produz um ritmo recente artificial. Com uma data-alvo válida, o histórico vai da criação até essa data e o ritmo de entrega usa o tempo observado desde a criação, incluindo o período depois de um prazo não cumprido. Sem uma data-alvo válida, o cálculo usa um histórico móvel de oito semanas e uma janela de previsão de 28 dias. Histórico escasso ou mudança recente de escopo reduzem sua utilidade. A estimativa não é um prazo prometido e não inclui trabalho invisível que você não vinculou. Compare a data-alvo, o trabalho restante e as restrições reais antes de mudar compromissos.

![Ritmo do objetivo após a conclusão real de um ticket de demonstração.](/documentation/pt-BR/reader-objective-momentum.png)
