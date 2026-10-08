---
{
  "id": "back-up-the-reference-instance",
  "locale": "pt-BR",
  "title": "Criar backup a frio do perfil full em arquivos",
  "summary": "Este procedimento Linux se aplica apenas ao perfil full com Storage em filesystem da distribuição oficial do Supabase fixada pela matriz.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11"
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
      "docs/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "logical-and-provider-backups",
    "restore-and-roll-back",
    "update-an-instance"
  ],
  "aliases": [
    "self-hosting-operations"
  ],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Criar backup a frio do perfil full em arquivos {#back-up-the-reference-instance}

Este procedimento Linux se aplica apenas ao perfil full com Storage em filesystem da distribuição oficial do Supabase fixada pela matriz. A restauração física exige a mesma arquitetura e a imagem exata do PostgreSQL. Para managed, S3 e instalações a partir do código, use o caminho lógico ou do provedor. Avise sobre a interrupção das gravações e pare também os workers externos. Escolha um destino cifrado, com espaço suficiente e fora dos dados ativos. Nunca execute down --volumes na origem. A cópia inclui banco, Auth, metadados e bytes do Storage, migrações, políticas, chaves Vault, configuração e identidades das versões.

## Definir o contexto Compose instalado {#context}

Substitua os caminhos e a versão do exemplo pelos da instância instalada. Defina MODE=full e inclua qualquer override de restauração em todos os comandos Compose. Usar apenas o Compose upstream omite o overlay e o ambiente do Minddy. Não execute o arquivo de ambiente como código shell e não o imprima. A sequência abaixo para todos os serviços antes de copiar os arquivos do PostgreSQL.

```bash
set -euo pipefail
export MODE=full
export CURRENT_RELEASE_DIR=/srv/minddy/releases/vX.Y.Z
export SUPABASE_DIR=/srv/minddy/supabase
export MINDDY_ENV_FILE=/etc/minddy/instance.env
export BACKUP_ROOT=/mnt/backup/minddy
compose() {
  local files=()
  if [ "$MODE" = full ]; then
    files+=(-f "$SUPABASE_DIR/docker/docker-compose.yml")
  fi
  files+=(-f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.$MODE.yml")
  if [ -n "${RESTORE_OVERRIDE:-}" ]; then
    files+=(-f "$RESTORE_OVERRIDE")
  fi
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
compose ps
```

## Selar o conjunto correspondente {#backup}

Execute a cópia abaixo com as gravações interrompidas. Registre código e imagens, arquive os dados e o volume db-config e preserve os arquivos de implantação e o ambiente protegido. Se não encontrar db-config, interrompa. Conserve os assets verificados, os digests OCI e a imagem do banco pelo digest. Como o backup contém a chave raiz e os dados cifrados, sua confidencialidade depende da criptografia externa e dos controles de acesso.

```bash
export BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR"
compose ps --format json > "$BACKUP_DIR/services.json"
compose images --format json > "$BACKUP_DIR/images.json"
git -C "$CURRENT_RELEASE_DIR" rev-parse HEAD > "$BACKUP_DIR/source-commit.txt"
git -C "$SUPABASE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
DB_CONTAINER="$(compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_CONFIG_VOLUME"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/postgres-image-id.txt"
STORAGE_CONTAINER="$(compose ps -q storage)"
test -n "$STORAGE_CONTAINER"
STORAGE_VOLUME="$(docker inspect "$STORAGE_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}')"
compose stop
sudo tar --numeric-owner --acls --xattrs -C "$SUPABASE_DIR" \
  -czf "$BACKUP_DIR/supabase-docker.tar.gz" docker
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/instance.env"
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" -czf - -C /keys . > "$BACKUP_DIR/db-config.tar.gz"
if [ -n "$STORAGE_VOLUME" ]; then
  docker run --rm --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$STORAGE_VOLUME,dst=/objects,readonly" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /objects . \
    > "$BACKUP_DIR/storage-volume.tar.gz"
fi
tar -C "$CURRENT_RELEASE_DIR" -czf "$BACKUP_DIR/deployment.tar.gz" deploy/self-hosted
if [ -n "${RESTORE_OVERRIDE:-}" ]; then
  install -m 0600 "$RESTORE_OVERRIDE" "$BACKUP_DIR/source-volume-override.yml"
fi
if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
  test -n "${RUNNER_FIX_DIR:-}"
  install -m 0600 "$RUNNER_FIX_OVERRIDE" "$BACKUP_DIR/runner-fix-override.yml"
  tar -C "$RUNNER_FIX_DIR" -czf "$BACKUP_DIR/runner-fix-files.tar.gz" \
    agent-runner.mjs agent-runner-storage.mjs SHA256SUMS Dockerfile.agent-sandbox sandbox-image.txt functions-bundle.json functions-bundle.tagged.json
  docker image save "$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")" | gzip > "$BACKUP_DIR/runner-sandbox-image.tar.gz"
fi
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/supabase-docker.tar.gz"
(
  cd "$BACKUP_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

## Verificar o resultado {#verify}

Copie o conjunto selado para um disco ou host independente e verifique SHA256SUMS no destino. Uma segunda cópia no mesmo host não protege contra a perda desse host. Conserve certificados TLS separadamente se sua política exigir. Se a operação for apenas backup, retome com compose up -d --wait depois de verificar. Antes de confiar na cópia, restaure-a em um destino vazio e isolado, entre com MFA e confira issues e anexos com os mesmos SHA-256. Preserve também as chaves históricas.


Se a instância usa a solução fixada para o runner, preserve RUNNER_FIX_OVERRIDE e RUNNER_FIX_DIR junto com qualquer override de restauração. Esses arquivos fazem parte do conjunto de recuperação. Restabeleça os caminhos absolutos ou ajuste explicitamente as duas montagens para o novo local antes de iniciar o runner.

O comando de backup a frio também detecta um volume nomeado do Storage em sistema de arquivos e arquiva seus bytes separadamente. Uma montagem por bind continua coberta por supabase-docker.tar.gz. Nenhum dos casos cobre um backend S3 ou de um provedor.
