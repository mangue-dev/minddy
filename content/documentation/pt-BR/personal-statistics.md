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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (12-month headline deduplication: get_user_stats migration 20270109200067, lib/stats-derive.ts and a production read of one account (685 events, 603 distinct issues); no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: text revised from source review of components/settings/account-settings-page.tsx and components/stats/profile-statistics.tsx; figure personal-statistics-steps recaptured on 2026-10-19 in all six locales from the local candidate (now personal-statistics-workflow.png, demo history mirrored into the statistics ledger by captures/world/seed/018-statistiques.mjs) and inspected; the grid crops to the most recent weeks that fit; no other browser walkthrough); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the profile entry in components/app-sidebar.tsx and the /statistics redirect to the Profile tab; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (pt-BR headline deduplication sentence and retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (pt-BR translation of the account settings opening tab changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "src": "/documentation/pt-BR/personal-statistics-workflow.png",
      "alt": "Estatísticas do perfil com a faixa de números, a grade de atividade de 12 meses, as distribuições por projeto e categoria e o ritmo de trabalho.",
      "caption": "Histórico real da conta de demonstração: seis tickets concluídos em dois projetos, trinta tickets criados e nenhuma tarefa do caderno marcada.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        999
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Abrir e ler as estatísticas {#personal-statistics}

Suas estatísticas ficam na aba **Perfil** das configurações da conta. Escolha seu nome no topo do menu da conta para abri-la diretamente. **Configurações da conta** abre em **Preferências**; a partir daí, selecione **Perfil**, a primeira aba. As estatísticas aparecem abaixo do seu avatar, do seu nome e do seu email. O antigo endereço `/statistics` agora abre esta aba.

Primeiro vem uma faixa de seis números: **Concluído**, **Tarefas marcadas**, **Criados**, **Projetos**, **Maior sequência** e **Sequência atual**. Ela substitui a antiga seção de totais de todo o período. Abaixo, consulte o número dos 12 meses e a grade de atividade, depois **Para onde foi seu trabalho**, com as divisões por projeto, categoria e objetivo, e **Ritmo de trabalho**, com **Carga de trabalho atual**, **Problemas por ciclo**, **Lacuna na data de entrega** e **Detalhamento por esforço**. **Problemas por ciclo**, **Lacuna na data de entrega** e **Detalhamento por esforço** só aparecem quando têm dados. A aba mostra os períodos configurados; não há filtro de datas para escolher outro intervalo. Ela resume seu trabalho, sem criar um ranking de desempenho dos outros membros.

Use a quantidade de tickets concluídos, o ritmo, os dias ativos, as sequências e as medições de tempo para examinar sua própria atividade. A grade de atividade conta eventos de conclusão de problemas e de tarefas do caderno, agrupados em dias de calendário no seu fuso horário. A grade nunca rola: ela mostra as semanas mais recentes que cabem na tela, então um celular mostra menos meses que um computador. Um dia ativo tem pelo menos um desses eventos; a sequência atual permite que hoje ainda esteja vazio, mas termina no próximo dia vazio. O número **Concluído** conta cada identificador apenas uma vez: mover o mesmo problema para Concluído duas vezes ainda conta uma vez; portanto, a contagem de eventos e o total de problemas distintos respondem a perguntas diferentes. O número acima da grade também conta cada problema uma única vez nos seus 12 meses: um problema concluído de novo marca cada um dos seus dias na grade, mas soma um só problema ao número.

O tempo por esforço é a mediana do tempo decorrido entre a primeira mudança registrada de um problema para Em andamento e sua conclusão. São considerados problemas elegíveis em Concluído, atribuídos a você, com esforço e ambos os horários registrados. Esse tempo inclui a espera; não é um cronômetro de horas trabalhadas. A visualização **Contagem de problemas** mostra o tamanho da amostra usada. Uma mediana ausente pode indicar que não há medições elegíveis, não uma duração zero.

Leia a unidade e o período de cada seção antes de comparar os valores.

## Interpretar dados escassos ou mudanças {#statistics-limits}

Um período vazio pode indicar que não há trabalho concluído correspondente ou que a atividade é insuficiente. Isso não prova que a conta não tem tickets. Mudanças nos rótulos de esforço, no escopo ou nos tipos de trabalho podem alterar a comparação sem provar que você ficou mais rápido ou mais lento.

O Numo pode consultar suas estatísticas com ferramentas somente de leitura e explicar os mesmos números. O acesso ao uso do plano e às execuções recentes também é somente de leitura: informar seu orçamento não o altera. Para um problema com custos de IA, abra as telas de uso e as configurações da conta em vez de mudar o esforço de um ticket para esconder a medição.


![Estatísticas do perfil com a faixa de números, a grade de atividade de 12 meses, as distribuições por projeto e categoria e o ritmo de trabalho.](/documentation/pt-BR/personal-statistics-workflow.png)
