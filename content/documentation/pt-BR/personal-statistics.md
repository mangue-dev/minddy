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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of personal-statistics-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Primeiro vem uma faixa de seis números: **Concluído**, **Tarefas marcadas**, **Criados**, **Projetos**, **Maior sequência** e **Sequência atual**. Ela substitui a antiga seção de totais de todo o período. Abaixo, consulte o número dos 12 meses e a grade de atividade, depois **Para onde foi seu trabalho**, com as divisões por projeto, categoria e objetivo, e **Ritmo de trabalho**, com **Carga de trabalho atual**, **Tickets por ciclo**, **Lacuna na data de entrega** e **Detalhamento por esforço**. **Tickets por ciclo**, **Lacuna na data de entrega** e **Detalhamento por esforço** só aparecem quando têm dados. A aba mostra os períodos configurados; não há filtro de datas para escolher outro intervalo. Ela resume seu trabalho, sem criar um ranking de desempenho dos outros membros.

Use a quantidade de tickets concluídos, o ritmo, os dias ativos, as sequências e as medições de tempo para examinar sua própria atividade. A grade de atividade conta eventos de conclusão de tickets e de tarefas do caderno, agrupados em dias de calendário no seu fuso horário. A grade nunca rola: ela mostra as semanas mais recentes que cabem na tela, então um celular mostra menos meses que um computador. Um dia ativo tem pelo menos um desses eventos; a sequência atual permite que hoje ainda esteja vazio, mas termina no próximo dia vazio. O número **Concluído** conta cada identificador apenas uma vez: mover o mesmo ticket para Concluído duas vezes ainda conta uma vez; portanto, a contagem de eventos e o total de tickets distintos respondem a perguntas diferentes. O número acima da grade soma os tickets e as tarefas do caderno que você concluiu nos últimos 12 meses; aponte para o número para ver a divisão em tickets, tarefas e dias ativos. Ele também conta cada ticket uma única vez nesses 12 meses: um ticket concluído de novo marca cada um dos seus dias na grade, mas soma um só ticket ao número.

O tempo por esforço é a mediana do tempo decorrido entre a primeira mudança registrada de um ticket para Em andamento e sua conclusão. São considerados tickets elegíveis em Concluído, atribuídos a você, com esforço e ambos os horários registrados. Esse tempo inclui a espera; não é um cronômetro de horas trabalhadas. A visualização **Contagem de tickets** mostra o tamanho da amostra usada. Uma mediana ausente pode indicar que não há medições elegíveis, não uma duração zero.

Leia a unidade e o período de cada seção antes de comparar os valores.

## Interpretar dados escassos ou mudanças {#statistics-limits}

Uma conta que ainda não criou nem concluiu nenhum ticket, nem marcou nenhuma tarefa do caderno, vê **Nada para medir ainda** no lugar dos números, com um botão **Novo ticket**, ou **Crie o primeiro projeto** quando não tem nenhum projeto em que criar um ticket. Um período vazio pode indicar que não há trabalho concluído correspondente ou que a atividade é insuficiente. Isso não prova que a conta não tem tickets. Mudanças nos rótulos de esforço, no escopo ou nos tipos de trabalho podem alterar a comparação sem provar que você ficou mais rápido ou mais lento.

O Numo pode consultar suas estatísticas com ferramentas somente de leitura e explicar os mesmos números. O acesso ao uso do plano e às execuções recentes também é somente de leitura: informar seu orçamento não o altera. Para um problema com custos de IA, abra as telas de uso e as configurações da conta em vez de mudar o esforço de um ticket para esconder a medição.


![Estatísticas do perfil com a faixa de números, a grade de atividade de 12 meses, as distribuições por projeto e categoria e o ritmo de trabalho.](/documentation/pt-BR/personal-statistics-workflow.png)
