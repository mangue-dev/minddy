---
{
  "id": "desktop-app",
  "locale": "pt-BR",
  "title": "Instalar e gerenciar o app desktop",
  "summary": "Escolher pacote e instância e seguir a atualização correspondente.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A12"
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
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "install-the-pwa",
    "web-and-mobile",
    "devices-and-notifications",
    "import-issues"
  ],
  "aliases": [
    "desktop-and-speed"
  ],
  "tags": [],
  "figures": [
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/desktop-app-workflow.png",
      "alt": "Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado.",
      "caption": "Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado. A captura não valida versões assinadas nem outros sistemas operacionais.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "desktop-app-workflow"
  ]
}
---

## Instalar e escolher um servidor {#desktop-app}
Abra a página pública de downloads. No macOS, escolha o pacote para Apple silicon ou Intel. No Windows, instale o aplicativo pela Microsoft Store. No Linux, escolha uma AppImage ou um pacote deb/rpm assinado para x64 ou ARM64. Siga o guia da plataforma e as instruções de verificação do pacote. O Windows não oferece um instalador exe.

No seletor de servidor, escolha Minddy Cloud, a origem de um servidor self-hosted ou o runtime local disponível. Confira o destino antes de entrar: cada conta pertence à sua instância. O OAuth usa o navegador do sistema e retorna depois ao aplicativo desktop. Um runtime local não significa que o worker de código do Numo trabalhe no seu checkout local.

## Abas, fechamento e atualizações {#operation}
Use os controles de abas e a paleta de comandos para navegar entre seus trabalhos. Siga os atalhos exibidos para a plataforma: o macOS usa Command onde Windows e Linux normalmente usam Control. Fechar a janela a oculta e mantém o aplicativo em execução. Use Sair para encerrar o aplicativo; no macOS, você também pode usar Cmd+Q. As notificações em segundo plano dependem do pacote e das funções da plataforma.

O macOS e as AppImage portáteis oferecem atualizações no aplicativo. O Windows as instala pela Microsoft Store. Para deb/rpm, instale o próximo pacote verificado. As configurações desktop da conta mostram o servidor conectado e os controles disponíveis de atualização ou suporte. Após atualizar, confira a versão desktop exibida e confirme que a instância desejada continua abrindo.

![Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado.](/documentation/pt-BR/desktop-app-workflow.png)
