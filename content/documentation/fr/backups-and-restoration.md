---
{
  "id": "backups-and-restoration",
  "locale": "fr",
  "title": "Sauvegardes et restauration",
  "summary": "Préservez la base, le stockage, la configuration et les clés de chiffrement, choisissez une méthode de sauvegarde et restaurez un ensemble complet sur une cible vierge.",
  "topic": "Exploiter une instance",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
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
      "content/knowledge/self-hosting-operations.md",
      "content/documentation/reviews/premerge-second-operations-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root/second_operations (managed runner blocker and key-volume recovery source review; existing helper evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (inline-code syntax and unchanged-text review); agent:/root/second_operations (fr added installation and recovery safeguards, full retained meaning)",
    "date": "2026-10-10"
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
    "Sauvegarder à froid le profil full sur fichiers",
    "Créer une sauvegarde logique ou gérée par le fournisseur",
    "Restaurer un ensemble complet sur une cible vierge"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/fr/restore-and-roll-back-flow.svg",
      "alt": "Schéma: Sauvegarde complète hors serveur vérifiée. Cible vierge isolée et versions correspondantes. Restaurer ensemble base, octets et clés. Vérifier compte, contenu et fichiers avant ouverture.",
      "caption": "Lisez les étapes dans cet ordre. Sauvegarde complète hors serveur vérifiée. Cible vierge isolée et versions correspondantes. Restaurer ensemble base, octets et clés. Vérifier compte, contenu et fichiers avant ouverture.",
      "revision": 5,
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
            "title": "Sauvegarde complète hors serveur vérifiée"
          },
          {
            "title": "Cible vierge isolée et versions correspondantes"
          },
          {
            "title": "Restaurer ensemble base, octets et clés"
          },
          {
            "title": "Vérifier compte, contenu et fichiers avant ouverture"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "restore-and-roll-back-flow"
  ]
}
---

Une sauvegarde récupérable conserve ensemble la base de données, les octets bruts de Storage, la configuration, les clés de chiffrement et la release applicative. Choisissez la procédure filesystem, logique ou fournisseur adaptée au profil installé, conservez l’ensemble hors serveur et répétez sa restauration sur une cible vierge avant de vous y fier. Une restauration peut perdre les écritures postérieures à la sauvegarde.

## Sauvegarder à froid le profil full sur fichiers {#back-up-the-reference-instance}

Cette procédure Linux concerne uniquement full avec le stockage sur fichiers du Supabase officiel épinglé. La restauration physique exige la même architecture CPU et l’image PostgreSQL exacte. Supabase géré, S3 et déploiements source utilisent la procédure logique ou fournisseur. Annoncez une interruption des écritures et arrêtez les workers externes. Gardez la destination chiffrée, assez grande et hors des données actives. N’utilisez jamais `down --volumes` sur la source. La sauvegarde réunit base, Auth, métadonnées et octets Storage, migrations, politiques, clés Vault, configuration et identités de version.

### Définir le contexte Compose installé {#context}

Remplacez les chemins et la version d’exemple par ceux de l’instance installée. Réglez `MODE=full`. Conservez tout override de restauration dans chaque commande Compose. N’utilisez pas le `docker compose` amont seul : il omet l’overlay minddy et l’environnement protégé. N’exécutez pas cet environnement comme script et ne l’affichez pas. La séquence suivante arrête tous les services avant de copier les fichiers PostgreSQL.

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

### Sceller l’ensemble cohérent {#backup}

Exécutez la copie à froid ci-dessous pendant que les écritures restent arrêtées. Elle relève identités du code et des images, archive données amont et volume de clés `db-config`, puis conserve fichiers de déploiement et environnement. L’absence de `db-config` impose l’arrêt de la procédure. Gardez les assets et digests OCI et l’image de base par digest pour restaurer. Une sauvegarde regroupant racine et texte chiffré dépend de son chiffrement externe et de ses contrôles d’accès pour rester confidentielle.

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

### Vérifier le résultat {#verify}

Copiez l’ensemble scellé vers un disque ou hôte indépendant et vérifiez `SHA256SUMS` sur cette destination. Une deuxième copie sur le même hôte ne protège pas contre sa perte. Conservez le stockage des certificats TLS séparément si votre politique l’exige. Pour une simple sauvegarde, redémarrez avec `compose up -d --wait` après contrôle de la copie. Avant de déclarer celle-ci utilisable, restaurez sur cible vierge isolée, connectez-vous avec MFA, inspectez les tickets conservés et téléchargez des pièces jointes avec SHA-256 identique. Gardez les clés historiques correspondantes.

