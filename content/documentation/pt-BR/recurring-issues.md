---
{
  "id": "recurring-issues",
  "locale": "pt-BR",
  "title": "Repetir um problema depois de concluído",
  "summary": "Configure trabalho recorrente e diferencie-o de uma solicitação agendada ao Numo.",
  "topic": "Projetos e problemas",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/issue-date-recurrence.png",
      "alt": "Seletor de prazo no modo recorrente com prévia semanal aos domingos e horário opcional.",
      "caption": "O modo recorrente mostra a frequência semanal. Confirme o primeiro prazo antes de criar o ticket.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recurring-issues-steps"
  ]
}
---

## Configurar a tarefa repetida {#recurring-issues}

Crie ou abra um problema que continue útil a cada repetição, como uma verificação periódica de dependências. Defina um prazo, depois escolha uma recorrência diária, semanal, mensal ou anual no controle de data do problema. Uma recorrência sem prazo é rejeitada. Revise propriedades e responsável antes de salvar. As configurações de recorrências do projeto listam as séries ativas; use-as para mudar a frequência ou interromper a repetição.

Problemas recorrentes são recriados depois que o anterior fica “Concluído”; o próximo é criado no Backlog. Confira o identificador e as propriedades do próximo problema após concluir uma recorrência.

O próximo prazo é calculado somando um intervalo de recorrência ao prazo anterior, não a partir do dia em que você concluiu a tarefa. O sucessor copia título, descrição, prioridade, esforço, responsável, objetivo e categorias. Não copia o plano de implementação, a relação com o pai, os recursos nem os comentários. A recorrência passa para o sucessor; reabrir e concluir novamente o problema antigo não cria outra ocorrência. Se a criação do sucessor falhar, a série para em vez de tentar repetidamente a partir do problema concluído. Examine o resultado e configure a recorrência na próxima tarefa apropriada depois de resolver a falha. Não suponha que um calendário execute código ou conclua o novo problema por você.


![Seletor de prazo no modo recorrente com prévia semanal aos domingos e horário opcional.](/documentation/pt-BR/issue-date-recurrence.png)

## Mudar ou interromper a repetição {#recurrence-change}

Use as configurações de recorrência para editar ou desabilitar repetições futuras. Inspecione separadamente os problemas já criados: parar a criação futura não significa que o trabalho existente foi concluído ou removido.

Uma rotina do Numo é um objeto diferente: ela agenda uma conversa e pode usar o orçamento de IA do proprietário e os provedores configurados. Escolha problemas recorrentes para uma tarefa repetida acompanhável e uma rotina para uma instrução que precisa ser executada em um horário. Se o próximo problema não aparecer, confira se o anterior foi marcado como concluído, se a recorrência ainda está habilitada e se está vendo o Backlog sem filtros restritivos.
