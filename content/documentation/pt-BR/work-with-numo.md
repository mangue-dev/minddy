---
{
  "id": "work-with-numo",
  "locale": "pt-BR",
  "title": "Concluir uma tarefa do projeto com o Numo",
  "summary": "Abrir uma conversa com contexto, escolher um modelo e conferir o resultado.",
  "topic": "Numo e integrações",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N01"
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "numo-permissions-and-approvals",
    "delegate-code-work",
    "recover-numo-work",
    "numo-mcp-connections",
    "external-minddy-mcp"
  ],
  "aliases": [
    "agents-and-mcp"
  ],
  "tags": [],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-with-numo-workflow.png",
      "alt": "Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.",
      "caption": "Conversa de demonstração existente, traduzida para exibição. A resposta salva cita AUR-11 e AUR-7; a captura não comprova uma nova execução.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow"
  ]
}
---

## Começar pelo trabalho {#work-with-numo}
Abra a tarefa ou o projeto e use o botão flutuante do Numo. A página atual vira contexto da conversa. As ações contextuais que passam trabalho ao Numo abrem o mesmo painel. Você precisa de acesso ao projeto e uso de IA disponível ou uma chave pessoal compatível.

1. Confira o contexto na área de mensagem. Identifique a tarefa quando houver vários itens relevantes.
2. Escolha o modelo e o nível de raciocínio da conversa. O worker de código usa padrões separados nas configurações da conta.
3. Envie um pedido delimitado, por exemplo: “Leia esta tarefa e proponha critérios de aceitação. Não altere o status”.
4. Leia a resposta e abra os links de tarefas ou fontes. Para uma alteração, confira o objeto atualizado.

![Conversa de demonstração Numo com contexto, mudança de prioridade e resposta salva.](/documentation/pt-BR/work-with-numo-workflow.png)


## Continuar ou delegar {#continue}
A lista mantém as conversas anteriores acessíveis. Continue a conversa com as decisões necessárias. Para alterações no repositório, o Numo delega a um worker em uma sandbox do servidor e mostra progresso, arquivos, verificações e pull request. Ele não trabalha na sua pasta local.

Se o Numo pedir informações, envie sua escolha antes de esperar a continuação das ações dependentes. Um cartão de consumo ou erro explica a interrupção. Confira qualquer gravação externa antes de pedir para repetir a ação.
