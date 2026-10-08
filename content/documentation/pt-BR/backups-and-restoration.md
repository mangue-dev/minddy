---
{
  "id": "backups-and-restoration",
  "locale": "pt-BR",
  "title": "Backups e restauração",
  "summary": "Preserve o banco de dados, o Storage, a configuração e as chaves de criptografia, escolha um método de backup e restaure um conjunto completo em um destino vazio.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11",
    "H12",
    "H14"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "update-an-instance"
  ],
  "aliases": [
    "back-up-the-reference-instance",
    "self-hosting-operations",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "tags": [
    "Criar backup a frio do perfil full em arquivos",
    "Criar backups lógicos ou gerenciados pelo provedor",
    "Restaurar um conjunto completo em um destino vazio",
    "Restaurar um conjunto completo em alvo vazio"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/restore-and-roll-back-flow.svg",
      "alt": "Diagrama: Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.",
      "caption": "Siga as etapas nesta ordem. Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.",
      "revision": 2,
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
    "restore-and-roll-back-flow"
  ]
}
---

Um backup recuperável inclui banco de dados, bytes do Storage, configuração e as chaves correspondentes. Escolha o procedimento físico do perfil full ou o procedimento lógico ou do provedor conforme sua instalação. A restauração exige um destino vazio e substitui seus dados; teste o conjunto completo antes de confiar na cópia.

## Criar backup a frio do perfil full em arquivos {#back-up-the-reference-instance}

Este procedimento Linux se aplica apenas ao perfil full com Storage em filesystem da distribuição oficial do Supabase fixada pela matriz. A restauração física exige a mesma arquitetura e a imagem exata do PostgreSQL. Para managed, S3 e instalações a partir do código, use o caminho lógico ou do provedor. Avise sobre a interrupção das gravações e pare também os workers externos. Escolha um destino cifrado, com espaço suficiente e fora dos dados ativos. Nunca execute down --volumes na origem. A cópia inclui banco, Auth, metadados e bytes do Storage, migrações, políticas, chaves Vault, configuração e identidades das versões.

### Definir o contexto Compose instalado {#context}

Substitua os caminhos e a versão do exemplo pelos da instância instalada. Defina MODE=full e inclua qualquer override de restauração em todos os comandos Compose. Usar apenas o Compose upstream omite o overlay e o ambiente do minddy. Não execute o arquivo de ambiente como código shell e não o imprima. A sequência abaixo para todos os serviços antes de copiar os arquivos do PostgreSQL.

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

### Concluir e verificar o backup {#backup}

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

### Verificar o resultado {#verify}

Copie o conjunto selado para um disco ou host independente e verifique SHA256SUMS no destino. Uma segunda cópia no mesmo host não protege contra a perda desse host. Conserve certificados TLS separadamente se sua política exigir. Se a operação for apenas backup, retome com compose up -d --wait depois de verificar. Antes de confiar na cópia, restaure-a em um destino vazio e isolado, entre com MFA e confira issues e anexos com os mesmos SHA-256. Preserve também as chaves históricas.


Se a instância usa a solução fixada para o runner, preserve RUNNER_FIX_OVERRIDE e RUNNER_FIX_DIR junto com qualquer override de restauração. Esses arquivos fazem parte do conjunto de recuperação. Restabeleça os caminhos absolutos ou ajuste explicitamente as duas montagens para o novo local antes de iniciar o runner.

O comando de backup a frio também detecta um volume nomeado do Storage em sistema de arquivos e arquiva seus bytes separadamente. Uma montagem por bind continua coberta por supabase-docker.tar.gz. Nenhum dos casos cobre um backend S3 ou de um provedor.

## Criar backups lógicos ou gerenciados pelo provedor {#logical-and-provider-backups}

Para instalações a partir do código, bancos gerenciados e Storage personalizado, associe os comandos de banco, bytes e proxy à mesma instância. self-host:backup, self-host:update e self-host:restore são verificações preliminares de leitura: não executam essas operações. Um backup completo conserva PostgreSQL com auth, storage e histórico de migrações, bytes brutos dos arquivos, configuração, chaves e identidades exatas do minddy e do Supabase no mesmo ponto, sem gravações concorrentes.

