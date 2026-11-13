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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts",
      "lib/server/numo-notes.ts",
      "lib/notification-prefs.ts",
      "components/mobile-navigation.tsx",
      "components/inbox-row.tsx",
      "lib/notification-line.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of notifications-and-inbox-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-907 inbox button in the phone bottom bar with its dot: checked against components/mobile-navigation.tsx and components/app-shell-chrome.tsx; no browser walkthrough; existing figure kept); agent:claude-code (MIN-975: inbox redesign — view picker and More actions menu, actor/sentence/context rows with mention pills, no date groups, invitation buttons with confirmation, swipe actions on phones; source audit against the change; no browser walkthrough; work-inbox.png recaptured on 2026-11-13 from the local candidate (light, six locales, response-only demo notifications, no writes) and inspected)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR corrected passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 phone inbox entry point, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-975 passages, figure alt and caption with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "alt": "Caixa de entrada na visualização Todas com menções, atribuições e comentários de demonstração: cada linha diz quem agiu, o ticket como pílula e o título dele.",
      "caption": "Cada linha mostra quem agiu, o que aconteceu com o ticket e o título dele. Linhas lidas ficam esmaecidas; Todas lista as notificações lidas e não lidas.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Ler a caixa de entrada {#notifications-and-inbox}

Abra a caixa de entrada pelo ícone na barra superior, pelo botão dela na barra na parte inferior da tela no celular ou pressionando G e depois I fora de um campo de texto. Um contador vermelho no ícone soma as notificações não lidas e os convites pendentes, e no celular um ponto marca o botão dela; um PWA instalado mostra o mesmo número no ícone do aplicativo. A caixa de entrada abre em um popover, ou em uma folha no celular, e lista as notificações da mais recente para a mais antiga, cada uma com seu horário. Assim que você digita na paleta de comandos, ela também encontra notificações: escolher uma abre a caixa de entrada na visualização que a lista, Não lidas ou Todas, e a destaca sem marcá-la como lida.

Ela abre na visualização Não lidas. O seletor no topo muda para Todas, que mostra também as notificações lidas, ou para Menções, que mantém apenas as menções em comentários e páginas. Cada linha diz quem agiu (um membro, o Numo, o Smart Assign, um agente MCP, o quadro de feedback ou a forja), o que aconteceu com o ticket, a página, o pull request ou o projeto mostrado como pílula, e acrescenta contexto quando há, como o trecho do comentário ou o título do ticket. Selecione uma linha para abrir o ticket, a página ou o pull request dela. Abrir uma notificação marca-a como lida. No celular, deslize uma linha para a direita para marcá-la como lida ou não lida, ou para a esquerda para excluí-la. No computador, apontar para uma linha mostra Marcar como lida ou Marcar como não lida, e Marcar tudo como lido, no menu Mais ações ao lado do seletor, remove todos os indicadores de não lido. Marcar como não lida muda apenas o indicador: não desfaz a alteração no ticket ou na página. Abra o conteúdo vinculado para consultar seu estado atual.

O Numo também pode deixar uma mensagem para você: um título curto que cita o item em questão, com uma ou duas frases de contexto quando necessário, sobre algo que precisa da sua atenção, escrita por uma das suas rotinas ou em uma conversa em que você pediu um aviso para depois. Ela traz o ícone do Numo e, ao selecioná-la, abre o ticket, o objetivo, a página, a pull request ou a rotina de que trata, ou o projeto quando não cita nenhum. O Numo escreve essas mensagens só para você, nunca para outros membros, e envia a mesma mensagem sobre o mesmo item no máximo uma vez por dia.

Uma rotina avisa você por conta própria quando uma execução falha, esgota o orçamento ou não consegue iniciar. Uma execução que termina normalmente só chega a você como mensagem do Numo. Veja [Rotinas](/docs/scheduled-routines#runs).

Excluir, que aparece ao apontar para uma linha no computador, remove essa notificação após uma confirmação, e Excluir lidas, no menu Mais ações, remove todas as notificações lidas após uma confirmação. As duas exclusões são definitivas; as notificações não lidas permanecem, e o ticket, a página ou o pull request para o qual uma notificação aponta não é afetado.

Convites pendentes para projetos aparecem no topo das visualizações Não lidas e Todas, com os botões Rejeitar e Participar. Cada um pede uma confirmação: confira o projeto e quem convidou você antes de responder. Links antigos abrem o ponto de acesso atual, não uma página separada.

![Caixa de entrada na visualização Todas com menções, atribuições e comentários de demonstração: cada linha diz quem agiu, o ticket como pílula e o título dele.](/documentation/pt-BR/work-inbox.png)

## Escolher canais de notificação {#notification-preferences}

Escolha Configurações da caixa de entrada no menu Mais ações da caixa de entrada, ou abra Configurações da conta e a aba Notificações. Em Notificações na caixa de entrada, um interruptor por categoria (Atribuições, Menções, Comentários, Numo, Rotinas, Pull requests, Feedback, Páginas e Mensagens do Numo) decide o que chega à sua caixa de entrada. Desativar uma categoria interrompe as próximas notificações desse tipo, incluindo os alertas push; isso não remove as notificações já recebidas. Em uma instância self-hosted, os administradores também recebem uma notificação Variáveis da instância quando outro administrador altera uma variável da instância; nenhum interruptor a desativa. Veja [Editar as variáveis da instância](/docs/instance-administration#instance-variables).

A seção Notificações push na mesma aba lista os dispositivos que recebem alertas. A entrega pelo navegador, PWA ou desktop também exige registro do dispositivo e permissão do sistema operacional. Desativar ou remover um dispositivo interrompe os alertas apenas nesse dispositivo; sua caixa de entrada e suas categorias não mudam.

Se uma notificação levar a conteúdo indisponível, verifique se a participação no projeto mudou ou se o objeto foi excluído. Se notificações push não chegarem, confira permissão e registro na [seção sobre notificações do dispositivo](/pt-br/documentacao/applications#devices-and-notifications); a caixa de entrada continua útil para consultar a atividade. Nunca envie cookies de sessão ou conteúdo privado de notificações em capturas de tela para diagnóstico.
