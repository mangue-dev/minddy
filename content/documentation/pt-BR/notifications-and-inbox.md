---
{
  "id": "notifications-and-inbox",
  "locale": "pt-BR",
  "title": "Caixa de entrada e notificações",
  "summary": "Revise atividade não lida e menções, depois ajuste as preferências de notificação da conta.",
  "topic": "Planejar e encontrar trabalho",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Acompanhar notificações e convites na caixa de entrada"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/work-inbox.png",
      "alt": "Caixa de entrada com menções, atribuições e comentários de demonstração, lidos e não lidos.",
      "caption": "A atividade de exemplo mostra o autor, o ticket e o estado de leitura. Todos inclui notificações lidas e não lidas.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Ler a caixa de entrada {#notifications-and-inbox}

Abra a caixa de entrada pelo ícone na barra superior, pela linha dela na barra lateral no celular ou pressionando G e depois I fora de um campo de texto. Um contador vermelho no ícone soma as notificações não lidas e os convites pendentes; um PWA instalado mostra o mesmo número no ícone do aplicativo. A caixa de entrada abre em um popover, ou em uma folha no celular, e agrupa as notificações em Hoje, Ontem e Anteriormente.

Ela abre no filtro Não lidos. Todos mostra também as notificações lidas, e Menções mantém apenas as menções em comentários e páginas. Selecione um item para abrir o problema, a página ou o pull request correspondente. Abrir uma notificação marca-a como lida. A linha também oferece Marcar como lido ou Marcar como não lido, e Marcar tudo como lido, no cabeçalho da caixa de entrada, remove todos os indicadores de não lido. Marcar como não lida muda apenas o indicador: não desfaz a alteração no problema ou na página. Abra o conteúdo vinculado para consultar seu estado atual.

Excluir, em uma linha, remove essa notificação após uma confirmação, e Excluir leitura, no cabeçalho, remove todas as notificações lidas após uma confirmação. As duas exclusões são definitivas; as notificações não lidas permanecem, e o problema, a página ou o pull request para o qual uma notificação aponta não é afetado.

Convites pendentes para projetos aparecem em Convites nos filtros Não lidos e Todos. Aceite ou recuse depois de conferir o projeto e quem convidou você. Links antigos abrem o ponto de acesso atual, não uma página separada.

![Caixa de entrada com menções, atribuições e comentários de demonstração, lidos e não lidos.](/documentation/pt-BR/work-inbox.png)

## Escolher canais de notificação {#notification-preferences}

Escolha Configurações da caixa de entrada no cabeçalho da caixa de entrada, ou abra Configurações da conta e a aba Notificações. Em Notificações na caixa de entrada, um interruptor por categoria (Tarefas, Menções, Comentários, Numo, Rotinas, Solicitações pull, Feedback e Páginas) decide o que chega à sua caixa de entrada. Desativar uma categoria interrompe as próximas notificações desse tipo, incluindo os alertas push; isso não remove as notificações já recebidas.

A seção Notificações push na mesma aba lista os dispositivos que recebem alertas. A entrega pelo navegador, PWA ou desktop também exige registro do dispositivo e permissão do sistema operacional. Desativar ou remover um dispositivo interrompe os alertas apenas nesse dispositivo; sua caixa de entrada e suas categorias não mudam.

Se uma notificação levar a conteúdo indisponível, verifique se a participação no projeto mudou ou se o objeto foi excluído. Se notificações push não chegarem, confira permissão e registro na [seção sobre notificações do dispositivo](/pt-br/documentacao/applications#devices-and-notifications); a caixa de entrada continua útil para consultar a atividade. Nunca envie cookies de sessão ou conteúdo privado de notificações em capturas de tela para diagnóstico.