### Supabase gerenciado por um provedor {#provider}

Para Supabase gerenciado, registre projeto, versão do banco, identificador do backup ou snapshot e ponto de recuperação. Feche minddy, workers e gravações agendadas; depois use os controles de consistência ou manutenção suportados pelo provedor para gravações diretas de Auth, PostgREST e Storage. Se não estiverem disponíveis, registre a limitação: parar apenas a aplicação não basta. Use os exports SQL abaixo somente se o papel do banco e o provedor os suportarem, incluindo Auth, metadados Storage, histórico de migrações e políticas gerenciadas. Preserve os bytes brutos dos objetos separadamente por export suportado ou snapshot imutável do backend. Guarde ambiente protegido e chaves minddy, além das definições Auth/SMTP, URL, proxy e jobs sob seu controle. Papéis da plataforma e chaves pgsodium podem pertencer ao provedor; não os apresente como arquivos locais. Os blocos abaixo com SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium e tar filesystem servem apenas para backend controlado pelo operador. Valide a restauração completa em um projeto vazio separado antes de confiar na cópia. Nenhum backup ou restore de provedor foi executado para esta revisão.

### Bloquear escritas e exportar SQL {#outage}

Feche aplicação, workers, agendador e API pública. Parar apenas o servidor web deixa as gravações do PostgREST e do Storage abertas. Defina SUPABASE_DB_URL em privado e escolha uma BACKUP_DIR nova e cifrada. Exporte SQL com as ferramentas da versão instalada. Cada arquivo SQL precisa ser não vazio; data.sql deve conter instruções COPY para auth.users, storage.objects e tabelas da aplicação. A exportação comum omite o histórico de migrações, por isso são necessárias as duas exportações separadas mostradas. Preserve também as políticas gerenciadas do Storage e do Realtime.

```bash
set -euo pipefail
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export BACKUP_ROOT=/mnt/backup/minddy
export FROM_TAG=v0.11.0
```

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

```bash
cd "$MINDDY_REPO"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/data.sql" --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_data.sql" --use-copy --data-only \
  --schema supabase_migrations
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/export-managed-policies.sql \
  > "$BACKUP_DIR/database/managed_policies.sql"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$BACKUP_DIR/database/counts.json"
```

### Preservar bytes e configuração {#bytes}

Se você administra um Storage em filesystem, pare storage e imgproxy após exportar SQL e arquive o diretório preservando proprietários numéricos, ACLs e atributos estendidos. Em S3, crie um snapshot ou uma versão imutável dos bytes brutos. Não restaure por /storage/v1/s3, pois isso cria metadados que conflitam com os restaurados. O provedor controla papéis e arquivos da plataforma: use seu procedimento suportado e registre o alcance. Copie em privado configurações do minddy e do Supabase, proxy, jobs, templates Auth, SMTP e eventual chave raiz pgsodium. Inclua MINDDY_DATA_ROOT_KEY e os demais segredos preservados. O SQL não contém os bytes dos anexos.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
if docker compose exec -T db test -f /etc/postgresql-custom/pgsodium_root.key; then
  docker compose exec -T db cat /etc/postgresql-custom/pgsodium_root.key \
    > "$BACKUP_DIR/config/pgsodium_root.key"
  chmod 0600 "$BACKUP_DIR/config/pgsodium_root.key"
fi
```

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
```

### Verificar o resultado {#logical-and-provider-backups-verify}

Gere e verifique SHA256SUMS no conjunto completo, cifre-o, copie para fora do host e verifique novamente. Registre versões, imagens, contagens e hashes das amostras. Uma exportação bem-sucedida não comprova restauração. Teste em um destino vazio com as versões e a configuração salvas antes de confiar no backup; documente os limites do provedor.

