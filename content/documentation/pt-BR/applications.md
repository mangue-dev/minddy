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
  "revision": 17,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "lib/query-snapshot-budget.ts",
      "lib/query-persistence.ts",
      "lib/desktop/renderer-recovery.ts",
      "desktop/src/main.ts",
      "lib/query-retention.ts",
      "lib/pull-request-tab-labels.ts",
      "lib/desktop/window-stall-recovery.ts",
      "lib/desktop/local-recovery-load.ts",
      "scripts/desktop-renderer-hang.integration.mjs",
      "lib/use-desktop-notifications.ts",
      "lib/use-desktop-notifications.test.ts",
      "lib/query-provider.tsx",
      "lib/navigation-working-set.ts",
      "lib/query-storage-writes.test.ts",
      "lib/local-snapshot-security.test.ts",
      "components/settings/account-settings-page.tsx",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; 3 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of web-and-mobile-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, desktop/src/main.ts, desktop/src/menu.ts and lib/desktop/server-choice.ts; no desktop walkthrough, no screenshot recaptured)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (pt-BR MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-781 translation on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "alt": "Painel móvel de um ticket com título, descrição, propriedades e campo de comentário.",
      "caption": "Em uma tela estreita, os detalhes do ticket ocupam um painel adaptável. Use o botão de fechar para voltar ao projeto; Numo continua acessível pelo botão flutuante.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        438,
        1032
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        736
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/devices-and-notifications-workflow.png",
      "alt": "Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.",
      "caption": "Este navegador bloqueia notificações. Restaure a permissão do site antes de registrar este dispositivo.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-renderer-recovery",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/desktop-renderer-recovery.png",
      "alt": "Página local de recuperação após uma falha forçada do processo de renderização, com os controles Reload window e Check server settings.",
      "caption": "Página de recuperação no aplicativo de desenvolvimento para macOS, com um perfil isolado e um servidor de demonstração. A interface nativa usa rótulos em inglês em todos os idiomas.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        1280,
        860
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Você pode acessar a mesma instância minddy pelo navegador, pelo app web instalado ou pelo app desktop. Siga o procedimento do seu dispositivo e confira os requisitos de conexão, as atualizações e as permissões de notificação da plataforma.

## Trabalhar no navegador e no celular {#web-and-mobile}

Abra o endereço da sua instância e entre nessa mesma instância. Em uma tela estreita, mostre a barra lateral para escolher um projeto e abra um ticket pela lista ou pelo quadro. Leia os detalhes no painel adaptado à tela, altere o campo desejado ou adicione um comentário e aguarde o resultado do salvamento antes de fechar. Feche o painel de detalhes para voltar à lista; sua apresentação no celular difere da de uma tela ampla.

Abra o Numo pelo botão flutuante ou por uma ação contextual do ticket. Confira o contexto do ticket no campo de composição. Se outro painel cobrir o conteúdo necessário, feche-o antes de continuar navegando. Em dispositivos de toque, use os botões e menus visíveis; não presuma que ações ao passar o mouse ou atalhos de desktop estejam disponíveis.

### Teclado e conexão {#access}

Com o teclado, você pode focar os controles e usar a paleta de comandos para navegar e executar ações comuns. O botão de envio visível continua sendo uma alternativa ao envio por teclado. Siga o atalho mostrado pela aplicação para a sua plataforma.

O navegador e o aplicativo web instalado precisam de conexão de rede para consultar dados dos projetos e salvar alterações. O service worker gerencia notificações push sem implementar um cache de dados offline. Após uma falha de conexão, confira se a alteração foi salva antes de repeti-la. Instalar a PWA não cria outra conta nem contorna as permissões da instância.

![Painel móvel de um ticket com título, descrição, propriedades e campo de comentário.](/documentation/pt-BR/web-and-mobile-workflow.png)

## Instalar o app web no celular ou tablet {#install-the-pwa}

Abra a instância minddy que deseja usar no Safari em um iPhone ou iPad, ou no Chrome ou em outro navegador Android compatível. Se o link tiver aberto dentro de outro aplicativo, abra-o primeiro no navegador completo. Para uma instância self-hosted, use o endereço do seu próprio servidor.

No iOS, abra Compartilhar e escolha Adicionar à Tela de Início. Mantenha Abrir como App da Web ativado e toque em Adicionar. Dependendo da interface do Safari, pode ser necessário abrir Mais antes de Compartilhar. Se a ação não aparecer, confira Editar Ações.

No Android, use a sugestão de instalação ou escolha Instalar app ou Adicionar à tela inicial no menu do navegador e confirme Instalar. Os nomes dependem do navegador. Abra o novo ícone e entre com a conta daquela instância. Trata-se de uma PWA instalada pelo navegador; não existe um aplicativo nativo minddy na App Store do iOS nem no Google Play.

### Atualizações, acesso offline e notificações {#operation}

A instalação não cria uma cópia offline do projeto. O service worker do minddy só gerencia notificações push e não armazena as requisições do aplicativo em cache. Use uma conexão de rede e recarregue a página para obter o conteúdo web atual. As notificações também exigem um navegador compatível, sua permissão e a configuração push no servidor. No iOS, use o aplicativo instalado quando o processo solicitar. Se a opção de instalação não aparecer, abra um navegador completo compatível e confira se a instância já está instalada.

![Guia ilustrado de instalação pelo Safari no minddy: Compartilhar, adicionar à Tela de Início e confirmar.](/documentation/pt-BR/install-the-pwa-workflow.png)

## Instalar e gerenciar o app desktop {#desktop-app}

Abra a página pública de downloads. No macOS, escolha o pacote para Apple silicon ou Intel. No Windows, instale o aplicativo pela Microsoft Store. No Linux, escolha uma AppImage ou um pacote `deb`/`rpm` assinado para x64 ou ARM64. Siga o guia da plataforma e as instruções de verificação do pacote. O Windows não oferece um instalador `exe`. O aplicativo para macOS requer o macOS 13 (Ventura) ou posterior; em uma versão anterior, um aplicativo já instalado mantém a versão atual e não recebe novas atualizações.

Na primeira inicialização, o aplicativo abre a tela de cadastro do minddy Cloud, onde você cria sua conta. Para usar sua própria instância, clique em **Auto-hospedar o minddy**, na parte inferior das telas de login e cadastro. Isso abre **Auto-hospedar o minddy**, com três opções: **Instalar neste computador** prepara uma [instância local](/pt-br/documentacao/install-locally#install-locally), **Instalar em um servidor** abre no navegador o guia público de instalação de um servidor, e **Usar uma instalação existente** abre uma tela que reúne as instalações que você já tem. Ali, **Neste computador** abre uma pasta do minddy que já está neste computador, e o app a inicia; abaixo, **Endereço do servidor** com **Conectar** conecta você a um servidor que você administra. Servidores remotos exigem HTTPS; `localhost` pode usar HTTP.

Para trocar de servidor depois, escolha **Connect to a Server…** no menu nativo minddy (o menu nativo é em inglês; no Windows e no Linux, pressione Alt para mostrar a barra de menus), **Alterar…** ao lado de **Servidor conectado** em **Configurações da conta** → **Preferências** → **Aplicativo de desktop**, ou **Auto-hospedar o minddy** na parte inferior das telas de login e cadastro. Cada opção leva a janela do aplicativo para **Auto-hospedar o minddy**; quando um servidor self-hosted está conectado, **Usar minddy Cloud**, em **Usar uma instalação existente**, volta para o Cloud. O caminho no topo da página leva de volta a cada etapa, e o logo do minddy retorna ao aplicativo. Esta tela faz parte do app para desktop e abre sem conexão com a Internet. Confira o destino antes de entrar: cada conta pertence à sua instância. O OAuth usa o navegador do sistema e retorna depois ao aplicativo desktop.

No macOS e no Windows 11, a barra lateral, as abas e as bordas da janela mostram sua área de trabalho, desfocada, atrás do conteúdo opaco. Para manter a janela opaca neste dispositivo, desative **Transparência do aplicativo de desktop** em **Configurações da conta** → **Preferências** → [Aparência](/docs/accounts#preferences).

### Abas, fechamento e atualizações {#desktop-app-operation}

Use os controles de abas e a paleta de comandos para navegar entre seus trabalhos. Siga os atalhos exibidos para a plataforma: o macOS usa Command onde Windows e Linux normalmente usam Control. Fechar a janela a oculta e mantém o aplicativo em execução. Use Sair para encerrar o aplicativo; no macOS, você também pode usar Cmd+Q. As notificações em segundo plano dependem do pacote e das funções da plataforma.

O macOS e as AppImage portáteis oferecem atualizações no aplicativo. O Windows as instala pela Microsoft Store. Para `deb`/`rpm`, instale o próximo pacote verificado. No aplicativo de desktop, **Configurações da conta** → **Preferências** → **Aplicativo de desktop** mostra o servidor conectado e a versão do aplicativo, com uma verificação de atualização quando o pacote oferece suporte a ela. Na web, o mesmo cartão leva à página de download. Após atualizar, confira a versão desktop exibida e confirme que a instância desejada continua abrindo.

### Recuperar uma janela após uma falha {#desktop-renderer-recovery}

Se uma janela desktop falhar, uma página local de recuperação oferece **Reload window**. Use esse botão para reabrir a última tela no servidor selecionado atualmente. Alterações não salvas podem ser perdidas. O aplicativo aguarda sua ação em vez de recarregar repetidamente a página com falha. Se a página de recuperação também falhar, a mensagem nativa pede que você encerre e reabra o minddy. Esses controles nativos de recuperação usam atualmente rótulos em inglês.

Se uma página ainda estiver carregando após 30 segundos, ou uma janela continuar sem responder por cinco segundos depois que o aplicativo desktop detectar o problema, uma caixa de diálogo nativa oferece **Wait** e **Recover window**. **Wait** é a opção padrão e mantém seu trabalho e a solicitação em andamento. A caixa se fecha quando o carregamento termina ou a janela volta a responder. A recuperação pode perder alterações não salvas: escolha **Recover window** para abrir a página local de recuperação e depois **Reload window** para voltar à última tela.

O cache de consultas salvo é opcional e tem um limite de 2 MiB de dados. Se o cache completo for grande demais, o minddy mantém resultados completos de consultas que podem ser salvos, priorizando, quando necessário, as visualizações atuais e as abas presentes na barra. Se essa seleção ainda exceder o limite, o instantâneo local anterior será removido. Os dados que ficarem fora do cache salvo continuam na memória durante a sessão e são consultados novamente quando necessários após reiniciar. Os rascunhos salvos separadamente não são afetados. Esse cache não é um backup do seu trabalho.

Para reduzir o uso de memória em sessões longas, detalhes de PRs, diffs de commits e conteúdos de páginas inativos são liberados após um minuto e recarregados quando necessários. As consultas ativas são mantidas. Os rótulos das abas guardam apenas informações leves das PRs, portanto manter uma aba aberta não retém seus patches.

![Página local de recuperação após uma falha forçada do processo de renderização, com os controles Reload window e Check server settings.](/documentation/pt-BR/desktop-renderer-recovery.png)

## Ativar notificações em um dispositivo {#devices-and-notifications}

Abra as notificações nas configurações da conta no dispositivo que deseja registrar. Ative-as e aceite a solicitação de permissão do navegador ou do sistema operacional. Se a permissão foi negada, altere-a nas configurações do navegador ou do sistema; acionar o controle do minddy repetidamente não pode superar essa recusa. No iOS, instale e abra o aplicativo web primeiro quando a interface exigir.

Confira se o dispositivo aparece na lista e use o controle de teste correspondente. Consulte as informações da última entrega. Você pode desativar ou remover registros individuais sem excluir a conta. As categorias de **Configurações da conta** → **Notificações** determinam quais eventos geram notificações; a caixa de entrada do aplicativo continua disponível quando o push não está disponível.

![Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.](/documentation/pt-BR/devices-and-notifications-workflow.png)

### Condições por plataforma {#platforms}

O push web exige um navegador compatível e o serviço de push configurado na instância. Os banners nativos e a entrega em segundo plano variam conforme a plataforma. O pacote macOS assinado oferece suporte a APNs; o pacote Windows precisa do componente WNS opcional para o transporte em segundo plano. No Linux, a entrega utiliza a sessão em segundo plano do aplicativo distribuído, em vez de APNs ou WNS.

Se o servidor selecionado não tiver APNs ou WNS configurado, o aplicativo desktop usa notificações nativas locais enquanto estiver aberto ou oculto. Essa alternativa não entrega notificações depois que você encerra o aplicativo.

Confira a permissão de notificações no sistema, o estado de instalação no navegador e a explicação exibida caso o recurso não esteja configurado ou não seja compatível. Um teste bem-sucedido não garante a entrega sem conexão ou sob todas as restrições de segundo plano do sistema. Mantenha disponível o aplicativo ou o serviço em segundo plano configurado, conforme os requisitos da plataforma.

![Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.](/documentation/pt-BR/devices-and-notifications-registered.png)
