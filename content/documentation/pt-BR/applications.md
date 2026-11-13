---
{
  "id": "applications",
  "locale": "pt-BR",
  "title": "Aplicativos web, móveis e desktop",
  "summary": "Usar o minddy no navegador, instalar o app para iOS, o app web ou o app desktop e configurar as notificações do dispositivo.",
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
    "A03",
    "A13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 21,
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
      "components/mobile-navigation.tsx",
      "components/auth/auth-entry.tsx",
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
      "components/auth/auth-chrome.tsx",
      "lib/desktop/window-material.ts",
      "components/ui/mobile-sheet.tsx",
      "lib/sheet-swipe-dismiss.ts",
      "mobile/README.md",
      "components/mobile/shell.tsx",
      "components/mobile/ai-consent-gate.tsx",
      "lib/mobile/ai-consent.ts",
      "lib/server/ai-consent.ts",
      "components/settings/account-mobile-section.tsx",
      "lib/mobile/haptics.ts",
      "lib/apple-app-site-association.ts",
      "lib/mobile/public-links.ts",
      "lib/native-app.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (MIN-973 iOS app: new ios-app section with sign-in, server choice, offline screen, universal links, push, vibrations, purchases hidden and AI consent, and the iOS app in the PWA and notification passages; checked against mobile/README.md, components/mobile/shell.tsx, components/auth/auth-chrome.tsx, components/mobile/ai-consent-gate.tsx, lib/mobile/ai-consent.ts, lib/server/ai-consent.ts, components/settings/account-mobile-section.tsx, lib/apple-app-site-association.ts and the catalogs; not walked through on a device or on the App Store listing; 3 figures captured on 2026-11-13 from the local candidate in a phone-sized page with the shell bridge stubbed, inspected in all six locales; earlier figures kept with their capture dates); agent:claude-code (MIN-896 bottom sheets closed by a downward swipe, after the list scrolls back to its top; checked against components/ui/mobile-sheet.tsx and lib/sheet-swipe-dismiss.ts and their tests; not checked on a physical phone; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the gesture); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-907 phone menu opened from the bottom bar as a sheet, and the desktop app's first launch on the single sign-in and sign-up screen: checked against components/mobile-navigation.tsx, components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx and desktop/src/main.ts; no browser walkthrough; existing figures do not show the bottom bar or the sign-in screen and were kept); agent:claude-code (MIN-907 store submission prep: the browser-install passage no longer states that minddy has no App Store app, ahead of the iOS app; checked against messages/*.json DownloadMobile.noteBody; no figure affected)",
    "language": "agent:claude-code (pt-BR MIN-973 iOS app section and passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR changed passage on closing bottom sheets, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 phone menu and desktop first-launch passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-907 browser-install sentence, in the locale's register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications",
    "ios-app"
  ],
  "tags": [
    "Trabalhar no navegador e no celular",
    "Instalar o app para iOS",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-sign-in",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ios-app-sign-in.png",
      "alt": "A tela Entre ou crie sua conta do app para iOS, com o campo de e-mail, os botões da Apple, do Google e do GitHub e Auto-hospedar o minddy.",
      "caption": "No app para iOS, Auto-hospedar o minddy vem depois dos serviços de login. As janelas de login da Apple e do sistema não aparecem nesta captura.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        386,
        502
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-ai-consent",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ios-app-ai-consent.png",
      "alt": "A janela Usar os recursos de IA? do app para iOS, com Agora não e Permitir.",
      "caption": "A pergunta feita uma vez em cada dispositivo antes de qualquer recurso de IA. Agora não mantém os recursos de IA desativados no app.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        442,
        515
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-mobile-preferences",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/ios-app-mobile-preferences.png",
      "alt": "O grupo Aplicativo para celular das preferências do app para iOS, com os interruptores Vibração e Recursos de IA.",
      "caption": "Este grupo só aparece no app para iOS. Recursos de IA muda a resposta dada à pergunta da primeira abertura.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        418,
        305
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-28",
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
    "ios-app-sign-in",
    "ios-app-ai-consent",
    "ios-app-mobile-preferences",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Você pode acessar a mesma instância minddy pelo navegador, pelo app para iOS, pelo app web instalado ou pelo app desktop. Siga o procedimento do seu dispositivo e confira os requisitos de conexão, as atualizações e as permissões de notificação da plataforma.

## Trabalhar no navegador e no celular {#web-and-mobile}

Abra o endereço da sua instância e entre nessa mesma instância. Em uma tela estreita, abra o menu, à esquerda da barra na parte inferior da tela, para escolher um projeto e abra um ticket pela lista ou pelo quadro. Leia os detalhes no painel adaptado à tela, altere o campo desejado ou adicione um comentário e aguarde o resultado do salvamento antes de fechar. Feche o painel de detalhes para voltar à lista; sua apresentação no celular difere da de uma tela ampla.

No celular, menus, seletores e diálogos abrem em uma folha inferior. Feche-a com o botão de fechar ou deslizando-a para baixo; se a lista dela estiver rolada, o gesto primeiro a leva de volta ao topo.

Abra o Numo pelo botão flutuante ou por uma ação contextual do ticket. Confira o contexto do ticket no campo de composição. Se outro painel cobrir o conteúdo necessário, feche-o antes de continuar navegando. Em dispositivos de toque, use os botões e menus visíveis; não presuma que ações ao passar o mouse ou atalhos de desktop estejam disponíveis.

### Teclado e conexão {#access}

Com o teclado, você pode focar os controles e usar a paleta de comandos para navegar e executar ações comuns. O botão de envio visível continua sendo uma alternativa ao envio por teclado. Siga o atalho mostrado pela aplicação para a sua plataforma.

O navegador e o aplicativo web instalado precisam de conexão de rede para consultar dados dos projetos e salvar alterações. O service worker gerencia notificações push sem implementar um cache de dados offline. Após uma falha de conexão, confira se a alteração foi salva antes de repeti-la. Instalar a PWA não cria outra conta nem contorna as permissões da instância.

![Painel móvel de um ticket com título, descrição, propriedades e campo de comentário.](/documentation/pt-BR/web-and-mobile-workflow.png)

## Instalar o app para iOS {#ios-app}

No iPhone e no iPad, instale o minddy pela App Store. O app exige o iOS 15 ou posterior. Ele mostra a interface do servidor ao qual está conectado, o minddy Cloud ou a sua própria instância, então os novos recursos do minddy chegam sem atualizar o app.

Na primeira abertura, algumas telas apresentam o minddy; **Começar** leva a **Entre ou crie sua conta**. Digite seu endereço de e-mail e escolha **Continuar**, ou use **Continuar com a Apple**, **Continuar com o Google** ou **Continuar com o GitHub**. A Apple abre a própria janela de login; o Google e o GitHub abrem a janela de login do sistema sobre o app e voltam a ele quando você termina. O restante segue os mesmos passos da web; veja [Criar uma conta e entrar](/pt-br/documentacao/accounts#account-access).

Para usar uma instância auto-hospedada, toque em **Auto-hospedar o minddy** abaixo das opções de login. Em **Conecte-se ao seu servidor**, digite o endereço da instância em **Endereço do servidor** e toque em **Conectar**. Servidores remotos exigem HTTPS; um endereço digitado sem esquema usa HTTPS. **Voltar** retorna à tela de login e, quando o app está em um servidor auto-hospedado, **Usar minddy Cloud** volta ao Cloud. As contas pertencem à sua instância: entre com a conta do servidor escolhido. **Auto-hospedar o minddy** só aparece na tela de login, então saia da conta primeiro para trocar de servidor.

Se o servidor não responder, o app mostra **Não foi possível conectar ao servidor**, ou **Você está offline** quando o dispositivo está sem rede. **Tentar novamente** recarrega a página, e o app também tenta de novo sozinho quando a rede volta. **Trocar de servidor** abre **Conecte-se ao seu servidor**.

![A tela Entre ou crie sua conta do app para iOS, com o campo de e-mail, os botões da Apple, do Google e do GitHub e Auto-hospedar o minddy.](/documentation/pt-BR/ios-app-sign-in.png)

### Links, notificações, vibração e cobrança {#ios-app-operation}

Um link para `www.minddy.app` tocado no Mail, no Mensagens ou no Notas abre o app nessa página, esteja ele aberto ou não: um ticket, um projeto, uma página ou um link de e-mail que confirma sua conta, redefine sua senha ou aceita um convite. Links para a cobrança, o site público, este manual e links públicos de compartilhamento continuam abrindo no navegador. Links para uma instância auto-hospedada abrem no navegador e, enquanto o app estiver conectado a um servidor auto-hospedado, um link do minddy Cloud abre no Safari. Dentro do app, links para o site público, como preços, o manual ou as páginas legais, abrem em uma janela do Safari sobre o app.

Para receber notificações push, abra **Configurações da conta** → **Notificações** no app e ative **Notificar este dispositivo**. O iOS pede permissão na primeira vez; depois, as notificações chegam mesmo com o app fechado. Tocar em uma abre o ticket, a página ou o item a que ela se refere. Se o iOS bloquear as notificações, **Abrir Ajustes** abre as configurações de notificação do minddy no app Ajustes. Veja [Ativar notificações em um dispositivo](#devices-and-notifications).

O app vibra de leve quando você escolhe uma opção, aciona um interruptor ou copia algo, e com mais força quando você cria um ticket ou um objetivo, conclui um ticket ou envia um comentário. Para desligar, abra **Configurações da conta** → **Preferências** → **Aplicativo para celular** e desative **Vibração**. A configuração pertence à sua conta, então acompanha você nos outros celulares.

O app não vende nada. Ele não mostra a página de cobrança, os planos nem os botões de upgrade, e um recurso que o seu plano não inclui avisa isso sem oferecer upgrade. Gerencie sua assinatura em um navegador, no site do minddy; o app reconhece o seu plano assim que você entra.

### Permitir ou recusar os recursos de IA {#ios-app-ai}

Numo, Smart Fill, o ditado e a busca enviam o conteúdo com que trabalham (texto dos tickets, comentários, páginas, gravações) ao fornecedor do modelo de IA usado pela instância. Antes da primeira dessas solicitações, o app pergunta **Usar os recursos de IA?** uma vez em cada dispositivo, depois do login e dos primeiros passos. A política de privacidade, com link na janela, informa os fornecedores. Escolha **Permitir** para usar os recursos de IA, ou **Agora não** para mantê-los desativados neste app. Fechar a janela sem escolher faz a pergunta voltar na próxima abertura. Sair da conta apaga a resposta, então a próxima conta que entrar no dispositivo recebe a pergunta de novo.

Se você recusar, o app não inicia nenhum trabalho de IA: enviar uma mensagem ao Numo, ditar ou usar outro recurso de IA mostra a janela de novo para que você possa permitir dali. Um novo ticket é criado sem o Smart Fill, a busca de tickets só os encontra pelas palavras, sem a [busca por significado](/pt-br/documentacao/navigation#search-by-meaning), e uma menção ao Numo em um comentário fica sem resposta. O restante do minddy funciona normalmente. A web e o app desktop nunca fazem essa pergunta, e recusar no app não limita o que você faz neles. Já a sua última resposta vale para o trabalho de IA que o minddy faz em segundo plano na sua conta: depois de **Agora não**, o Smart Assign e o Smart Fill nos projetos de que você é proprietário, suas rotinas programadas e os lembretes do Numo deixam de usar IA.

Para mudar sua resposta, abra **Configurações da conta** → **Preferências** → **Aplicativo para celular** e ative ou desative **Recursos de IA**.

![A janela Usar os recursos de IA? do app para iOS, com Agora não e Permitir.](/documentation/pt-BR/ios-app-ai-consent.png)

![O grupo Aplicativo para celular das preferências do app para iOS, com os interruptores Vibração e Recursos de IA.](/documentation/pt-BR/ios-app-mobile-preferences.png)

## Instalar o app web no celular ou tablet {#install-the-pwa}

No iPhone e no iPad, o [app para iOS](#ios-app) é a escolha habitual. O app web instalado continua disponível no Android e para quem prefere o navegador.

Abra a instância minddy que deseja usar no Safari em um iPhone ou iPad, ou no Chrome ou em outro navegador Android compatível. Se o link tiver aberto dentro de outro aplicativo, abra-o primeiro no navegador completo. Para uma instância self-hosted, use o endereço do seu próprio servidor.

No iOS, abra Compartilhar e escolha Adicionar à Tela de Início. Mantenha Abrir como App da Web ativado e toque em Adicionar. Dependendo da interface do Safari, pode ser necessário abrir Mais antes de Compartilhar. Se a ação não aparecer, confira Editar Ações.

No Android, use a sugestão de instalação ou escolha Instalar app ou Adicionar à tela inicial no menu do navegador e confirme Instalar. Os nomes dependem do navegador. Abra o novo ícone e entre com a conta daquela instância. Assim, o navegador instala o minddy como um app web.

### Atualizações, acesso offline e notificações {#operation}

A instalação não cria uma cópia offline do projeto. O service worker do minddy só gerencia notificações push e não armazena as requisições do aplicativo em cache. Use uma conexão de rede e recarregue a página para obter o conteúdo web atual. As notificações também exigem um navegador compatível, sua permissão e a configuração push no servidor. No iOS, use o aplicativo instalado quando o processo solicitar. Se a opção de instalação não aparecer, abra um navegador completo compatível e confira se a instância já está instalada.

![Guia ilustrado de instalação pelo Safari no minddy: Compartilhar, adicionar à Tela de Início e confirmar.](/documentation/pt-BR/install-the-pwa-workflow.png)

## Instalar e gerenciar o app desktop {#desktop-app}

Abra a página pública de downloads. No macOS, escolha o pacote para Apple silicon ou Intel. No Windows, instale o aplicativo pela Microsoft Store. No Linux, escolha uma AppImage ou um pacote `deb`/`rpm` assinado para x64 ou ARM64. Siga o guia da plataforma e as instruções de verificação do pacote. O Windows não oferece um instalador `exe`. O aplicativo para macOS requer o macOS 13 (Ventura) ou posterior; em uma versão anterior, um aplicativo já instalado mantém a versão atual e não recebe novas atualizações.

Na primeira inicialização, o aplicativo abre a tela **Entre ou crie sua conta** do minddy Cloud, onde você entra ou cria sua conta. Para usar sua própria instância, clique em **Auto-hospedar o minddy**, na parte inferior dessa tela. Isso abre **Auto-hospedar o minddy**, com três opções: **Instalar neste computador** prepara uma [instância local](/pt-br/documentacao/install-locally#install-locally), **Instalar em um servidor** abre no navegador o guia público de instalação de um servidor, e **Usar uma instalação existente** abre uma tela que reúne as instalações que você já tem. Ali, **Neste computador** abre uma pasta do minddy que já está neste computador, e o app a inicia; abaixo, **Endereço do servidor** com **Conectar** conecta você a um servidor que você administra. Servidores remotos exigem HTTPS; `localhost` pode usar HTTP.

Para trocar de servidor depois, escolha **Connect to a Server…** no menu nativo minddy (o menu nativo é em inglês; no Windows e no Linux, pressione Alt para mostrar a barra de menus), **Alterar…** ao lado de **Servidor conectado** em **Configurações da conta** → **Preferências** → **Aplicativo de desktop**, ou **Auto-hospedar o minddy** na parte inferior da tela **Entre ou crie sua conta**. Cada opção leva a janela do aplicativo para **Auto-hospedar o minddy**; quando um servidor self-hosted está conectado, **Usar minddy Cloud**, em **Usar uma instalação existente**, volta para o Cloud. O caminho no topo da página leva de volta a cada etapa, e o logo do minddy retorna ao aplicativo. Esta tela faz parte do app para desktop e abre sem conexão com a Internet. Confira o destino antes de entrar: cada conta pertence à sua instância. O OAuth usa o navegador do sistema e retorna depois ao aplicativo desktop.

No macOS e no Windows 11, a barra lateral, as abas e as bordas da janela mostram sua área de trabalho, desfocada, atrás do conteúdo opaco. Uma janela em tela cheia fica opaca, e a transparência volta quando ela sai da tela cheia. Para manter a janela opaca neste dispositivo, desative **Transparência do aplicativo de desktop** em **Configurações da conta** → **Preferências** → [Aparência](/docs/accounts#preferences).

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

Abra as notificações nas configurações da conta no dispositivo que deseja registrar. Ative-as e aceite a solicitação de permissão do navegador ou do sistema operacional. Se a permissão foi negada, altere-a nas configurações do navegador ou do sistema; acionar o controle do minddy repetidamente não pode superar essa recusa. O [app para iOS](#ios-app-operation) se registra diretamente. No Safari do iPhone ou iPad, instale e abra o aplicativo web primeiro quando a interface exigir.

Confira se o dispositivo aparece na lista e use o controle de teste correspondente. Consulte as informações da última entrega. Você pode desativar ou remover registros individuais sem excluir a conta. As categorias de **Configurações da conta** → **Notificações** determinam quais eventos geram notificações; a caixa de entrada do aplicativo continua disponível quando o push não está disponível.

![Configurações push com permissão bloqueada no navegador e nenhum dispositivo registrado.](/documentation/pt-BR/devices-and-notifications-workflow.png)

### Condições por plataforma {#platforms}

O push web exige um navegador compatível e o serviço de push configurado na instância. Os banners nativos e a entrega em segundo plano variam conforme a plataforma. O app para iOS recebe as notificações pelo APNs, mesmo fechado. O pacote macOS assinado oferece suporte a APNs; o pacote Windows precisa do componente WNS opcional para o transporte em segundo plano. No Linux, a entrega utiliza a sessão em segundo plano do aplicativo distribuído, em vez de APNs ou WNS.

Se o servidor selecionado não tiver APNs ou WNS configurado, o aplicativo desktop usa notificações nativas locais enquanto estiver aberto ou oculto. Essa alternativa não entrega notificações depois que você encerra o aplicativo.

Confira a permissão de notificações no sistema, o estado de instalação no navegador e a explicação exibida caso o recurso não esteja configurado ou não seja compatível. Um teste bem-sucedido não garante a entrega sem conexão ou sob todas as restrições de segundo plano do sistema. Mantenha disponível o aplicativo ou o serviço em segundo plano configurado, conforme os requisitos da plataforma.

![Dispositivo de navegador registrado e ativo na conta, com a data real do último envio.](/documentation/pt-BR/devices-and-notifications-registered.png)
