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
  "revision": 5,
  "sourceRevision": 5,
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
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
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
      "revision": 5,
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

Abra a caixa de entrada pela navegação. Ela é um popover que agrupa notificações por data e oferece filtros de não lidas, todas e menções. Selecione um item para inspecionar o problema ou a página correspondente e confira o estado de leitura. Abrir uma notificação marca-a como lida. Sua linha também oferece controles para marcar como lida ou não lida, e o popover permite marcar todas as notificações como lidas. Marcar como não lida restaura esse indicador de atividade; não desfaz a alteração no problema ou na página. Uma notificação aponta para trabalho acessível, não substitui seu conteúdo atual.

Convites pendentes para projetos também aparecem na caixa de entrada. Aceite ou recuse depois de conferir projeto e conta. Links antigos abrem o ponto de acesso atual, não uma página separada.

![Caixa de entrada com menções, atribuições e comentários de demonstração, lidos e não lidos.](/documentation/pt-BR/work-inbox.png)

## Escolher canais de notificação {#notification-preferences}

Abra as preferências de notificação da conta para ajustar a atividade recebida. A entrega pelo navegador, PWA ou desktop também exige registro do dispositivo e permissão do sistema operacional. Desabilitar um canal do dispositivo é diferente de mudar os filtros de atividade dentro da aplicação.

Se uma notificação levar a conteúdo indisponível, verifique se a participação no projeto mudou ou se o objeto foi excluído. Se notificações push não chegarem, confira permissão e registro do dispositivo pelo guia correspondente; a caixa de entrada continua útil para consultar a atividade. Nunca envie cookies de sessão ou conteúdo privado de notificações em capturas de tela para diagnóstico.