Si l’instance utilise le contournement épinglé du runner, conservez `RUNNER_FIX_OVERRIDE` et `RUNNER_FIX_DIR` avec l’éventuel override de restauration. Ces fichiers font partie de l’ensemble de récupération. Rétablissez leurs chemins absolus, ou adaptez explicitement les deux montages au nouvel emplacement, avant de démarrer le runner.

La commande de sauvegarde froide détecte aussi un volume nommé de Storage filesystem et archive ses octets séparément. Un montage de dossier reste couvert par `supabase-docker.tar.gz`. Aucun des deux cas ne couvre un backend S3 ou fournisseur.

## Créer une sauvegarde logique ou gérée par le fournisseur {#logical-and-provider-backups}

Cette procédure concerne les déploiements source, bases gérées et Storage personnalisé. Les commandes de base, Storage brut et proxy doivent viser la même instance installée. `self-host:backup`, `self-host:update` et `self-host:restore` sont des contrôles préalables en lecture seule, pas des actions de sauvegarde, déploiement ou restauration. Une sauvegarde complète contient PostgreSQL avec auth, métadonnées storage et migrations, octets Storage bruts, configuration et clés protégées et identités exactes du code/Supabase à un point cohérent sans écriture.

### Supabase géré par un fournisseur {#provider}

Pour Supabase géré par un fournisseur, consignez le projet, la version de base, l’identifiant du backup ou snapshot et son point de récupération. Fermez minddy, les workers et les écritures planifiées, puis utilisez les contrôles de cohérence ou maintenance pris en charge par le fournisseur pour Auth, PostgREST et Storage directs. S’ils sont indisponibles, consignez cette limite : arrêter l’application seule ne suffit pas. Utilisez les exports SQL ci-dessous uniquement si le rôle de base et le fournisseur les permettent, avec Auth, métadonnées Storage, historique des migrations et policies gérées. Préservez séparément les octets bruts par export pris en charge ou snapshot immuable du backend. Conservez l’environnement protégé et les clés minddy ainsi que les réglages Auth/SMTP, URL, proxy et jobs sous votre contrôle. Les rôles de plateforme et clés `pgsodium` peuvent appartenir au fournisseur : ne les présentez pas comme des fichiers locaux. Les blocs `SUPABASE_COMPOSE_DIR`, `docker compose`, `supabase.env`, `pgsodium` et tar filesystem suivants concernent uniquement un backend Supabase contrôlé par l’opérateur. Validez la restauration complète chez le fournisseur sur un projet vide distinct avant de vous fier à la copie. Aucun backup/restore fournisseur n’a été exécuté pour cette révision.

### Bloquer les écritures et exporter SQL {#outage}

Fermez application, workers, planificateur et API publique Supabase. Les écritures directes PostgREST et Storage restent possibles si seule l’application s’arrête. Définissez `SUPABASE_DB_URL` en privé et `BACKUP_DIR` sur une nouvelle destination chiffrée. Lancez les exports SQL avec les outils de la version choisie. Vérifiez que chaque fichier SQL est non vide et `data.sql` contient les sections `COPY` de `auth.users`, `storage.objects` et tables applicatives. L’export de schéma ordinaire omet les migrations : ses deux exports séparés sont obligatoires. Gardez les politiques Storage et Realtime gérées.

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
git -C "$SUPABASE_COMPOSE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
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

### Conserver les octets et la configuration {#bytes}

Pour Storage sur fichiers sous votre contrôle, arrêtez storage et `imgproxy` après l’export SQL et archivez le répertoire brut avec propriétaires numériques, ACL et attributs étendus. Pour S3, créez un snapshot ou une version brute immuable. Ne restaurez jamais via `/storage/v1/s3` : les métadonnées entreraient en conflit. Les fournisseurs gérés contrôlent rôles et fichiers de plateforme ; employez leur procédure officielle et relevez sa portée. Copiez en privé configurations applicative/Supabase, proxies, jobs, modèles Auth, SMTP et éventuelle racine `pgsodium`. Incluez `MINDDY_DATA_ROOT_KEY` et secrets conservés. Le SQL ne contient pas les octets des pièces jointes.

