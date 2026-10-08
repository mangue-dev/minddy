---
{
  "id": "back-up-the-reference-instance",
  "locale": "fr",
  "title": "Sauvegarder à froid le profil full sur fichiers",
  "summary": "Cette procédure Linux concerne uniquement full avec le stockage sur fichiers du Supabase officiel épinglé.",
  "topic": "Exploiter une instance",
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

## Sauvegarder à froid le profil full sur fichiers {#back-up-the-reference-instance}

Cette procédure Linux concerne uniquement full avec le stockage sur fichiers du Supabase officiel épinglé. La restauration physique exige la même architecture CPU et l’image PostgreSQL exacte. Supabase géré, S3 et déploiements source utilisent la procédure logique ou fournisseur. Annoncez une interruption des écritures et arrêtez les workers externes. Gardez la destination chiffrée, assez grande et hors des données actives. N’utilisez jamais down --volumes sur la source. La sauvegarde réunit base, Auth, métadonnées et octets Storage, migrations, politiques, clés Vault, configuration et identités de version.

## Définir le contexte Compose installé {#context}

Remplacez les chemins et la version d’exemple par ceux de l’instance installée. Réglez MODE=full. Conservez tout override de restauration dans chaque commande Compose. N’utilisez pas le docker compose amont seul : il omet l’overlay Minddy et l’environnement protégé. N’exécutez pas cet environnement comme script et ne l’affichez pas. La séquence suivante arrête tous les services avant de copier les fichiers PostgreSQL.

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

## Sceller l’ensemble cohérent {#backup}

Exécutez la copie à froid ci-dessous pendant que les écritures restent arrêtées. Elle relève identités du code et des images, archive données amont et volume de clés db-config, puis conserve fichiers de déploiement et environnement. L’absence de db-config impose l’arrêt de la procédure. Gardez les assets et digests OCI et l’image de base par digest pour restaurer. Une sauvegarde regroupant racine et texte chiffré dépend de son chiffrement externe et de ses contrôles d’accès pour rester confidentielle.

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

## Vérifier le résultat {#verify}

Copiez l’ensemble scellé vers un disque ou hôte indépendant et vérifiez SHA256SUMS sur cette destination. Une deuxième copie sur le même hôte ne protège pas contre sa perte. Conservez le stockage des certificats TLS séparément si votre politique l’exige. Pour une simple sauvegarde, redémarrez avec compose up -d --wait après contrôle de la copie. Avant de déclarer celle-ci utilisable, restaurez sur cible vierge isolée, connectez-vous avec MFA, inspectez les tickets conservés et téléchargez des pièces jointes avec SHA-256 identique. Gardez les clés historiques correspondantes.

Si l’instance utilise le contournement épinglé du runner, conservez RUNNER_FIX_OVERRIDE et RUNNER_FIX_DIR avec l’éventuel override de restauration. Ces fichiers font partie de l’ensemble de récupération. Rétablissez leurs chemins absolus, ou adaptez explicitement les deux montages au nouvel emplacement, avant de démarrer le runner.

La commande de sauvegarde froide détecte aussi un volume nommé de Storage filesystem et archive ses octets séparément. Un montage de dossier reste couvert par supabase-docker.tar.gz. Aucun des deux cas ne couvre un backend S3 ou fournisseur.
