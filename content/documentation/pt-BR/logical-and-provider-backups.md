---
{
  "id": "logical-and-provider-backups",
  "locale": "pt-BR",
  "title": "Criar backups lógicos ou gerenciados pelo provedor",
  "summary": "Para instalações a partir do código, bancos gerenciados e Storage personalizado, associe os comandos de banco, bytes e proxy à mesma instância.",
  "topic": "Operar uma instância",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H12"
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
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Criar backups lógicos ou gerenciados pelo provedor {#logical-and-provider-backups}

Para instalações a partir do código, bancos gerenciados e Storage personalizado, associe os comandos de banco, bytes e proxy à mesma instância. self-host:backup, self-host:update e self-host:restore são verificações preliminares de leitura: não executam essas operações. Um backup completo conserva PostgreSQL com auth, storage e histórico de migrações, bytes brutos dos arquivos, configuração, chaves e identidades exatas do Minddy e do Supabase no mesmo ponto, sem gravações concorrentes.


## Supabase gerenciado por um provedor {#provider}

Para Supabase gerenciado, registre projeto, versão do banco, identificador do backup ou snapshot e ponto de recuperação. Feche Minddy, workers e gravações agendadas; depois use os controles de consistência ou manutenção suportados pelo provedor para gravações diretas de Auth, PostgREST e Storage. Se não estiverem disponíveis, registre a limitação: parar apenas a aplicação não basta. Use os exports SQL abaixo somente se o papel do banco e o provedor os suportarem, incluindo Auth, metadados Storage, histórico de migrações e políticas gerenciadas. Preserve os bytes brutos dos objetos separadamente por export suportado ou snapshot imutável do backend. Guarde ambiente protegido e chaves Minddy, além das definições Auth/SMTP, URL, proxy e jobs sob seu controle. Papéis da plataforma e chaves pgsodium podem pertencer ao provedor; não os apresente como arquivos locais. Os blocos abaixo com SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium e tar filesystem servem apenas para backend controlado pelo operador. Valide a restauração completa em um projeto vazio separado antes de confiar na cópia. Nenhum backup ou restore de provedor foi executado para esta revisão.

## Bloquear escritas e exportar SQL {#outage}

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

## Preservar bytes e configuração {#bytes}

Se você administra um Storage em filesystem, pare storage e imgproxy após exportar SQL e arquive o diretório preservando proprietários numéricos, ACLs e atributos estendidos. Em S3, crie um snapshot ou uma versão imutável dos bytes brutos. Não restaure por /storage/v1/s3, pois isso cria metadados que conflitam com os restaurados. O provedor controla papéis e arquivos da plataforma: use seu procedimento suportado e registre o alcance. Copie em privado configurações do Minddy e do Supabase, proxy, jobs, templates Auth, SMTP e eventual chave raiz pgsodium. Inclua MINDDY_DATA_ROOT_KEY e os demais segredos preservados. O SQL não contém os bytes dos anexos.

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

## Verificar o resultado {#verify}

Gere e verifique SHA256SUMS no conjunto completo, cifre-o, copie para fora do host e verifique novamente. Registre versões, imagens, contagens e hashes das amostras. Uma exportação bem-sucedida não comprova restauração. Teste em um destino vazio com as versões e a configuração salvas antes de confiar no backup; documente os limites do provedor.
