---
{
  "id": "self-hosted-compatibility",
  "locale": "pt-BR",
  "title": "Escolher uma versão e um perfil de instalação compatíveis",
  "summary": "Use uma versão imutável do repositório público mangue-dev/minddy.",
  "topic": "Operar uma instância",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/self-hosted-compatibility-flow.svg",
      "alt": "Diagrama: Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.",
      "caption": "Siga as etapas nesta ordem. Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow"
  ]
}
---

## Escolher uma versão e um perfil de instalação compatíveis {#self-hosted-compatibility}

Use uma versão imutável do repositório público mangue-dev/minddy. A linha v0.11.0 aceita servidores Linux amd64 e arm64, Node.js 24, pnpm 10.28.0, Docker Engine a partir de 27.0.0 e plugin Compose a partir de 2.29.0. O perfil full fixa o Supabase oficial self-hosted/v0.7.2 no commit 549db119c44c25167461812041ba198bde2b31a4. Preserve o conjunto completo de imagens. Atualizar um serviço isolado cria uma variante sob responsabilidade do operador.

O perfil managed conecta um projeto Supabase em supabase.com. Ele precisa fornecer PostgreSQL, Auth, Storage e Realtime e passar na verificação da versão. PostgreSQL sozinho não basta. A pilha local da Supabase CLI serve para desenvolvimento e avaliação, não para produção pública.


![Diagrama: Tag de código anotada. Arquivos e SHA256SUMS. Assinatura e digest OCI oficiais. Perfil de compatibilidade escolhido.](/documentation/pt-BR/self-hosted-compatibility-flow.svg)

## Verificar antes de executar {#verify-release}

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

## Planejar operação e atualizações {#support}

Instale uma versão publicada de cada vez. As migrações avançam apenas; um retorno incompatível restaura banco, Storage, configuração e aplicação como um conjunto correspondente. A Minddy mantém ferramentas de release e oferece ajuda sem garantia para falhas reproduzíveis do núcleo. Você opera DNS, TLS, capacidade, backups, ensaios de restauração e provedores opcionais. Uma tag móvel ou pilha Supabase derivada não herda o contrato de suporte.

## Limites conhecidos do runner na versão publicada {#known-runner-limits}

O runner publicado na v0.11.0 apresenta outros bloqueios à execução de código: rejeita nomes de sandbox com o sufixo de alocação, escreve blocos base64 grandes demais para um único valor de ambiente do Linux e inicializa como root um armazenamento temporário com UID 10001 e modo 0700 depois de remover todas as capabilities. Esse último comando pode falhar sem que o resultado seja verificado, deixando o diretório de trabalho inexistente. Um endpoint de runner saudável não comprova a clonagem nem a execução de código. O candidato atual corrige esses caminhos; o ensaio isolado usou o runner e seu helper de armazenamento atuais por meio de montagens explícitas somente para leitura sobre a imagem v0.11.0. Isso não cria uma imagem publicada corrigida nem uma nova entrada de compatibilidade suportada. Obtenha uma combinação corrigida de release e ferramentas e verifique o fluxo de trabalho com código antes de habilitar esses agentes para uma equipe.

O relay Git da v0.11.0 também omite o desafio HTTP Basic, impedindo que um cliente Git comum envie suas credenciais. A [solução técnica fixada no commit](/pt-br/documentacao/install-a-server#runner-workaround) fornece os arquivos correspondentes do runner e seus hashes; ela não modifica a imagem publicada nem cria uma versão compatível.

A imagem publicada da aplicação inclui Node.js e Git, mas remove intencionalmente npm, npx e Corepack. O perfil Compose de referência também seleciona essa imagem para os workers por meio de AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Isso não basta para um novo worker de código: o bootstrap do OpenCode usa npm para instalar seu runtime e plugin fixados, mesmo em um repositório sem dependências de projeto. Sem npm, a execução para no bootstrap; a conversa não permite concluir que um arquivo do projeto foi alterado ou que um teste passou. Use uma imagem dedicada aos workers, criada e verificada pelo operador, com Node.js 24, npm, Git e as ferramentas exigidas pelo projeto, sobrescrevendo AGENT_RUNNER_SANDBOX_IMAGE no serviço runner. Preserve as restrições de isolamento. Verifique o bootstrap, a clonagem, os testes reais e o diff resultante antes de habilitar a delegação de código. Corrigir os arquivos do runner não fornece essas ferramentas ao worker.

O helper de armazenamento fixado também permite executar arquivos no diretório de trabalho da sandbox. Caso contrário, o Docker monta esse tmpfs com noexec, impedindo a inicialização do binário nativo do OpenCode e podendo apresentar um erro enganoso do pacote musl usado como alternativa. A correção preserva nosuid, nodev, UID/GID 10001, permissões 0700, sistema de arquivos raiz somente para leitura, capabilities removidas e armazenamento descartável separado para cada sandbox. Ela não torna os dados do host executáveis nem transforma a imagem da aplicação em uma imagem adequada para workers.
