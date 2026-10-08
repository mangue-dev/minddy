---
{
  "id": "restore-and-roll-back",
  "locale": "pt-BR",
  "title": "Restaurar um conjunto completo em alvo vazio",
  "summary": "A restauração substitui os dados do destino e não mescla duas instâncias.",
  "topic": "Operar uma instância",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H14"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "logical-and-provider-backups",
    "update-an-instance"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/pt-BR/restore-and-roll-back-flow.svg",
      "alt": "Diagrama: Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.",
      "caption": "Siga as etapas nesta ordem. Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.",
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
    "restore-and-roll-back-flow"
  ]
}
---

## Restaurar um conjunto completo em alvo vazio {#restore-and-roll-back}

A restauração substitui os dados do destino e não mescla duas instâncias. Recupere a cópia externa selada, verifique SHA256SUMS e preserve a origem. Pare entradas, agendador e workers do destino. A restauração física full exige a arquitetura e a imagem do banco salvas. Prepare a tag e o upstream fixado em diretórios novos, com dependências fixadas. Confirme que não existem diretórios de banco, objetos Storage ou volume db-config no destino. Não inicie o instalador ou bootstrap normal antes de extrair o backup físico.

![Diagrama: Backup externo completo verificado. Alvo vazio isolado com versões iguais. Restaurar banco, bytes e chaves juntos. Verificar conta, conteúdo e arquivos antes de abrir.](/documentation/pt-BR/restore-and-roll-back-flow.svg)

## Restaurar arquivos do perfil full {#physical}

Antes da sequência física, defina o contexto Compose da origem como no artigo de backup a frio. Use então caminhos e volumes de destino novos. A sequência remove os containers já parados da origem sem remover seus volumes, restaura PostgreSQL a frio e Storage juntos, recupera db-config com a imagem salva e compara a imagem antes de iniciar. No arquivo protegido, altere somente caminhos, origens e redirects Auth. Preserve JWT, senhas, chaves Vault e da aplicação e identidades de versão e imagem. Inclua sempre RESTORE_OVERRIDE: omiti-lo pode selecionar volumes da origem. Recompile a função offline, inicie dependências, aplicação e runner e verifique em manutenção antes de abrir as entradas.


Antes do primeiro compose down, defina [o contexto Compose instalado da instância de origem](/pt-br/documentacao/back-up-the-reference-instance#context), incluindo seu override existente.

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

## Restaurar um conjunto lógico {#logical}

Para uma restauração lógica, prepare uma stack vazia com versões, configurações e chaves registradas. Antes de importar SQL, confira a identidade do banco e do backend Storage bruto de destino. Restaure papéis, esquema e dados em transação, depois histórico de migrações e políticas. Pare Storage e recupere arquivos ou snapshot S3 em um backend novo e vazio; não envie por API. Managed exige o processo suportado pelo provedor, e não a extração filesystem do exemplo. Use o commit salvo do Minddy e configure chaves e origens do destino isolado.


Os comandos abaixo de extração lógica, run.sh e Storage filesystem servem apenas para backend controlado pelo operador. Com Supabase gerenciado, restaure banco e bytes brutos em um destino vazio do provedor usando seu processo suportado; depois configure e inicie Minddy pelo [procedimento de código](/pt-br/documentacao/managed-or-source-installation#source). Não execute Compose local para um projeto supabase.com.

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


Após o build de código e a verificação acima, inicie a aplicação recuperada com pnpm start ou o supervisor registrado no [procedimento de código](/pt-br/documentacao/managed-or-source-installation#source). Mantenha entradas públicas e jobs fechados até passar nas verificações abaixo.

## Verificar o resultado {#verify}

Compare contagens, entre com contas e MFA restauradas, leia projeto, issue e página cifrados e baixe uma amostra de cada bucket conferindo o SHA-256. Teste integrações, revogações, Realtime, jobs, OAuth, MCP e callbacks. Registre caminhos, volumes, versões, duração e janela observada de perda de dados. Após erro de migração, use o conjunto anterior. Gravações posteriores à cópia podem se perder no rollback. Não invente SQL inverso nem considere containers saudáveis uma prova de restauração.