## Restaurar um conjunto completo em um destino vazio {#restore-and-roll-back}

A restauração substitui os dados do destino e não mescla duas instâncias. Recupere a cópia externa selada, verifique SHA256SUMS e preserve a origem. Pare entradas, agendador e workers do destino. A restauração física full exige a arquitetura e a imagem do banco salvas. Prepare a tag e o upstream fixado em diretórios novos, com dependências fixadas. Confirme que não existem diretórios de banco, objetos Storage ou volume db-config no destino. Não inicie o instalador ou bootstrap normal antes de extrair o backup físico.

![Diagrama: Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.](/documentation/pt-BR/restore-and-roll-back-flow.svg)

### Restaurar arquivos do perfil full {#physical}

Antes da sequência física, defina o contexto Compose da origem como no artigo de backup a frio. Use então caminhos e volumes de destino novos. A sequência remove os containers já parados da origem sem remover seus volumes, restaura PostgreSQL a frio e Storage juntos, recupera db-config com a imagem salva e compara a imagem antes de iniciar. No arquivo protegido, altere somente caminhos, origens e redirects Auth. Preserve JWT, senhas, chaves Vault e da aplicação e identidades de versão e imagem. Inclua sempre RESTORE_OVERRIDE: omiti-lo pode selecionar volumes da origem. Recompile a função offline, inicie dependências, aplicação e runner e verifique em manutenção antes de abrir as entradas.


