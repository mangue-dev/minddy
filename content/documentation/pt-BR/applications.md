---
{
  "id": "applications",
  "locale": "pt-BR",
  "title": "Aplicativos web, móveis e desktop",
  "summary": "Use o minddy no navegador, instale o app web no celular ou tablet ou o app desktop e configure as notificações do dispositivo.",
  "topic": "Conta e aplicativos",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A10",
    "A11",
    "A12",
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "content/documentation/reviews/push-registration-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications"
  ],
  "tags": [
    "Trabalhar no navegador e no celular",
    "Instalar o app web no celular ou tablet",
    "Instalar e gerenciar o app desktop",
    "Ativar notificações em um dispositivo"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/web-and-mobile-workflow.png",
      "alt": "Painel móvel de uma tarefa com título, descrição, propriedades e campo de comentário.",
      "caption": "Em uma tela estreita, os detalhes da tarefa ocupam um painel adaptável. Use o botão de fechar para voltar ao projeto; Numo continua acessível pelo botão flutuante.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        438,
        968
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-the-pwa-workflow.png",
      "alt": "Guia ilustrado de instalação pelo Safari no minddy: Compartilhar, adicionar à Tela de Início e confirmar.",
      "caption": "O guia público ilustra as três etapas do Safari e a opção Abrir como App da Web que deve permanecer ativada. São ilustrações de instruções exibidas pelo minddy, não capturas de uma instalação do iOS concluída.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1488,
        736
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/desktop-app-workflow.png",
      "alt": "Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado.",
      "caption": "Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado. A captura não valida versões assinadas nem outros sistemas operacionais.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        287
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/devices-and-notifications-workflow.png",
      "alt": "Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.",
      "caption": "Este navegador bloqueia notificações. Restaure a permissão do site antes de registrar este dispositivo.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/devices-and-notifications-registered.png",
      "alt": "Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.",
      "caption": "A conta tem um dispositivo de navegador registrado e ativo. A lista mostra as datas de registro e do último envio. A exibição de um alerta continua dependendo da permissão do navegador e das configurações do sistema operacional.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "desktop-app-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

Você pode acessar a mesma instância minddy pelo navegador, pelo app web instalado ou pelo app desktop. Siga o procedimento do seu dispositivo e confira os requisitos de conexão, as atualizações e as permissões de notificação da plataforma.

## Trabalhar no navegador e no celular {#web-and-mobile}

Abra o endereço da sua instância e entre nessa mesma instância. Em uma tela estreita, mostre a barra lateral para escolher um projeto e abra uma tarefa pela lista ou pelo quadro. Leia os detalhes no painel adaptado à tela, altere o campo desejado ou adicione um comentário e aguarde o resultado do salvamento antes de fechar. Feche o painel de detalhes para voltar à lista; sua apresentação no celular difere da de uma tela ampla.

Abra o Numo pelo botão flutuante ou por uma ação contextual da tarefa. Confira o contexto da tarefa no campo de composição. Se outro painel cobrir o conteúdo necessário, feche-o antes de continuar navegando. Em dispositivos de toque, use os botões e menus visíveis; não presuma que ações ao passar o mouse ou atalhos de desktop estejam disponíveis.

### Teclado e conexão {#access}

Com o teclado, você pode focar os controles e usar a paleta de comandos para navegar e executar ações comuns. O botão de envio visível continua sendo uma alternativa ao envio por teclado. Siga o atalho mostrado pela aplicação para a sua plataforma.

O navegador e o aplicativo web instalado precisam de conexão de rede para consultar dados dos projetos e salvar alterações. O service worker gerencia notificações push sem implementar um cache de dados offline. Após uma falha de conexão, confira se a alteração foi salva antes de repeti-la. Instalar a PWA não cria outra conta nem contorna as permissões da instância.

![Painel móvel de uma tarefa com título, descrição, propriedades e campo de comentário.](/documentation/pt-BR/web-and-mobile-workflow.png)

## Instalar o app web no celular ou tablet {#install-the-pwa}

Abra a instância minddy que deseja usar no Safari em um iPhone ou iPad, ou no Chrome ou em outro navegador Android compatível. Se o link tiver aberto dentro de outro aplicativo, abra-o primeiro no navegador completo. Para uma instância self-hosted, use o endereço do seu próprio servidor.

No iOS, abra Compartilhar e escolha Adicionar à Tela de Início. Mantenha Abrir como App da Web ativado e toque em Adicionar. Dependendo da interface do Safari, pode ser necessário abrir Mais antes de Compartilhar. Se a ação não aparecer, confira Editar Ações.

No Android, use a sugestão de instalação ou escolha Instalar app ou Adicionar à tela inicial no menu do navegador e confirme Instalar. Os nomes dependem do navegador. Abra o novo ícone e entre com a conta daquela instância. Trata-se de uma PWA instalada pelo navegador; não existe um aplicativo nativo minddy na App Store do iOS nem no Google Play.

### Atualizações, acesso offline e notificações {#operation}

A instalação não cria uma cópia offline do projeto. O service worker do minddy só gerencia notificações push e não armazena as requisições do aplicativo em cache. Use uma conexão de rede e recarregue a página para obter o conteúdo web atual. As notificações também exigem um navegador compatível, sua permissão e a configuração push no servidor. No iOS, use o aplicativo instalado quando o processo solicitar. Se a opção de instalação não aparecer, abra um navegador completo compatível e confira se a instância já está instalada.

![Guia ilustrado de instalação pelo Safari no minddy: Compartilhar, adicionar à Tela de Início e confirmar.](/documentation/pt-BR/install-the-pwa-workflow.png)

## Instalar e gerenciar o app desktop {#desktop-app}

Abra a página pública de downloads. No macOS, escolha o pacote para Apple silicon ou Intel. No Windows, instale o aplicativo pela Microsoft Store. No Linux, escolha uma AppImage ou um pacote `deb`/`rpm` assinado para x64 ou ARM64. Siga o guia da plataforma e as instruções de verificação do pacote. O Windows não oferece um instalador `exe`.

No seletor de servidor, escolha minddy Cloud, a origem de um servidor self-hosted ou o runtime local disponível. Confira o destino antes de entrar: cada conta pertence à sua instância. O OAuth usa o navegador do sistema e retorna depois ao aplicativo desktop. Um runtime local não significa que o worker de código do Numo trabalhe no seu checkout local.

### Abas, fechamento e atualizações {#desktop-app-operation}

Use os controles de abas e a paleta de comandos para navegar entre seus trabalhos. Siga os atalhos exibidos para a plataforma: o macOS usa Command onde Windows e Linux normalmente usam Control. Fechar a janela a oculta e mantém o aplicativo em execução. Use Sair para encerrar o aplicativo; no macOS, você também pode usar Cmd+Q. As notificações em segundo plano dependem do pacote e das funções da plataforma.

O macOS e as AppImage portáteis oferecem atualizações no aplicativo. O Windows as instala pela Microsoft Store. Para `deb`/`rpm`, instale o próximo pacote verificado. As configurações desktop da conta mostram o servidor conectado e os controles disponíveis de atualização ou suporte. Após atualizar, confira a versão desktop exibida e confirme que a instância desejada continua abrindo.

![Configurações de desktop no aplicativo real de desenvolvimento Electron para macOS, versão 0.11.1, conectado ao servidor local com um perfil isolado.](/documentation/pt-BR/desktop-app-workflow.png)

## Ativar notificações em um dispositivo {#devices-and-notifications}

Abra as notificações nas configurações da conta no dispositivo que deseja registrar. Ative-as e aceite a solicitação de permissão do navegador ou do sistema operacional. Se a permissão foi negada, altere-a nas configurações do navegador ou do sistema; acionar o controle do minddy repetidamente não pode superar essa recusa. No iOS, instale e abra o aplicativo web primeiro quando a interface exigir.

Confira se o dispositivo aparece na lista e use o controle de teste correspondente. Consulte as informações da última entrega. Você pode desativar ou remover registros individuais sem excluir a conta. As preferências da caixa de entrada determinam quais eventos geram notificações; a caixa de entrada do aplicativo continua disponível quando o push não está disponível.

![Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.](/documentation/pt-BR/devices-and-notifications-workflow.png)

### Condições por plataforma {#platforms}

O push web exige um navegador compatível e o serviço de push configurado na instância. Os banners nativos e a entrega em segundo plano variam conforme a plataforma. O pacote macOS assinado oferece suporte a APNs; o pacote Windows precisa do componente WNS opcional para o transporte em segundo plano. No Linux, a entrega utiliza a sessão em segundo plano do aplicativo distribuído, em vez de APNs ou WNS.

Confira a permissão de notificações no sistema, o estado de instalação no navegador e a explicação exibida caso o recurso não esteja configurado ou não seja compatível. Um teste bem-sucedido não garante a entrega sem conexão ou sob todas as restrições de segundo plano do sistema. Mantenha disponível o aplicativo ou o serviço em segundo plano configurado, conforme os requisitos da plataforma.

![Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.](/documentation/pt-BR/devices-and-notifications-registered.png)