Pour le backend épinglé contrôlé par l’opérateur, conservez le volume `db-config` complet plutôt que le seul fichier `pgsodium_root.key`. Le helper ci-dessous préserve propriétaires numériques, permissions, ACL et attributs étendus ; gardez son image PostgreSQL exacte pour la récupération. Un autre montage de clés exige une procédure propre au backend et vérifiée. N’omettez pas les clés et ne supposez pas qu’une nouvelle racine permet de lire les données Vault restaurées.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
DB_CONTAINER="$(docker compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/config/postgres-image-id.txt"
if [ -z "$DB_CONFIG_VOLUME" ]; then
  echo "This key mount needs a verified backend-specific backup and restore procedure." >&2
  exit 1
fi
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /keys . \
  > "$BACKUP_DIR/config/db-config.tar.gz"
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

### Vérifier le résultat {#logical-and-provider-backups-verify}

Générez et vérifiez `SHA256SUMS` sur l’ensemble complet, chiffrez-le, copiez-le hors serveur et vérifiez à nouveau. Relevez versions, images, nombre d’objets et empreintes de fichiers témoins. Réussir l’export ne prouve pas la restauration. Répétez celle-ci sur cible vierge avec les versions et configurations sauvegardées avant de vous fier à l’ensemble ; indiquez explicitement les limites du fournisseur.

## Restaurer un ensemble complet sur une cible vierge {#restore-and-roll-back}

La restauration détruit les données de sa cible et ne fusionne rien. Récupérez la sauvegarde scellée hors serveur, vérifiez `SHA256SUMS` et gardez la source intacte. Arrêtez entrée publique cible, planificateur et workers externes. Le full physique exige architecture sauvegardée et image PostgreSQL exacte. Récupérez tag source et Supabase épinglé dans de nouveaux dossiers et installez les dépendances figées. Vérifiez l’absence de répertoire de données de base, objets Storage et volume `db-config` cibles. Ne lancez ni installation ordinaire ni bootstrap sur cette cible physique vide.


![Schéma: Sauvegarde complète hors serveur vérifiée. Cible vierge isolée et versions correspondantes. Restaurer ensemble base, octets et clés. Vérifier compte, contenu et fichiers avant ouverture.](/documentation/fr/restore-and-roll-back-flow.svg)

### Restaurer les fichiers du profil full {#physical}

Utilisez la séquence physique complète avec chemins et noms de volumes nouveaux. Elle retire les conteneurs source arrêtés sans effacer leurs volumes, restaure PostgreSQL froid et Storage ensemble, récupère `db-config` avec l’image sauvegardée et compare cette image avant démarrage. Modifiez uniquement chemins cibles, origines publiques et redirections Auth dans l’environnement restauré protégé. Gardez JWT, mots de passe, Vault, clés applicatives et identité de version/image. Conservez `RESTORE_OVERRIDE` pour chaque opération : l’omettre peut sélectionner les volumes source. Recompilez la fonction principale hors ligne, démarrez dépendances et application/runner, puis vérifiez la maintenance avant ouverture.


