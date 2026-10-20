---
{
  "id": "installation",
  "locale": "pt-BR",
  "title": "Referência de instalação",
  "summary": "Escolha uma versão e um perfil verificados, instale o perfil completo, gerenciado ou a partir do código-fonte e confira seus limites operacionais.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (pt-BR translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Escolher uma versão e um perfil de instalação compatíveis",
    "Instalar o perfil de servidor de referência",
    "Instalar com Supabase gerenciado ou pelo código-fonte"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/self-hosted-compatibility-flow.svg",
      "alt": "Diagrama: Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.",
      "caption": "Siga as etapas nesta ordem. Tag de código anotada. Arquivos e `SHA256SUMS`. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Tag de código anotada"
          },
          {
            "title": "Arquivos e `SHA256SUMS`"
          },
          {
            "title": "Assinatura e digest OCI oficiais"
          },
          {
            "title": "Perfil de compatibilidade escolhido"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/install-a-server-flow.svg",
      "alt": "Diagrama: Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador. Verificação de conta, arquivos e recuperação.",
      "caption": "Siga as etapas nesta ordem. Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador. Verificação de conta, arquivos e recuperação.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Release verificada e ambiente protegido"
          },
          {
            "title": "Instalador: perfil full de referência"
          },
          {
            "title": "Supabase oficial, app, agendador"
          },
          {
            "title": "Verificação de conta, arquivos e recuperação"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/pt-BR/install-a-server-wizard.png",
      "alt": "Assistente público de instalação com Supabase no mesmo servidor selecionado.",
      "caption": "O perfil full mantém a aplicação e o Supabase no seu servidor. Neste exemplo, o acesso pela rede privada fica restrito à rede local.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        1090
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.",
      "caption": "A escolha entre imagem OCI e compilação pelo código-fonte muda a gestão da aplicação, enquanto o provedor gerencia o backend.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Seu projeto Supabase gerenciado"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Perfil OCI OU aplicação de tag"
          },
          {
            "title": "Tarefas e backup conforme perfil"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Para instalar o minddy no seu servidor, escolha uma versão verificada e um perfil com Supabase completo, gerenciado ou uma aplicação compilada pelo código-fonte. Verifique primeiro a compatibilidade e depois siga o procedimento escolhido. Antes de receber usuários, verifique autenticação, arquivos e restauração.

## Disponibilidade do MCP e acesso à rede {#mcp-network-access}

O MCP está incluído no minddy self-hosted e inicia com a aplicação. Funciona imediatamente em `/api/mcp`, na origem da instância configurada com `MINDDY_PUBLIC_APP_URL`. A descoberta OAuth e o registro dinâmico de clientes estão incluídos: não é necessário um servidor MCP separado, um aplicativo OAuth dedicado nem um proxy do minddy Cloud. Conecte o cliente MCP ao endpoint da sua instância, entre na conta e conceda acesso pelo consentimento no navegador.

A disponibilidade do serviço não garante que ele seja acessível pela rede. Tanto o cliente MCP quanto o navegador usado para autorização precisam alcançar as URLs MCP e OAuth anunciadas. Se você definir explicitamente `OAUTH_ISSUER`, essa origem também precisa ser acessível. O cliente deve aceitar a conexão, o fluxo OAuth e o caminho de rede escolhido; alguns clientes exigem HTTPS mesmo em redes privadas.

Escolha uma origem acessível ao cliente MCP e ao navegador de autorização. No mesmo computador, um cliente compatível pode usar `http://localhost:6463/api/mcp`. Em outro computador da LAN/VPN, use o endereço configurado do servidor, por exemplo `http://192.168.1.50/api/mcp`, com endereço de escuta, porta da aplicação, firewall e roteamento que permitam acesso. `localhost` e `127.0.0.1` sempre apontam para o computador que inicia a conexão, portanto a URL localhost do servidor não funciona ali. Um processo limitado ao loopback continua inacessível diretamente. Fora da rede privada, use um endpoint HTTPS acessível como `https://tickets.example.com/api/mcp` ou um caminho de rede aceito, conforme os requisitos do cliente. Um agente hospedado também precisa desse caminho; a hospedagem local não expõe automaticamente a instância à Internet.

[Leia a orientação de acesso à rede do MCP antes de conectar um cliente remoto](/docs/minddy-mcp#network-access).

## Escolher uma versão e um perfil de instalação compatíveis {#self-hosted-compatibility}

Use uma versão imutável do repositório público `mangue-dev/minddy` e leia os requisitos na linha de `deploy/self-hosted/compatibility.json` cujo `minddyRelease` corresponde a ela. Uma versão de pacote sem linha própria não é uma release auto-hospedada suportada. Toda linha publicada aceita servidores Linux amd64 e arm64, Node.js 24, `pnpm` 10.28.0, Docker Engine a partir de 27.0.0 e plugin Compose a partir de 2.29.0. O perfil full fixa o Supabase oficial `self-hosted/v0.7.2` no commit `549db119c44c25167461812041ba198bde2b31a4`. Preserve o conjunto completo de imagens. Atualizar um serviço isolado cria uma variante sob responsabilidade do operador.

O perfil managed conecta um projeto Supabase em supabase.com. Ele precisa fornecer PostgreSQL, Auth, Storage e Realtime e passar na verificação da versão. PostgreSQL sozinho não basta. A pilha local da Supabase CLI serve para desenvolvimento e avaliação, não para produção pública.


![Diagrama: Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.](/documentation/pt-BR/self-hosted-compatibility-flow.svg)

### Verificar antes de executar {#verify-release}

Verifique a tag anotada, os arquivos da release, `SHA256SUMS` e a assinatura OCI oficial antes de instalar dependências ou executar a versão. Os comandos Bash abaixo começam no checkout da tag escolhida e deixam `IMAGE` com o digest verificado. Pare se qualquer teste falhar. Instale primeiro o Cosign conforme sua documentação oficial. A verificação comprova a identidade do código e da imagem, não o funcionamento da implantação.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Planejar operação e atualizações {#support}

Instale uma versão publicada de cada vez. As migrações avançam apenas; um retorno incompatível restaura banco, Storage, configuração e aplicação como um conjunto correspondente. A minddy mantém ferramentas de release e oferece ajuda sem garantia para falhas reproduzíveis do núcleo. Você opera DNS, TLS, capacidade, backups, ensaios de restauração e provedores opcionais. Uma tag móvel ou pilha Supabase derivada não herda o contrato de suporte.

Os perfis publicados na v0.11.0 também iniciam um serviço `agent-runner` que falha antes que a aplicação fique saudável. As releases seguintes removem completamente esse runner e suas sandboxes de código: o Numo não executa código e nenhum serviço recebe o socket do Docker. Instale uma dessas releases em vez de adaptar a v0.11.0.


## Instalar o perfil de servidor de referência {#install-a-server}

Comece por uma tag verificada e seu digest imutável. Linux amd64 e arm64 são aceitos. Reserve 4 GB de RAM, dois núcleos e 20 GB de SSD com Supabase gerenciado; 8 GB, quatro núcleos e 60 GB se ele estiver no mesmo servidor. Serviço público exige DNS e HTTPS nas suas próprias origens. HTTP só é aceito em `localhost` ou IPv4 privada. Restrinja a uma LAN confiável sem encaminhar portas do roteador. Nesse modo, full expõe aplicação na 80 e API na 8000.


![Diagrama: Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador. Verificação de conta, arquivos e recuperação.](/documentation/pt-BR/install-a-server-flow.svg)


![Assistente público de instalação com Supabase no mesmo servidor selecionado.](/documentation/pt-BR/install-a-server-wizard.png)

### Configurar e executar o instalador {#install}

Execute `pnpm self-host:install` no diretório da release. Selecione o perfil managed ou full, a origem da aplicação e o endereço do administrador. Para o perfil full, obtenha primeiro o checkout upstream fixado. O instalador grava um arquivo de ambiente com permissões `0600`, gera valores distintos para os segredos ausentes, baixa as imagens do perfil selecionado, inicia os serviços e executa o bootstrap idempotente. Ele preserva a referência fixada da imagem e os segredos existentes. O instalador também pergunta se deve criptografar o conteúdo do espaço de trabalho; `--encryption enabled` (padrão) ou `--encryption disabled` responde sem interação, e ele grava `MINDDY_CONTENT_ENCRYPTION_ENABLED` com uma `MINDDY_DATA_ROOT_KEY` independente. Uma nova execução preserva a escolha salva e recusa uma escolha diferente; consulte a [criptografia do espaço de trabalho](/pt-br/documentacao/workspace-encryption#workspace-encryption) antes de alterá-la. O exemplo usa o digest `IMAGE` verificado no artigo de compatibilidade. Para receber emails reais do Auth, adicione primeiro `--skip-start` e configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` e `SMTP_SENDER_NAME` no arquivo protegido antes de executar a instalação novamente. Mantenha `ENABLE_EMAIL_AUTOCONFIRM=false`. O valor `supabase-mail` é um exemplo e não representa uma caixa de email de produção.


Antes de iniciar, compare `MINDDY_RELEASE` e `MINDDY_IMAGE` no arquivo protegido com a linha de compatibilidade escolhida e o asset de container verificado. O instalador copia `MINDDY_RELEASE` do modelo de implantação da release, e `--image` altera apenas a referência da imagem; não existe uma opção `--release`. O modelo de v0.11.0, por exemplo, ainda indica 0.10.30. Se o valor for diferente da release que você instala, prepare o arquivo com `--skip-start`, defina explicitamente `MINDDY_RELEASE` para essa release e preserve a referência imutável verificada. Não substitua as credenciais geradas nem as chaves de criptografia.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


O comando anterior cria `deploy/self-hosted/.env` no diretório da release escolhida. Edite esse arquivo protegido e execute novamente o mesmo comando sem `--skip-start` para iniciar o perfil e executar o bootstrap. As origens, a imagem e os segredos existentes permanecem no arquivo protegido.

Se você executar este perfil full no macOS com Docker Desktop, aplique o [override de volume para Storage em sistema de arquivos](/pt-br/documentacao/storage-and-attachments#docker-desktop) antes da primeira inicialização e mantenha `RESTORE_OVERRIDE` em toda operação Compose posterior. A montagem por bind em um host Linux e este perfil com volume nomeado exigem arquivos de bytes diferentes; use o procedimento de backup e restauração correspondente.

### Verificar antes de receber usuários {#accept}

Os perfis de referência incluem o agendador; eles não contêm nenhum runner de código nem montam o socket do Docker. Não exponha o PostgreSQL nem as portas dos serviços internos à Internet. Execute o doctor com o arquivo de ambiente da instância e o arquivo Compose upstream do perfil full. Verifique a confirmação da conta, o login, a autenticação MFA, a redefinição da senha, a criação de projetos e issues, o envio e o download de anexos e o Realtime em duas sessões. Uma resposta 200 de `/api/health` comprova apenas que a aplicação está ativa. Se a instalação for interrompida, execute novamente o instalador com o mesmo contexto Compose e o arquivo de ambiente protegido; não apague os dados. Antes de receber uma equipe, prepare um backup em outro host e verifique a restauração em um destino vazio.




## Instalar com Supabase gerenciado ou pelo código-fonte {#managed-or-source-installation}

Supabase gerenciado indica quem opera o backend. Pode ser usado com a imagem OCI oficial ou com um servidor compilado a partir do código. Separe esses tipos de implantação nos registros de instalação e aceitação. O backend precisa fornecer PostgreSQL, Auth, Storage e Realtime. O caminho OCI managed guiado exige um projeto em supabase.com, sua URL pública, chaves anon e service-role e uma conexão PostgreSQL acessível pelas ferramentas de bootstrap. Use seu próprio projeto, nunca credenciais do minddy Cloud.

![Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.](/documentation/pt-BR/managed-or-source-installation-flow.svg)

### Configurar Supabase gerenciado {#managed}

Execute o comando abaixo a partir da versão verificada. `IMAGE` é o digest conferido no artigo de compatibilidade; ... indica valores de exemplo que você deve substituir. Obtenha as credenciais reais em privado e mantenha-as fora do histórico do shell e de logs compartilhados. O instalador conserva o ambiente existente, inclui o agendador e não ativa serviços opcionais sem configuração. Configure SMTP Auth e os redirects exatos separadamente no projeto Supabase.

O perfil OCI `managed` publicado na v0.11.0 contém o mesmo runner com falha que o perfil `full`, portanto seu instalador sem alterações não consegue concluir a inicialização. Use uma release posterior sem runner. O comando abaixo prepara a configuração com `--skip-start`. Revise esse arquivo protegido, preservando a imagem verificada e os segredos gerados, e execute novamente o comando sem `--skip-start`. Verifique o perfil `managed` antes de admitir usuários. Não execute os comandos de backend local do perfil full em um projeto do provedor.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Concluir implantação pelo código-fonte {#source}

Para instalar a partir do código, instale as dependências fixadas da tag, forneça o ambiente minddy e Supabase, execute bootstrap e build e inicie o servidor de produção atrás de um proxy. Defina `MINDDY_PUBLIC_*` antes de iniciar. Você precisa fornecer um agendador persistente com as chamadas autenticadas descritas no artigo de rede: um build não executa jobs. Verifique migrações e Storage, depois Auth, issues, bytes dos anexos e Realtime. Use o procedimento lógico ou do provedor para backup. Um servidor de código não valida a instalação OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
