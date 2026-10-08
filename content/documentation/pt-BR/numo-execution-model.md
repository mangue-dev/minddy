---
{
  "id": "numo-execution-model",
  "locale": "pt-BR",
  "title": "Entender turnos duráveis Numo e trabalho delegado",
  "summary": "Mensagens, ações e rotinas entram nas conversas do Numo.",
  "topic": "Conceitos técnicos",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/numo-execution-model-flow.svg",
      "alt": "Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.",
      "caption": "Siga as etapas nesta ordem. Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-execution-model-flow"
  ]
}
---

## Entender turnos duráveis Numo e trabalho delegado {#numo-execution-model}

Mensagens, ações e rotinas entram nas conversas do Numo. O modelo e o nível de raciocínio da conversa são escolhidos no campo de composição; o trabalho delegado de código usa os padrões da conta para modelo de código e nível de raciocínio. Ferramentas diretas não exigem repositório. Uma sandbox no servidor para o repositório conectado só é aberta quando o trabalho de código precisa dela. Uma rotina cria uma conversa nova com instruções e contexto do proprietário e do projeto. O desktop não precisa permanecer online.

![Diagrama: Persistir intenção, mensagem e UUID. Assumir turno, gravar ferramentas e resultados. Aguardar worker atual se necessário. Rever eventos e reconciliar escritas incertas.](/documentation/pt-BR/numo-execution-model-flow.svg)

## Separar execução e visualização {#state}

A intenção é registrada em um turno durável com UUID e mensagem. O turno passa de queued para running e depois para completed, waiting_input ou waiting_work. stopping e stopped indicam interrupção; retryable e failed indicam erro. O fluxo SSE mostra a atividade, mas não controla a execução. Após reconectar, o cliente lê os eventos posteriores à sequência já recebida. O término de um worker retoma apenas o turno pai da execução atual; avisos duplicados ou atrasados não iniciam outro trabalho. Contexto não concede acesso: objetos privados continuam privados.

## Tratar alterações incertas {#mutations}

Antes de uma alteração, o sistema registra a operação e seu checkpoint; ele reutiliza resultados já concluídos. Uma leitura interrompida pode ser repetida, enquanto uma alteração com resultado incerto entra em reconciling sem nova tentativa automática. Confira o destino antes de gravar novamente. As rotinas respeitam propriedade, orçamento e proteções de custo; outro membro não herda a conexão MCP pessoal anterior. Interromper o turno pai cancela a delegação, mas uma ação externa já enviada ainda pode terminar.