Avant le premier `compose down`, définissez [le contexte Compose installé de l’instance source](/fr/documentation/backups-and-restoration#context), avec son éventuel override existant.

Si `storage-volume.tar.gz` existe, restaurez-le dans un nouveau volume Linux nommé et raccordez ce volume précis avec l’override de restauration persistant avant de démarrer Storage. La protection de cible vide s’applique aussi à ce volume.

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

### Restaurer un ensemble logique {#logical}

Pour une restauration logique, préparez une pile vierge avec versions PostgreSQL/Supabase et configuration/clés conservées. Vérifiez base et Storage brut cibles avant SQL. Restaurez rôles, schéma et données en transaction, puis migrations et politiques gérées. Arrêtez Storage cible et restaurez les fichiers bruts ou le snapshot S3 dans un backend neuf vide. N’utilisez pas l’API Storage pour téléverser. En géré, suivez le processus fournisseur plutôt que les commandes de fichiers. Reprenez le commit applicatif sauvegardé et ses clés, en changeant uniquement les origines isolées.


Les commandes d’extraction logique, `run.sh` et Storage filesystem suivantes concernent uniquement un backend contrôlé par l’opérateur. Pour Supabase géré, restaurez base et octets bruts sur une cible fournisseur vide avec son processus pris en charge, puis configurez et démarrez minddy avec [la procédure d’installation source](/fr/documentation/installation#source). N’exécutez pas de Compose local pour un projet supabase.com.

Avant le premier démarrage de la base, la séquence ci-dessous restaure l’archive des clés dans un nouveau volume et ajoute un fichier unique `docker-compose.restore-keys.*.yml` à la liste Compose installée. Conservez cet override pour chaque opération ultérieure. Les anciennes sauvegardes contenant uniquement `pgsodium_root.key` exigent une procédure vérifiée qui rétablit propriétaires, permissions et montage d’origine avant le démarrage ; la séquence s’arrête au lieu de produire des clés de remplacement.

Préparez d’abord le checkout Supabase amont sauvegardé avec ses fichiers statiques d’origine sous `volumes/`, puis définissez `RESTORE_SUPABASE_DIR` sur son répertoire `docker`. L’archive de configuration exclut volontairement `volumes/` et ne suffit donc pas à préparer ce checkout. Les contrôles ci-dessous exigent le commit sauvegardé et les fichiers d’initialisation ; ils refusent une base ou un Storage déjà rempli. Gardez l’entrée publique fermée et exécutez la séquence Bash avec `set -euo pipefail` pour arrêter avant le démarrage si un contrôle ou une extraction échoue.

```bash
set -euo pipefail
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
test "$(git -C "$RESTORE_SUPABASE_DIR" rev-parse HEAD)" = \
  "$(cat "$BACKUP_DIR/supabase-commit.txt")"
for file in volumes/db/realtime.sql volumes/db/webhooks.sql volumes/db/roles.sql \
  volumes/db/jwt.sql volumes/db/_supabase.sql volumes/db/logs.sql \
  volumes/db/pooler.sql volumes/api/kong.yml volumes/api/kong-entrypoint.sh \
  volumes/pooler/pooler.exs; do
  test -f "$RESTORE_SUPABASE_DIR/$file"
done
test ! -d "$RESTORE_SUPABASE_DIR/volumes/db/data"
if [ -e "$RESTORE_SUPABASE_DIR/volumes/storage" ]; then
  STORAGE_FIRST_OBJECT="$(find "$RESTORE_SUPABASE_DIR/volumes/storage" -type f -print -quit)"
  test -z "$STORAGE_FIRST_OBJECT"
fi
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
if [ -f "$BACKUP_DIR/config/pgsodium_root.key" ] && \
   [ ! -f "$BACKUP_DIR/config/db-config.tar.gz" ]; then
  echo "Legacy standalone key backup: restore its original ownership and mount before startup." >&2
  exit 1
fi
test -f "$BACKUP_DIR/config/db-config.tar.gz"
test -f "$BACKUP_DIR/config/postgres-image-id.txt"
export RESTORE_DB_CONFIG=minddy-logical-restored-db-config
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing key restore volume." >&2
  exit 1
fi
RESTORE_KEYS_OVERRIDE="$(mktemp docker-compose.restore-keys.XXXXXX.yml)"
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/config/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /keys \
  < "$BACKUP_DIR/config/db-config.tar.gz"
cat > "$RESTORE_KEYS_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
EOF
sh run.sh config add "$RESTORE_KEYS_OVERRIDE"
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


Après le build source et la vérification ci-dessus, démarrez l’application récupérée avec `pnpm start` ou le superviseur enregistré dans [la procédure source](/fr/documentation/installation#source). Gardez ingress public et jobs fermés jusqu’aux contrôles suivants.

### Vérifier le résultat {#restore-and-roll-back-verify}

Comparez nombres d’enregistrements et d’objets relevés. Connectez-vous au compte restauré avec MFA, lisez projets, tickets et pages chiffrés et téléchargez des fichiers de chaque bucket avec SHA-256 identique. Vérifiez intégrations restaurées, clés révoquées, Realtime, jobs, OAuth/MCP et origines callbacks. Relevez chemins, volumes, versions, durée et fenêtre de perte observée. Après une migration échouée, utilisez l’ensemble antérieur pour revenir. Rouvrir les écritures après sauvegarde crée des changements qu’un rollback peut perdre. N’inventez pas de migrations inverses et ne déclarez pas la récupération réussie à partir de conteneurs sains seulement.
