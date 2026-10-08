---
{
  "id": "personal-statistics",
  "locale": "pt-BR",
  "title": "Estatísticas pessoais",
  "summary": "Compare atividade concluída e medidas de tempo dentro do escopo real.",
  "topic": "Planejar e encontrar trabalho",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Ler suas estatísticas pessoais de trabalho"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/reader-statistics.png",
      "alt": "Estatísticas pessoais com grade anual, distribuições, ritmo de trabalho e totais históricos.",
      "caption": "Esta conta de demonstração tem uma tarefa concluída e onze criadas. As estatísticas exibidas são reais; os nomes do projeto e do objetivo foram traduzidos para a ilustração.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1892,
        1996
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Abrir e ler as estatísticas {#personal-statistics}

Abra Estatísticas pela navegação da sua conta. Consulte a grade anual de atividade, as divisões por projeto, categoria e objetivo, a seção de ritmo e os totais de todo o período. A página mostra os períodos configurados; não há filtro de datas para escolher outro intervalo. Ela resume seu trabalho, sem criar um ranking de desempenho dos outros membros.

Use a quantidade de tickets concluídos, o ritmo, os dias ativos, as sequências e as medições de tempo para examinar sua própria atividade. A grade de atividade conta eventos de conclusão de problemas e de tarefas do caderno, agrupados em dias de calendário no seu fuso horário. Um dia ativo tem pelo menos um desses eventos; a sequência atual permite que hoje ainda esteja vazio, mas termina no próximo dia vazio. Os totais de problemas concluídos de todo o período contam cada identificador apenas uma vez; portanto, a contagem de eventos e o total de problemas distintos respondem a perguntas diferentes.

O tempo por esforço é a mediana do tempo decorrido entre a primeira mudança registrada de um problema para Em andamento e sua conclusão. São considerados problemas elegíveis em Concluído, atribuídos a você, com esforço e ambos os horários registrados. Esse tempo inclui a espera; não é um cronômetro de horas trabalhadas. A visualização de quantidade mostra o tamanho da amostra usada. Uma mediana ausente pode indicar que não há medições elegíveis, não uma duração zero. Leia a unidade e o período de cada seção antes de comparar os valores.

## Interpretar dados escassos ou mudanças {#statistics-limits}

Um período vazio pode indicar que não há trabalho concluído correspondente ou que a atividade é insuficiente. Isso não prova que a conta não tem tickets. Mudanças nos rótulos de esforço, no escopo ou nos tipos de trabalho podem alterar a comparação sem provar que você ficou mais rápido ou mais lento.

O Numo pode consultar suas estatísticas com ferramentas somente de leitura e explicar os mesmos números. O acesso ao uso do plano e às execuções recentes também é somente de leitura: informar seu orçamento não o altera. Para um problema com custos de IA, abra as telas de uso e as configurações da conta em vez de mudar o esforço de um ticket para esconder a medição.


![Estatísticas pessoais com grade anual, distribuições, ritmo de trabalho e totais históricos.](/documentation/pt-BR/reader-statistics.png)