Antes do primeiro compose down, defina [o contexto Compose instalado da instância de origem](/pt-br/documentacao/backups-and-restoration#context), incluindo seu override existente.

Se storage-volume.tar.gz existir, restaure o arquivo em um novo volume Linux nomeado e conecte esse volume exato pelo override persistente antes de iniciar Storage. A verificação de destino vazio também se aplica a esse volume.

```bash
compose down
export CURRENT_RELEASE_DIR=/srv/minddy/releases/saved-source
export SUPABASE_DIR=/srv/minddy/supabase-restored
export MINDDY_ENV_FILE=/etc/minddy/restored.env
export RESTORE_OVERRIDE=/etc/minddy/restore-volumes.yml
export RESTORE_DB_CONFIG=minddy-restored-db-config
(cd "$BACKUP_DIR"; sha256sum --check SHA256SUMS)
test ! -d "$SUPABASE_DIR/docker/volumes/db/data"
test -z "$(find "$SUPABASE_DIR/docker/volumes/storage" -type f -print -quit 2>/dev/null)"
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing restore volume." >&2
  exit 1
fi
sudo tar --numeric-owner --acls --xattrs -xzf "$BACKUP_DIR/supabase-docker.tar.gz" \
  -C "$SUPABASE_DIR"
install -m 0600 "$BACKUP_DIR/instance.env" "$MINDDY_ENV_FILE"
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  : "${RUNNER_FIX_DIR:?Set the new absolute restore runner tooling directory}"
  : "${RUNNER_FIX_OVERRIDE:?Set its new absolute restore runner override path}"
  test "$RUNNER_FIX_OVERRIDE" = "$RUNNER_FIX_DIR/compose.runner-fix.yml"
  test ! -e "$RUNNER_FIX_DIR"
  sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
  tar -xzf "$BACKUP_DIR/runner-fix-files.tar.gz" -C "$RUNNER_FIX_DIR"
  (cd "$RUNNER_FIX_DIR"; sha256sum --check SHA256SUMS)
  gzip -dc "$BACKUP_DIR/runner-sandbox-image.tar.gz" | docker image load
  export RUNNER_SANDBOX_IMAGE="$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")"
  docker image inspect "$RUNNER_SANDBOX_IMAGE" >/dev/null
  install -m 0600 "$BACKUP_DIR/runner-fix-override.yml" \
    "$RUNNER_FIX_DIR/compose.runner-fix.source.yml"
  cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: $RUNNER_SANDBOX_IMAGE
    volumes:
      - $RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro
      - $RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro
EOF
  chmod 0600 "$RUNNER_FIX_OVERRIDE"
fi
cat > "$RESTORE_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
  deno-cache:
    name: minddy-restored-deno-cache
  caddy_data:
    name: minddy-restored-caddy-data
  caddy_config:
    name: minddy-restored-caddy-config
EOF
compose() {
  local files=(
    -f "$SUPABASE_DIR/docker/docker-compose.yml"
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml"
    -f "$RESTORE_OVERRIDE"
  )
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" -xzf - -C /keys < "$BACKUP_DIR/db-config.tar.gz"
if [ -f "$BACKUP_DIR/storage-volume.tar.gz" ]; then
  export RESTORE_STORAGE_VOLUME=minddy-restored-filesystem-storage
  if docker volume inspect "$RESTORE_STORAGE_VOLUME" >/dev/null 2>&1; then
    echo "Refusing to overwrite an existing Storage restore volume." >&2
    exit 1
  fi
  docker volume create "$RESTORE_STORAGE_VOLUME"
  docker run --rm -i --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$RESTORE_STORAGE_VOLUME,dst=/objects" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /objects \
    < "$BACKUP_DIR/storage-volume.tar.gz"
  cat >> "$RESTORE_OVERRIDE" <<EOF
  $RESTORE_STORAGE_VOLUME:
    external: true
services:
  storage:
    volumes:
      - $RESTORE_STORAGE_VOLUME:/var/lib/storage
EOF
fi
compose create db
test "$(docker inspect "$(compose ps --all -q db)" --format '{{.Image}}')" = \
  "$BACKUP_HELPER_IMAGE"
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" \
    "$CURRENT_RELEASE_DIR/deploy/self-hosted/functions-bundle.json"
fi
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

### Restaurar um conjunto lógico {#logical}

Para uma restauração lógica, prepare uma stack vazia com versões, configurações e chaves registradas. Antes de importar SQL, confira a identidade do banco e do backend Storage bruto de destino. Restaure papéis, esquema e dados em transação, depois histórico de migrações e políticas. Pare Storage e recupere arquivos ou snapshot S3 em um backend novo e vazio; não envie por API. Managed exige o processo suportado pelo provedor, e não a extração filesystem do exemplo. Use o commit salvo do minddy e configure chaves e origens do destino isolado.


Os comandos abaixo de extração lógica, run.sh e Storage filesystem servem apenas para backend controlado pelo operador. Com Supabase gerenciado, restaure banco e bytes brutos em um destino vazio do provedor usando seu processo suportado; depois configure e inicie minddy pelo [procedimento de código](/pt-br/documentacao/installation#source). Não execute Compose local para um projeto supabase.com.

```bash
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select current_database(), inet_server_addr(), version()'
```

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/roles.sql" \
  --file "$BACKUP_DIR/database/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/database/data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/history_schema.sql" \
  --file "$BACKUP_DIR/database/history_data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/managed_policies.sql" \
  --dbname "$RESTORE_DB_URL"
```

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

```bash
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
export MINDDY_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export MINDDY_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export MINDDY_PUBLIC_APP_URL="$RESTORE_APP_URL"
pnpm install --frozen-lockfile
pnpm build
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```


Após o build de código e a verificação acima, inicie a aplicação recuperada com pnpm start ou o supervisor registrado no [procedimento de código](/pt-br/documentacao/installation#source). Mantenha entradas públicas e jobs fechados até passar nas verificações abaixo.

### Verificar o resultado {#restore-and-roll-back-verify}

Compare contagens, entre com contas e MFA restauradas, leia projeto, issue e página cifrados e baixe uma amostra de cada bucket conferindo o SHA-256. Teste integrações, revogações, Realtime, jobs, OAuth, MCP e callbacks. Registre caminhos, volumes, versões, duração e janela observada de perda de dados. Após erro de migração, use o conjunto anterior. Gravações posteriores à cópia podem se perder no rollback. Não invente SQL inverso nem considere containers saudáveis uma prova de restauração.
