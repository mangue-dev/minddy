---
{
  "id": "triage-incoming-work",
  "locale": "pt-BR",
  "title": "Analisar trabalho recebido na triagem",
  "summary": "Esclareça novas solicitações antes de adicioná-las ao trabalho planejado.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/triage-incoming.png",
      "alt": "Problema recebido de demonstração DOC-11 com relato, propriedades e controles de duplicado, Recusar e Aceitar.",
      "caption": "Leia o relato recebido antes de aceitar, recusar ou vincular um duplicado.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Analisar as solicitações recebidas {#triage-incoming-work}

Abra o destino Triagem do projeto. Leia o problema recebido e o contexto de origem antes de aceitá-lo no trabalho planejado. Confira se um problema existente já representa a solicitação. Esclareça resultado esperado, projeto, responsável, prioridade e esforço conforme necessário.

Escolha Aceitar e confirme para mover ao Backlog um problema que pretende manter. Escolha Recusar e confirme para definir o estado Cancelada. Se for uma duplicata, use o seletor de duplicatas para escolher o problema que será mantido. O problema recebido assume o estado Duplicado e aponta para o escolhido. Quando um item sai da triagem, o seguinte é selecionado. Confira o estado resultante ou o link da duplicata no próprio problema. Passar de um cartão para outro sem realizar uma dessas ações não encerra o problema.

## Ordenação e limites {#triage-order}

O Smart Triage usa regras de ordenação determinísticas.

Dentro de cada coluna de estado, os problemas abertos que bloqueiam outro trabalho aberto ficam primeiro, antes dos problemas sem bloqueio. Problemas bloqueados por trabalho aberto ficam por último, mesmo que também bloqueiem outros. Pontas encerradas da relação deixam de gerar essa prioridade. Dentro de cada nível, prioridade maior, esforço menor e prazos vencidos ou próximos adiantam o trabalho. No mesmo nível de bloqueio, os problemas de um objetivo permanecem juntos, e o grupo é ordenado pelo seu problema mais bem posicionado. Os empates são resolvidos pelo prazo, pela data de criação mais antiga, pela posição manual e, por fim, pelo identificador, que mantém a ordem estável. Uma relação de vínculo não afeta essa ordenação. Ele não é um modo experimental de triagem com IA. A ordem ajuda a decidir quais itens analisar primeiro; ela não comprova a veracidade de uma descrição, não resolve duplicatas automaticamente nem concede permissões.

Se o item esperado não aparecer, confira projeto ativo, estado e filtros, depois pesquise seu identificador. Trabalho importado ou sincronizado externamente pode entrar na triagem; inspecione a origem e o mapeamento da integração antes de alterar campos sincronizados. Uma solicitação vinculada pelo feedback continua sendo um objeto de feedback distinto com sua própria discussão pública.


![Problema recebido de demonstração DOC-11 com relato, propriedades e controles de duplicado, Recusar e Aceitar.](/documentation/pt-BR/triage-incoming.png)
