---
{
  "id": "installation",
  "locale": "pt-BR",
  "title": "Instalação auto-hospedada",
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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
      "caption": "Siga as etapas nesta ordem. Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.",
      "revision": 2,
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
            "title": "Arquivos e SHA256SUMS"
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
      "alt": "Diagrama: Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador, runner. Verificação de conta, arquivos e recuperação.",
      "caption": "Siga as etapas nesta ordem. Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador, runner. Verificação de conta, arquivos e recuperação.",
      "revision": 2,
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
            "title": "Supabase oficial, app, agendador, runner"
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        944,
        1044
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/managed-or-source-installation-flow.svg",
      "alt": "Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.",
      "caption": "Estes componentes têm responsabilidades distintas. Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.",
      "revision": 2,
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

Para instalar o minddy no seu servidor, escolha uma versão verificada e um perfil com Supabase completo, gerenciado ou uma aplicação compilada pelo código-fonte. Este guia distingue os procedimentos e limites da versão publicada das adaptações técnicas explícitas. Antes de receber usuários, verifique autenticação, arquivos, trabalho de código quando habilitado e restauração.

## Escolher uma versão e um perfil de instalação compatíveis {#self-hosted-compatibility}

Use uma versão imutável do repositório público mangue-dev/minddy. A linha v0.11.0 aceita servidores Linux amd64 e arm64, Node.js 24, pnpm 10.28.0, Docker Engine a partir de 27.0.0 e plugin Compose a partir de 2.29.0. O perfil full fixa o Supabase oficial self-hosted/v0.7.2 no commit 549db119c44c25167461812041ba198bde2b31a4. Preserve o conjunto completo de imagens. Atualizar um serviço isolado cria uma variante sob responsabilidade do operador.

O perfil managed conecta um projeto Supabase em supabase.com. Ele precisa fornecer PostgreSQL, Auth, Storage e Realtime e passar na verificação da versão. PostgreSQL sozinho não basta. A pilha local da Supabase CLI serve para desenvolvimento e avaliação, não para produção pública.


![Diagrama: Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.](/documentation/pt-BR/self-hosted-compatibility-flow.svg)

### Verificar antes de executar {#verify-release}

Verifique a tag anotada, os arquivos da release, SHA256SUMS e a assinatura OCI oficial antes de instalar dependências ou executar a versão. Os comandos Bash abaixo começam no checkout da tag escolhida e deixam IMAGE com o digest verificado. Pare se qualquer teste falhar. Instale primeiro o Cosign conforme sua documentação oficial. A verificação comprova a identidade do código e da imagem, não o funcionamento da implantação.

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

### Limites conhecidos do runner na versão publicada {#known-runner-limits}

O runner publicado na v0.11.0 apresenta outros bloqueios à execução de código: rejeita nomes de sandbox com o sufixo de alocação, escreve blocos base64 grandes demais para um único valor de ambiente do Linux e inicializa como root um armazenamento temporário com UID 10001 e modo 0700 depois de remover todas as capabilities. Esse último comando pode falhar sem que o resultado seja verificado, deixando o diretório de trabalho inexistente. Um endpoint de runner saudável não comprova a clonagem nem a execução de código. O candidato atual corrige esses caminhos; o ensaio isolado usou o runner e seu helper de armazenamento atuais por meio de montagens explícitas somente para leitura sobre a imagem v0.11.0. Isso não cria uma imagem publicada corrigida nem uma nova entrada de compatibilidade suportada. Obtenha uma combinação corrigida de release e ferramentas e verifique o fluxo de trabalho com código antes de habilitar esses agentes para uma equipe.

O relay Git da v0.11.0 também omite o desafio HTTP Basic, impedindo que um cliente Git comum envie suas credenciais. A [solução técnica fixada no commit](/pt-br/documentacao/installation#runner-workaround) fornece os arquivos correspondentes do runner e seus hashes; ela não modifica a imagem publicada nem cria uma versão compatível.

A imagem publicada da aplicação inclui Node.js e Git, mas remove intencionalmente npm, npx e Corepack. O perfil Compose de referência também seleciona essa imagem para os workers por meio de AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Isso não basta para um novo worker de código: o bootstrap do OpenCode usa npm para instalar seu runtime e plugin fixados, mesmo em um repositório sem dependências de projeto. Sem npm, a execução para no bootstrap; a conversa não permite concluir que um arquivo do projeto foi alterado ou que um teste passou. Use uma imagem dedicada aos workers, criada e verificada pelo operador, com Node.js 24, npm, Git e as ferramentas exigidas pelo projeto, sobrescrevendo AGENT_RUNNER_SANDBOX_IMAGE no serviço runner. Preserve as restrições de isolamento. Verifique o bootstrap, a clonagem, os testes reais e o diff resultante antes de habilitar a delegação de código. Corrigir os arquivos do runner não fornece essas ferramentas ao worker.

O helper de armazenamento fixado também permite executar arquivos no diretório de trabalho da sandbox. Caso contrário, o Docker monta esse tmpfs com noexec, impedindo a inicialização do binário nativo do OpenCode e podendo apresentar um erro enganoso do pacote musl usado como alternativa. A correção preserva nosuid, nodev, UID/GID 10001, permissões 0700, sistema de arquivos raiz somente para leitura, capabilities removidas e armazenamento descartável separado para cada sandbox. Ela não torna os dados do host executáveis nem transforma a imagem da aplicação em uma imagem adequada para workers.

## Instalar o perfil de servidor de referência {#install-a-server}

Comece por uma tag verificada e seu digest imutável. Linux amd64 e arm64 são aceitos. Reserve 4 GB de RAM, dois núcleos e 20 GB de SSD com Supabase gerenciado; 8 GB, quatro núcleos e 60 GB se ele estiver no mesmo servidor. Serviço público exige DNS e HTTPS nas suas próprias origens. HTTP só é aceito em localhost ou IPv4 privada. Restrinja a uma LAN confiável sem encaminhar portas do roteador. Nesse modo, full expõe aplicação na 80 e API na 8000.


![Diagrama: Release verificada e ambiente protegido. Instalador: perfil full de referência. Supabase oficial, app, agendador, runner. Verificação de conta, arquivos e recuperação.](/documentation/pt-BR/install-a-server-flow.svg)


![Assistente público de instalação com Supabase no mesmo servidor selecionado.](/documentation/pt-BR/install-a-server-wizard.png)

### Configurar e executar o instalador {#install}

Execute pnpm self-host:install no diretório da release. Selecione o perfil managed ou full, a origem da aplicação e o endereço do administrador. Para o perfil full, obtenha primeiro o checkout upstream fixado. O instalador grava um arquivo de ambiente com permissões 0600, gera valores distintos para os segredos ausentes, baixa as imagens do perfil selecionado, inicia os serviços e executa o bootstrap idempotente. Ele preserva a referência fixada da imagem e os segredos existentes. O exemplo usa o digest IMAGE verificado no artigo de compatibilidade. Para receber emails reais do Auth, adicione primeiro --skip-start e configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL e SMTP_SENDER_NAME no arquivo protegido antes de executar a instalação novamente. Mantenha ENABLE_EMAIL_AUTOCONFIRM=false. O valor supabase-mail é um exemplo e não representa uma caixa de email de produção.


Antes de iniciar, compare MINDDY_RELEASE e MINDDY_IMAGE no arquivo protegido com a linha de compatibilidade escolhida e o asset de container verificado. O modelo de v0.11.0 ainda indica 0.10.30. --image altera apenas a referência da imagem; não existe uma opção --release. Em uma instalação nova de v0.11.0 preparada com --skip-start, defina explicitamente MINDDY_RELEASE=0.11.0 e preserve a referência imutável verificada. Não substitua as credenciais geradas nem as chaves de criptografia. A versão do pacote candidato não comprova um perfil 0.11.1 suportado: este snapshot não contém a linha de compatibilidade correspondente.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


O comando anterior cria deploy/self-hosted/.env no diretório da release escolhida. Edite esse arquivo protegido antes de iniciar. Para a variante técnica v0.11.0 descrita aqui, pare o instalador automático depois da configuração: siga [o procedimento fixado do runner e dos workers](/pt-br/documentacao/installation#runner-workaround) e, em seguida, [a inicialização explícita do perfil full](/pt-br/documentacao/installation#adapted-start). Não execute novamente o instalador histórico sem --skip-start: ele omite o overlay necessário e não consegue concluir esta variante. As origens, a imagem e os segredos existentes permanecem no arquivo protegido.

### Verificar antes de receber usuários {#accept}

Os perfis de referência incluem o agendador e o runner de sandbox confiável. Não exponha a porta 6464 do runner nem o PostgreSQL à Internet. Execute o doctor com o arquivo de ambiente da instância e o arquivo Compose upstream do perfil full. Verifique a confirmação da conta, o login, a autenticação MFA, a redefinição da senha, a criação de projetos e issues, o envio e o download de anexos e o Realtime em duas sessões. Uma resposta 200 de /api/health comprova apenas que a aplicação está ativa. Se a instalação for interrompida, retome a sequência adaptada explícita com o mesmo contexto Compose e o arquivo de ambiente protegido; não apague os dados. Antes de receber uma equipe, prepare um backup em outro host e verifique a restauração em um destino vazio.

### Pré-requisitos do runner para o perfil de servidor {#install-a-server-known-runner-limits}

Antes de habilitar o trabalho de código, leia os [limites do runner v0.11.0](#known-runner-limits) e aplique a [variante técnica fixada](#runner-workaround). Um endpoint saudável não comprova clonagem ou execução; essa variante não cria uma nova versão compatível.

### Aplicar a solução técnica fixada no commit {#runner-workaround}

Para a imagem publicada v0.11.0, esta variante explícita das ferramentas também fornece o desafio Basic necessário para os clientes Git HTTP. Ela está fixada no commit de origem 89ab340cb10ec729948fc6e596fb7ab0326fc470; não é uma nova imagem publicada nem uma nova linha de compatibilidade. Prepare primeiro a configuração básica e aplique esta variante antes de iniciar a pilha full. Os dois arquivos devem permanecer juntos, com os hashes verificados, em armazenamento persistente. Estes comandos não expõem nenhuma porta do runner.

Primeiro, defina o contexto da instância no [procedimento de backup do perfil de referência](/pt-br/documentacao/backups-and-restoration#context). A função Compose deve incluir RUNNER_FIX_OVERRIDE. Em seguida, baixe e verifique os dois arquivos públicos abaixo. Interrompa o procedimento se algum hash não corresponder.

Este procedimento também cria uma imagem separada para os workers de código. A imagem base é fixada, mas os pacotes Debian são resolvidos durante a construção; obtenha o ID da imagem Docker resultante e preserve essa imagem exata com o backup. Nunca a substitua pela imagem da aplicação depois de uma restauração. A construção exige acesso ao registro da imagem base e aos repositórios Debian; um novo bootstrap do OpenCode também exige o registro npm. A receita fornece as ferramentas do bootstrap, não todas as dependências dos projetos. Outras ferramentas de compilação exigem uma variante mantida explicitamente. O overlay Compose abaixo define diretamente a variável de imagem do serviço runner, pois o arquivo Compose histórico ignora um valor AGENT_RUNNER_SANDBOX_IMAGE isolado no arquivo protegido.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

O comando compose up recria apenas o runner. Sua resposta de saúde ainda não basta para a validação: verifique uma nova sandbox, a clonagem do repositório, um arquivo maior que 1 MiB, os testes e o diff resultante antes de habilitar agentes de código. Mantenha RUNNER_FIX_OVERRIDE e RUNNER_FIX_DIR em cada shell de operação. O instalador histórico e a ferramenta de atualização não utilizam esse override do shell; depois que um deles modificar ou recriar o runner, aplique novamente este comando Compose. Inclua os dois arquivos e o override no backup criptografado e restabeleça os caminhos absolutos antes de reiniciar o runner.

O procedimento exige a imagem dedicada aos workers descrita nos [limites da versão publicada](#known-runner-limits). A imagem da aplicação continua sem npm, npx e Corepack: corrigir os arquivos do runner não basta para o bootstrap do código. Preserve o isolamento e verifique bootstrap, clonagem, testes e diff antes de habilitar a delegação.

### Iniciar o perfil full adaptado explicitamente {#adapted-start}

O instalador v0.11.0 sem alterações não consegue concluir esta variante técnica: sua imagem não contém o helper, o pin da função difere da dependência fixada e ele não aceita o overlay do runner acima. Para esta variante, prepare a configuração com --skip-start e aplique as ferramentas fixadas antes da primeira inicialização. Use a sequência full abaixo em vez de executar novamente o instalador histórico sem --skip-start. A substituição do pin altera explicitamente as ferramentas de implantação, não a tag publicada. Preserve o pin original com as provas da release.

Se você executar este perfil full no macOS com Docker Desktop, aplique o [override de volume para Storage em sistema de arquivos](/pt-br/documentacao/storage-and-attachments#docker-desktop) antes da primeira inicialização e mantenha RESTORE_OVERRIDE junto com o override do runner. A montagem por bind em um host Linux e este perfil com volume nomeado exigem arquivos de bytes diferentes; use o procedimento de backup e restauração correspondente.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

O wrapper lê o arquivo protegido como dados, calcula as URLs privadas de manutenção com os mesmos helpers exportados pelo instalador e executa o bootstrap original com os pré-requisitos do agendador. Seu log de diagnóstico mantém permissões 0600; não o anexe a um relatório público sem revisá-lo e remover dados sensíveis. Uma fase que falhe deve interromper o procedimento. O doctor deve usar o mesmo contexto adaptado; ele verifica os serviços, não a validação do worker de código nem a entrega por provedores externos.

O helper de armazenamento fixado também permite executar arquivos no diretório de trabalho da sandbox. Caso contrário, o Docker monta esse tmpfs com noexec, impedindo a inicialização do binário nativo do OpenCode e podendo apresentar um erro enganoso do pacote musl usado como alternativa. A correção preserva nosuid, nodev, UID/GID 10001, permissões 0700, sistema de arquivos raiz somente para leitura, capabilities removidas e armazenamento descartável separado para cada sandbox. Ela não torna os dados do host executáveis nem transforma a imagem da aplicação em uma imagem adequada para workers.

## Instalar com Supabase gerenciado ou pelo código-fonte {#managed-or-source-installation}

Supabase gerenciado indica quem opera o backend. Pode ser usado com a imagem OCI oficial ou com um servidor compilado a partir do código. Separe esses tipos de implantação nos registros de instalação e aceitação. O backend precisa fornecer PostgreSQL, Auth, Storage e Realtime. O caminho OCI managed guiado exige um projeto em supabase.com, sua URL pública, chaves anon e service-role e uma conexão PostgreSQL acessível pelas ferramentas de bootstrap. Use seu próprio projeto, nunca credenciais do minddy Cloud.

![Diagrama: Seu projeto Supabase gerenciado. PostgreSQL, Auth, Storage, Realtime. Perfil OCI OU aplicação de tag. Tarefas e backup conforme perfil.](/documentation/pt-BR/managed-or-source-installation-flow.svg)

### Configurar Supabase gerenciado {#managed}

Execute o comando abaixo a partir da versão verificada. IMAGE é o digest conferido no artigo de compatibilidade; ... indica valores de exemplo que você deve substituir. Obtenha as credenciais reais em privado e mantenha-as fora do histórico do shell e de logs compartilhados. O instalador conserva o ambiente existente, inclui agendador e runner e não ativa serviços opcionais sem configuração. Configure SMTP Auth e os redirects exatos separadamente no projeto Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

### Concluir implantação pelo código-fonte {#source}

Para instalar a partir do código, instale as dependências fixadas da tag, forneça o ambiente minddy e Supabase, execute bootstrap e build e inicie o servidor de produção atrás de um proxy. Defina MINDDY_PUBLIC_* antes de iniciar. Você precisa fornecer um agendador persistente com as chamadas autenticadas descritas no artigo de rede: um build não executa jobs. Verifique migrações e Storage, depois Auth, issues, bytes dos anexos e Realtime. Use o procedimento lógico ou do provedor para backup. Um servidor de código não valida a instalação OCI.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
