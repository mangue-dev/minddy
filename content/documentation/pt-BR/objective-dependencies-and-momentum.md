---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "pt-BR",
  "title": "Interpretar dependências e ritmo dos objetivos",
  "summary": "Leia bloqueios e sinais de atividade sem tratar estimativas como garantias de entrega.",
  "topic": "Projetos e problemas",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-objective-momentum.png",
      "alt": "Ritmo do objetivo após a conclusão real de um ticket de demonstração.",
      "caption": "Leia o ritmo junto ao trabalho vinculado. O histórico disponível ainda não é suficiente para mostrar uma data estimada de conclusão.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Inspecionar relações e bloqueios {#objective-dependencies-and-momentum}

Abra o objetivo e suas relações. Confira qual resultado depende de outro e leia as relações de bloqueio entre problemas quando explicarem a restrição. A organização entre pai e filho, um vínculo relacionado e uma dependência de bloqueio respondem a perguntas diferentes; confira a direção antes de mudar uma relação.

Uma relação de bloqueio pode conectar um problema ou outro objetivo a este objetivo, dentro do mesmo projeto. Seus problemas abertos herdam o bloqueio não resolvido: a relação exibida identifica tanto o pré-requisito real quanto o objetivo que o transmite. Não é salva uma nova relação direta em cada problema. Encerrar o pré-requisito ou o objetivo bloqueado, ou retirar um problema desse objetivo, elimina o bloqueio herdado correspondente. Resolva o pré-requisito real ou corrija uma relação obsoleta. Mudar apenas a data-alvo de um objetivo não conclui os problemas que o bloqueiam.

## Interpretar o sinal de ritmo {#momentum}

O ritmo resume trabalho concluído recentemente. Ele pode estar acelerando, estável, desacelerando ou parado, com estados separados para objetivos não iniciados, concluídos e cancelados. Use-o para identificar um resultado que precisa de atenção, depois leia os problemas e a atividade subjacentes.

A data estimada de conclusão exige pelo menos duas conclusões, uma semana inteira observada, esforço entregue positivo e trabalho restante. Apenas os problemas atualmente vinculados contribuem; uma conclusão anterior à criação do objetivo não produz um ritmo recente artificial. Com uma data-alvo válida, o histórico vai da criação até essa data e o ritmo de entrega usa o tempo observado desde a criação, incluindo o período depois de um prazo não cumprido. Sem uma data-alvo válida, o cálculo usa um histórico móvel de oito semanas e uma janela de previsão de 28 dias. Histórico escasso ou mudança recente de escopo reduzem sua utilidade. A estimativa não é um prazo prometido e não inclui trabalho invisível que você não vinculou. Compare a data-alvo, o trabalho restante e as restrições reais antes de mudar compromissos.

![Ritmo do objetivo após a conclusão real de um ticket de demonstração.](/documentation/pt-BR/reader-objective-momentum.png)
