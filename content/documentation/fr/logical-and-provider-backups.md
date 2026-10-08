---
{
  "id": "logical-and-provider-backups",
  "locale": "fr",
  "title": "Créer une sauvegarde logique ou gérée par le fournisseur",
  "summary": "Cette procédure concerne les déploiements source, bases gérées et Storage personnalisé.",
  "topic": "Exploiter une instance",
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

## Créer une sauvegarde logique ou gérée par le fournisseur {#logical-and-provider-backups}

Cette procédure concerne les déploiements source, bases gérées et Storage personnalisé. Les commandes de base, Storage brut et proxy doivent viser la même instance installée. self-host:backup, self-host:update et self-host:restore sont des contrôles préalables en lecture seule, pas des actions de sauvegarde, déploiement ou restauration. Une sauvegarde complète contient PostgreSQL avec auth, métadonnées storage et migrations, octets Storage bruts, configuration et clés protégées et identités exactes du code/Supabase à un point cohérent sans écriture.


## Supabase géré par un fournisseur {#provider}

Pour Supabase géré par un fournisseur, consignez le projet, la version de base, l’identifiant du backup ou snapshot et son point de récupération. Fermez Minddy, les workers et les écritures planifiées, puis utilisez les contrôles de cohérence ou maintenance pris en charge par le fournisseur pour Auth, PostgREST et Storage directs. S’ils sont indisponibles, consignez cette limite : arrêter l’application seule ne suffit pas. Utilisez les exports SQL ci-dessous uniquement si le rôle de base et le fournisseur les permettent, avec Auth, métadonnées Storage, historique des migrations et policies gérées. Préservez séparément les octets bruts par export pris en charge ou snapshot immuable du backend. Conservez l’environnement protégé et les clés Minddy ainsi que les réglages Auth/SMTP, URL, proxy et jobs sous votre contrôle. Les rôles de plateforme et clés pgsodium peuvent appartenir au fournisseur : ne les présentez pas comme des fichiers locaux. Les blocs SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium et tar filesystem suivants concernent uniquement un backend Supabase contrôlé par l’opérateur. Validez la restauration complète chez le fournisseur sur un projet vide distinct avant de vous fier à la copie. Aucun backup/restore fournisseur n’a été exécuté pour cette révision.

## Bloquer les écritures et exporter SQL {#outage}

Fermez application, workers, planificateur et API publique Supabase. Les écritures directes PostgREST et Storage restent possibles si seule l’application s’arrête. Définissez SUPABASE_DB_URL en privé et BACKUP_DIR sur une nouvelle destination chiffrée. Lancez les exports SQL avec les outils de la version choisie. Vérifiez que chaque fichier SQL est non vide et data.sql contient les sections COPY de auth.users, storage.objects et tables applicatives. L’export de schéma ordinaire omet les migrations : ses deux exports séparés sont obligatoires. Gardez les politiques Storage et Realtime gérées.

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

## Conserver les octets et la configuration {#bytes}

Pour Storage sur fichiers sous votre contrôle, arrêtez storage et imgproxy après l’export SQL et archivez le répertoire brut avec propriétaires numériques, ACL et attributs étendus. Pour S3, créez un snapshot ou une version brute immuable. Ne restaurez jamais via /storage/v1/s3 : les métadonnées entreraient en conflit. Les fournisseurs gérés contrôlent rôles et fichiers de plateforme ; employez leur procédure officielle et relevez sa portée. Copiez en privé configurations applicative/Supabase, proxies, jobs, modèles Auth, SMTP et éventuelle racine pgsodium. Incluez MINDDY_DATA_ROOT_KEY et secrets conservés. Le SQL ne contient pas les octets des pièces jointes.

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

## Vérifier le résultat {#verify}

Générez et vérifiez SHA256SUMS sur l’ensemble complet, chiffrez-le, copiez-le hors serveur et vérifiez à nouveau. Relevez versions, images, nombre d’objets et empreintes de fichiers témoins. Réussir l’export ne prouve pas la restauration. Répétez celle-ci sur cible vierge avec les versions et configurations sauvegardées avant de vous fier à l’ensemble ; indiquez explicitement les limites du fournisseur.
