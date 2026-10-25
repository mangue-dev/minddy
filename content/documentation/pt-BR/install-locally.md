---
{
  "id": "install-locally",
  "locale": "pt-BR",
  "title": "Instâncias locais",
  "summary": "Instale uma instância local privada pelo aplicativo desktop ou abra um clone preparado, com Node.js 24.22.1 ou uma 24.x posterior, pnpm 10.28.0, Git, Supabase CLI e Docker em execução.",
  "topic": "Operar uma instância",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 12,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.1 (release documentation gate)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/desktop/local-installer.ts",
      "desktop/src/local-installer.ts",
      "lib/desktop/local-toolchain.ts",
      "desktop/src/local-toolchain.ts",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/main.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx",
      "lib/desktop/local-account.ts",
      "desktop/src/local-account.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: pt-BR labels aligned on the corrected catalog and the ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 desktop onboarding and built-in local installer: source review of lib/desktop/local-installer.ts, desktop/src/local-installer.ts, lib/desktop/onboarding-copy.ts, desktop/src/server-picker.ts, desktop/src/main.ts and scripts/self-hosting-local.mjs; installer procedure, labels and --prepare-only documented, manual clone kept as the alternative; automatic installation of missing tools checked against lib/desktop/local-toolchain.ts and desktop/src/local-toolchain.ts (requirement states, tool steps, app-owned toolchain folder, system prompts per platform, Linux sign-out, Install manually); then the server choice moved from a separate window to a screen in the app window: wording, Cancel, leaving the screen and the Internet requirement checked against components/desktop/server-choice.tsx, app/desktop/welcome/page.tsx, lib/desktop/server-choice.ts and desktop/src/main.ts; no browser or desktop walkthrough, no installation run; no screenshot recaptured); then the server choice bundled in the desktop app (offline, first screen), checked against components/desktop/server-choice-entry.tsx and desktop/src/server-choice.ts; then the self-hosted step regrouped into three cards and one existing-installation screen, checked against components/desktop/server-choice.tsx; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, checked against desktop/src/main.ts, components/auth/auth-chrome.tsx and components/desktop/server-choice.tsx; then the installer's account managed by the app: no email, automatic sign-in on the local instance, checked against lib/desktop/local-account.ts, desktop/src/local-account.ts, desktop/src/local-installer.ts, components/desktop/server-choice.tsx and components/auth/desktop-local-sign-in.tsx; no installation run, no screenshot recaptured",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (pt-BR translation of the installer and server window rewrite with onboarding window and catalog labels, then automatic tool installation with catalog labels, register checked; equivalent meaning self-reviewed key by key; then window-to-screen wording, Cancel and Internet requirement with catalog labels; then the self-hosted step regrouped into three cards and one existing-installation screen, with catalog labels; then the first-launch welcome removed: the app starts on Cloud sign-up and Self-host minddy under the auth forms opens the self-hosting page, with catalog labels; then the installer's account managed by the app: no email, automatic sign-in on the local instance, with catalog labels and informal register; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Executar uma instância local pelo aplicativo desktop"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/install-locally-flow.svg",
      "alt": "Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair encerra o aplicativo e o backend.",
      "caption": "O aplicativo desktop controla o início e o encerramento da instância local; os dados precisam ser preservados entre as execuções.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Aplicativo desktop seleciona clone"
          },
          {
            "title": "Aplicação loopback: porta 6463"
          },
          {
            "title": "Supabase mínimo e dados duráveis"
          },
          {
            "title": "Sair encerra o aplicativo e o backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-locally-wizard.png",
      "alt": "Assistente público de instalação com o perfil deste computador selecionado.",
      "caption": "Escolha a instalação pessoal quando o aplicativo de desktop for gerenciar os serviços locais.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        944,
        749
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## Instalar o minddy neste computador {#install-locally}

Uma instância local roda o minddy com um Supabase mínimo no Docker em um único computador, para avaliação ou uso pessoal. Os dados ficam nesse computador, e o aplicativo desktop inicia e encerra os serviços. Ela usa Git, Node.js 24.22.1 ou uma versão 24.x posterior, `pnpm` 10.28.0, Supabase CLI e Docker em execução. O aplicativo desktop instala o que estiver faltando; um clone que você mesmo prepara precisa deles instalados antes. Reserve ao menos 4 GB de RAM livre, dois núcleos e 10 GB livres de SSD; recomendamos 8 GB, quatro núcleos e 20 GB. Instale primeiro o aplicativo desktop assinado pela página de downloads. Windows usa Microsoft Store; macOS e Linux têm downloads próprios.

O aplicativo desktop inclui um instalador que executa todo o procedimento para você:

1. Abra o aplicativo desktop. Ele inicia no minddy Cloud: a primeira inicialização abre a tela de cadastro dele. Clique em **Auto-hospedar o minddy**, na parte inferior da tela de login ou de cadastro. Depois de entrar, abra a mesma tela com **Connect to a Server…** no menu nativo minddy (o menu nativo é em inglês; no Windows e no Linux, pressione Alt para mostrar a barra de menus) ou em **Configurações da conta** → **Preferências** → **Aplicativo de desktop** → **Servidor conectado** → **Alterar…**.
2. Em **Auto-hospedar o minddy**, escolha **Instalar neste computador**.
3. Em **Requisitos**, o aplicativo verifica Git, Node.js 24, pnpm, Supabase CLI e Docker. Uma ferramenta ausente mostra **Não encontrado; será instalado**, e um Node.js mais antigo, **Versão … encontrada; o Node.js 24 será instalado para o minddy**. Um Docker instalado, mas parado, mostra **Instalado, mas parado; será iniciado**. Você não precisa instalar nada antes: **Instalar** cuida disso. **Verificar novamente** repete a verificação.
4. Confira a **Pasta de instalação**. O padrão é uma pasta `minddy` na sua pasta pessoal; **Escolher…** seleciona outra. Se a pasta escolhida já tiver outros arquivos, o aplicativo instala o minddy em uma pasta `minddy` dentro dela.
5. Clique em **Instalar**. O aplicativo não pede nenhum e-mail: uma nota explica que o minddy cria a sua conta neste computador e faz o login por você.
6. Mantenha a janela aberta enquanto as etapas são executadas. As ferramentas ausentes vêm primeiro, cada uma em sua própria etapa: **Instalar o Git**, **Instalar o Node.js 24**, **Instalar o pnpm**, **Instalar o Supabase CLI** e depois **Instalar o Docker** ou **Iniciar o Docker**. **Baixar o minddy**, seguido do número da versão, faz um `git clone` raso da versão que o guia público de instalação também usa. **Instalar dependências** executa `pnpm install --frozen-lockfile`, **Configurar a instância** torna a sua conta local administradora da instância, **Preparar o Supabase e compilar o app** executa `pnpm self-host:local -- --no-open --prepare-only` **Iniciar o minddy** inicia o runtime local e **Criar sua conta local** cria a sua conta na instância. A primeira instalação pode levar alguns minutos enquanto o Docker baixa as imagens do Supabase e o app é compilado.
7. Quando o minddy estiver em execução, o aplicativo o abre com o login já feito na sua conta local.

A conta local é uma conta comum, com o nome da sua conta de usuário do computador e o endereço `owner@local.minddy.app`. Ela administra a instância, e as configurações e a propriedade dos projetos funcionam normalmente. O aplicativo gera a senha dela e a guarda criptografada no chaveiro do sistema: você nunca a digita, e a página recebe apenas uma sessão. Sempre que a janela mostra esta instância, o aplicativo faz o login da conta sozinho, por trás de uma breve tela **Abrindo o seu minddy…**. Se você reinstalar em uma pasta cujos dados do Supabase foram mantidos, o aplicativo encontra a mesma conta e dá a ela uma nova senha; seus dados continuam lá. Isso vale apenas para uma instância instalada pelo aplicativo: uma pasta aberta com **Usar uma instalação existente** › **Neste computador** mantém as próprias contas e o login habitual, e servidores remotos sempre usam o login habitual.

O Node.js, o pnpm e o Supabase CLI são instalados sem direitos de administrador em uma pasta `toolchain` dentro da pasta de dados do usuário do aplicativo. O Node.js vem do arquivo oficial de nodejs.org, conferido com as somas SHA-256 publicadas; o pnpm 10.28.0 e o Supabase CLI 2.115.0 são instalados com o npm. Esse Node.js não substitui o que já estiver no sistema: o aplicativo o coloca primeiro no `PATH` apenas para o próprio instalador e o runtime local.

O Git e o Docker passam pela confirmação do seu sistema. No macOS, confirme as ferramentas de desenvolvimento de linha de comando na janela da Apple para obter o Git. No Windows, o aplicativo adiciona o MinGit, a versão portátil do Git for Windows, à mesma pasta depois de conferir o digest dele. No macOS e no Windows, o aplicativo baixa o Docker Desktop, confere se a Docker Inc o assinou, instala e abre o programa. O macOS pode pedir uma senha de administrador; o Windows pede permissão pelo Controle de Conta de Usuário e mostra o instalador do próprio Docker. Depois, aceite a licença e os pedidos de permissão do Docker Desktop. No Linux, um único pedido de senha do sistema instala o Git com o gerenciador de pacotes da sua distribuição e o Docker Engine com o script oficial `get.docker.com` do Docker, inicia o serviço do Docker e adiciona você ao grupo `docker`. Saia e entre de novo na sessão para que sua conta possa usar o Docker e clique em **Tentar novamente**.

Depois disso, o aplicativo lembra a pasta e controla a inicialização e o encerramento dos serviços locais, como descrito em [Usar um clone preparado](#launch). Como em uma instalação manual, a nova instância criptografa o conteúdo do espaço de trabalho por padrão. Consulte a [criptografia do espaço de trabalho](/pt-br/documentacao/workspace-encryption#workspace-encryption).

![Diagrama: Aplicativo desktop seleciona clone. Aplicação loopback: porta 6463. Supabase mínimo e dados duráveis. Sair encerra o aplicativo e o backend.](/documentation/pt-BR/install-locally-flow.svg)

## Usar um clone preparado {#launch}

Prepare o clone você mesmo quando quiser escolher a versão ou inspecionar o repositório antes de executá-lo. Use um clone dedicado e selecione nele a versão a avaliar antes de instalar as dependências.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

As novas instalações locais criptografam o conteúdo do espaço de trabalho por padrão. Para registrar uma escolha explícita, execute `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (ou `--encryption disabled`) no clone antes de abri-lo no aplicativo; as inicializações seguintes preservam a escolha salva.

Abra a etapa **Auto-hospedar o minddy** como no primeiro passo acima, escolha **Usar uma instalação existente**, depois **Neste computador**, e selecione a raiz do clone. O aplicativo executa `self-host:local --no-open`, prepara Supabase mínimo, aplica migrações e Storage, compila quando necessário e aguarda `/api/health` antes de abrir o cadastro. Ele escuta apenas em loopback na porta 6463, lembra a pasta e controla inicialização e encerramento. O guia público de instalação descreve a mesma instalação pessoal.

![Assistente público de instalação com o perfil deste computador selecionado.](/documentation/pt-BR/install-locally-wizard.png)

## Disponibilidade do MCP e acesso à rede {#mcp-network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

Este perfil gerenciado pelo aplicativo desktop escuta apenas na interface de loopback. Um cliente MCP compatível no mesmo computador pode usar `http://localhost:6463/api/mcp`; `localhost` e `127.0.0.1` identificam o computador que inicia a conexão. Outro computador ou um agente hospedado na nuvem não pode acessar diretamente este perfil. Para acesso por LAN/VPN, use uma instalação de servidor com uma origem configurada acessível, por exemplo `http://192.168.1.50`, e permita o acesso à porta da aplicação pelo endereço de escuta, firewall e roteamento. Fora dessa rede, o cliente precisa de uma origem HTTPS acessível como `https://tickets.example.com`, ou de outro caminho de rede aceito. A instalação local não oferece automaticamente acesso pela Internet.

[Leia a orientação de acesso à rede do MCP antes de conectar um cliente remoto](/docs/minddy-mcp#network-access).

## Recuperar após uma falha {#recover}

A tela de escolha do servidor faz parte do app para desktop: ela abre sem conexão com a Internet, então você sempre pode escolher ou trocar uma instância local offline.

Se uma etapa da instalação falhar, a tela de instalação a marca e mostra a última linha impressa pelo comando. Uma etapa de ferramenta com falha também oferece **Instalar manualmente**, que abre a página de download dessa ferramenta. Corrija a causa, por exemplo aceitando os pedidos do Docker Desktop, instalando a ferramenta você mesmo ou liberando espaço em disco, e clique em **Tentar novamente**. A instalação continua na mesma pasta; ferramentas já instaladas e uma versão já baixada não são obtidas de novo. **Voltar** retorna ao campo de pasta. **Cancelar**, abaixo das etapas, interrompe uma instalação em andamento, assim como sair desta tela; fechar a janela apenas a oculta. Para ler a saída completa da etapa de preparação, execute `pnpm self-host:local -- --no-open --prepare-only` na pasta de instalação: o comando prepara o Supabase e compila o app, depois termina e deixa o Supabase em execução.

Fechar uma janela mantém o aplicativo desktop ativo; use o comando para sair do aplicativo para parar também os serviços locais. Confira Docker, CLI, espaço e outros processos na 6463.

`pnpm self-host:local` é uma alternativa de diagnóstico no terminal. Pare com Ctrl+C antes de devolver o controle ao aplicativo, que não assume processos alheios. Sair do aplicativo normalmente também para Supabase; `--keep-backend` muda isso explicitamente.

Nunca use `supabase db reset --local` para recuperar dados: ele apaga os dados de avaliação. Teste conta nova, projeto, ticket e anexo antes de confiar na instância.
