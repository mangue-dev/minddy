---
{
  "id": "recover-numo-work",
  "locale": "pt-BR",
  "title": "Retomar trabalho do Numo interrompido ou pendente",
  "summary": "Identificar a causa e conferir resultados salvos antes de continuar.",
  "topic": "Numo e integrações",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/recover-numo-work-workflow.png",
      "alt": "Resposta do Numo informando código e testes locais, falha no envio do branch e nenhum pull request naquele momento.",
      "caption": "Resultado parcial inicial de uma execução real de demonstração, localizado para leitura. Naquele momento o envio falhou e não existia PR. Confira o branch salvo e os serviços externos antes de continuar; depois a conversa foi retomada e o PR foi corrigido.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recover-numo-work-workflow"
  ]
}
---

## Ler o estado da interrupção {#recover-numo-work}
Volte à conversa existente e leia as últimas mensagens e o cartão do worker. Diferencie perguntas aguardando resposta, limite da conta, teto da rotina, alocação da operação esgotada e falha técnica. Fechar o painel não comprova que o trabalho parou.

Em um cartão ativo, responda todas as perguntas obrigatórias e envie o conjunto. Cartões anteriores são registros e não aceitam outra resposta. Pular não fornece os dados ausentes nem autoriza alterações dependentes.

## Orçamento e falhas {#recovery}
O cartão de limite da conta mostra a data de redefinição do limite, quando conhecida, e pode oferecer plano ou chave pessoal. O da rotina leva à gestão: confira o teto por execução. A alocação corresponde àquela operação. Repetir o pedido não elimina o limite. Chaves pessoais não tornam gratuito o processamento da sandbox.

Só é possível retomar de um checkpoint se ele tiver sido preservado. Confira tarefas, branch, PR e serviços externos antes de repetir: uma gravação pode ter funcionado mesmo com a resposta perdida. Informe o que falta e peça para continuar. Sem checkpoint recuperável, forneça o estado verificado em um novo pedido. Ao relatar falhas persistentes, identifique a conversa sem incluir credenciais.

![Resposta do Numo informando código e testes locais, falha no envio do branch e nenhum pull request naquele momento.](/documentation/pt-BR/recover-numo-work-workflow.png)
