# Exploiter une instance minddy auto-hébergée

Ce runbook commence **après** l'installation décrite dans
[`self-hosting.md`](self-hosting.md). Il couvre une mise à jour entre deux
versions publiées consécutives, une sauvegarde complète et une restauration sur
une pile Supabase vierge. Les exemples supposent une application et la
distribution Docker officielle de Supabase, mais les invariants restent les
mêmes avec un autre orchestrateur.

Une sauvegarde minddy n'est complète que si elle contient ensemble :

- PostgreSQL, y compris Auth, les métadonnées Storage et l'historique des
  migrations ;
- les octets du backend Storage ;
- la configuration et les secrets de l'application **et** de Supabase ;
- la version exacte du code et des images déployées.

Un dump PostgreSQL seul ne contient pas les fichiers Storage. Une copie des
fichiers Storage seule ne contient ni leurs métadonnées ni leurs permissions.

## Politique de versions supportées

- Une version exploitable est un tag Git immuable `vMAJEUR.MINEUR.CORRECTIF`.
  Ne déployez ni une branche mobile (`main`, `production`) ni une archive sans
  son commit.
- Les migrations sont testées dans l'ordre des versions publiées. Passez d'un
  tag au tag publié suivant, sans en sauter. Répétez ce runbook pour rattraper
  plusieurs versions.
- La dernière version publiée est la version maintenue. La précédente n'est
  conservée que comme cible de rollback court, lorsque les migrations du
  nouveau tag sont explicitement compatibles avec elle. Les correctifs de
  sécurité sont appliqués à la dernière version, pas rétroportés par défaut.
- Avant `v1.0.0`, une version mineure peut modifier la configuration ou demander
  une maintenance. Après `v1.0.0`, une montée de version majeure peut demander
  une procédure dédiée. Dans les deux cas, les notes de version et le diff des
  migrations priment sur ce runbook.
- Mettez à jour séparément la distribution Supabase et minddy. Ne changez pas
  en même temps minddy, la version majeure de PostgreSQL et les images
  Supabase : une panne n'aurait plus une cause isolable. Une mise à niveau
  majeure de PostgreSQL suit le runbook de la version Supabase utilisée.

## Variables utilisées dans les commandes

Adaptez une fois ces chemins et gardez les URL PostgreSQL hors de l'historique
du shell. `BACKUP_ROOT` doit être un volume chiffré, distinct du disque de
production, avec assez d'espace pour la base et Storage.

```bash
export FROM_TAG=v0.9.4
export TO_TAG=v0.9.5
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export TARGET_RELEASE_DIR="/srv/minddy/releases/$TO_TAG"
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export BACKUP_ROOT=/mnt/backup/minddy
export SUPABASE_DB_URL='postgresql://postgres:…@127.0.0.1:5432/postgres'
export NEXT_PUBLIC_SUPABASE_URL='https://supabase.example.test'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='…'
export SUPABASE_SERVICE_ROLE_KEY='…'
```

Ne préfixez pas une commande par les secrets : ils apparaîtraient dans la ligne
de commande ou les journaux. Les exports ci-dessus sont illustratifs ; en
production, chargez-les depuis le gestionnaire de secrets de l'instance.

## Avant toute maintenance

### Décider et annoncer la fenêtre

La procédure sûre a une **indisponibilité en écriture** du début de la
sauvegarde à la fin des contrôles. Affichez une page de maintenance et annoncez
la durée prévue. Bloquez aussi les accès directs à l'API Supabase publique :
arrêter seulement le frontend n'empêche pas un client déjà authentifié d'écrire
dans PostgREST ou Storage.

Avant la fenêtre :

1. préparez le nouveau checkout, installez ses dépendances et construisez-le
   avec ses variables `NEXT_PUBLIC_*` finales ;
2. lisez les notes des deux versions et examinez les migrations, les dépendances
   et l'environnement ;
3. vérifiez la capacité disque, la destination hors hôte et la dernière
   restauration d'essai ;
4. mesurez la durée de la dernière sauvegarde et fixez un point d'abandon ;
5. gardez le binaire ou checkout précédent et sa configuration immédiatement
   redémarrables.

```bash
cd "$MINDDY_REPO"
git fetch --tags
git rev-parse --verify "${FROM_TAG}^{commit}"
git rev-parse --verify "${TO_TAG}^{commit}"
git merge-base --is-ancestor "$FROM_TAG" "$TO_TAG"
test "$(git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD)" = \
  "$(git rev-parse "${FROM_TAG}^{commit}")"
git log --oneline "$FROM_TAG..$TO_TAG"
git diff --stat "$FROM_TAG..$TO_TAG"
git diff "$FROM_TAG..$TO_TAG" -- .env.example package.json pnpm-lock.yaml supabase/migrations
if ! test -d "$TARGET_RELEASE_DIR"; then
  git worktree add --detach "$TARGET_RELEASE_DIR" "$TO_TAG"
fi
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git rev-parse "${TO_TAG}^{commit}")"
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_RELEASE_DIR/.env.local"
cd "$TARGET_RELEASE_DIR"
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

Abandonnez avant l'indisponibilité si le tag cible est absent, si le tag source
ne correspond pas au commit réellement déployé, si une variable requise n'a pas
de valeur, si la sauvegarde précédente n'est pas lisible ou si l'espace libre
est insuffisant.

### Classer les changements d'environnement

Comparez `.env.example`, sans recopier aveuglément ses valeurs. Consignez pour
chaque différence : ajout, retrait, renommage, valeur par défaut, secret à
générer et composant à redémarrer.

- `NEXT_PUBLIC_*` est incorporé au build Next.js : toute modification impose un
  nouveau build, pas seulement un redémarrage.
- Les autres variables applicatives sont lues côté serveur et imposent le
  redémarrage de l'application et des workers concernés.
- Les variables de la pile Supabase imposent de recréer le ou les services qui
  les consomment. Vérifiez notamment Auth, Storage, Realtime et le proxy.
- Ne régénérez pas `GIT_TOKEN_ENCRYPTION_SECRET`,
  `AI_KEY_ENCRYPTION_SECRET` ou `FEEDBACK_SSO_ENCRYPTION_SECRET` pendant une
  mise à jour : les données déjà chiffrées deviendraient illisibles sans une
  migration de rotation dédiée.
- Une rotation de `CRON_SECRET`, de clés OAuth/webhook ou de clés API exige une
  bascule coordonnée de leurs appelants. Une rotation du secret JWT Supabase
  invalide les sessions et exige de régénérer les clés qui en dépendent.
- Conservez les anciens noms encore documentés comme alias jusqu'à ce que les
  notes de version autorisent leur retrait.

## Sauvegarde complète et cohérente

### 1. Créer et identifier le jeu de sauvegarde

Au début de la fenêtre, mettez l'application, ses workers et l'ordonnanceur en
maintenance, puis bloquez l'API Supabase au reverse proxy. Laissez PostgreSQL
disponible localement pour le dump.

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
cd "$MINDDY_CURRENT_DIR"
git rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

Le suffixe `-dirty` est un motif d'abandon : archivez et versionnez d'abord les
modifications déployées. Gardez aussi dans le journal d'exploitation l'heure à
laquelle les écritures ont été bloquées.

### 2. Sauvegarder PostgreSQL

La CLI Supabase applique les filtres nécessaires aux rôles et schémas gérés.
Les deux fichiers `history_*` sont séparés car le dump de schéma normal n'inclut
pas le registre `supabase_migrations`. N'ôtez pas les données `auth` ou
`storage` : elles portent les comptes et les métadonnées des objets.

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

Vérifiez immédiatement que les six fichiers sont non vides et que `data.sql`
contient notamment des sections `COPY` pour `auth.users`, `storage.objects` et
les tables `public` de minddy. Une absence signifie que l'URL ou la version de
CLI n'a pas produit une sauvegarde complète ; ne poursuivez pas la mise à jour.

### 3. Sauvegarder les secrets et la configuration

Copiez dans `config/`, en conservant les permissions :

- `MINDDY_ENV_FILE` et la configuration du service applicatif ;
- `.env`, `docker-compose.yml`, les overrides et scripts `run.sh` de la pile
  Supabase ;
- la configuration du reverse proxy, du DNS/TLS et de l'ordonnanceur ;
- le manifeste des images, les paramètres du backend Storage et les gabarits
  Auth/SMTP non versionnés ;
- la clé racine `pgsodium`, si la pile en possède une. Avec la distribution
  Docker Supabase, contrôlez
  `/etc/postgresql-custom/pgsodium_root.key` dans le service `db` et archivez-la
  séparément. Sans elle, les secrets Vault éventuels ne sont pas récupérables.

Par exemple, pour les deux fichiers principaux :

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

Archivez de la même manière les définitions de service, proxy et ordonnanceur
propres à votre hôte. Le `--exclude='./volumes'` est important : Storage est
sauvegardé séparément, après son arrêt, à l'étape suivante.

Ne laissez pas ce répertoire en clair après la fenêtre. Chiffrez-le avec l'outil
de sauvegarde de l'organisation, envoyez-le hors hôte, vérifiez sa récupération,
puis appliquez la durée de rétention prévue. Un hash ne remplace ni le
chiffrement ni une copie hors site.

### 4. Sauvegarder Storage

Arrêtez le service `storage` **après** le dump de base et avant la copie. Les
écritures sont déjà bloquées : les métadonnées du dump et les octets ont donc le
même point logique.

#### Backend fichier de la distribution Docker

Le montage officiel est `volumes/storage`. Confirmez le chemin dans le Compose
réel ; n'utilisez jamais une supposition pour une commande d'archive.

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
```

#### Backend S3 ou compatible S3

Arrêtez également `storage`, puis créez un snapshot/version immuable avec le
fournisseur. À défaut, copiez **le bucket backend brut** vers un bucket de
sauvegarde avec les identifiants du backend et contrôlez source/destination avec
`rclone check` ou l'équivalent du fournisseur.

N'utilisez pas l'endpoint compatible S3 `/storage/v1/s3` pour une restauration
physique couplée au dump PostgreSQL : cet endpoint crée lui-même des
métadonnées, qui entreraient en conflit avec `storage.objects` restauré depuis
la base. Le snapshot doit préserver les clés internes opaques du backend.

### 5. Sceller et contrôler

```bash
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
du -sh "$BACKUP_DIR"
```

Copiez le jeu hors de l'hôte et refaites `sha256sum --check` sur la copie. Une
sauvegarde n'est déclarée réussie qu'après restauration d'essai ; le contrôle de
hash prouve seulement que les fichiers copiés n'ont pas changé.

Storage reste arrêté à ce point. Pour une sauvegarde sans mise à jour, redémarrez
`storage` et `imgproxy`, contrôlez-les, puis rouvrez les accès dans l'ordre
inverse de leur fermeture. Pour une mise à jour, poursuivez ci-dessous.

## Mise à jour vers la version suivante

### Ordre obligatoire

L'ordre sûr est : **bloquer les écritures → sauvegarder → migrer la base avec le
code cible → déployer l'application cible → vérifier → rouvrir**.

Ne démarrez jamais la nouvelle application avant ses migrations. Ne laissez pas
non plus l'ancienne application écrire pendant ou après une migration dont la
compatibilité descendante n'est pas explicitement annoncée.

### 1. Confirmer la release préparée avant la fenêtre

La préparation de la section « Avant toute maintenance » doit déjà avoir créé
et construit un répertoire ou une image immuable. Ne payez pas le téléchargement
des dépendances ni le build pendant l'indisponibilité. Confirmez seulement
l'artefact :

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
test -f "$TARGET_RELEASE_DIR/.env.local"
```

Le build doit recevoir les valeurs `NEXT_PUBLIC_*` de production. Ne réutilisez
pas un `.next` construit pour une autre origine ou une autre instance Supabase.

### 2. Après la sauvegarde, appliquer les migrations

Cette étape modifie la base et peut être **irréversible**. Ne l'exécutez que si
PostgreSQL et Storage ont été sauvegardés, que les hashes sont valides et que la
copie hors hôte est accessible.

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
```

Chargez d'abord les trois variables Supabase dans le shell. Le `.env.local`
protégé est la copie de l'environnement courant créée avant la fenêtre ; le
bootstrap complète uniquement ses valeurs absentes et ne remplace jamais un
secret existant. Son option `--env-file` n'accepte volontairement qu'un fichier
situé dans le clone : ne lui passez pas directement un environnement conservé
dans `/etc`. Reportez consciemment toute nouvelle valeur dans le gestionnaire de
secrets avant d'activer la release.

Le bootstrap exécute `supabase db push`, réconcilie les buckets et lance les
contrôles. Les migrations SQL versionnées font foi ; ne les collez pas à la main
dans Studio et ne marquez pas une migration `applied` pour contourner un échec.

Si le dépôt vient juste de passer de l'historique de 211 migrations au baseline,
suivez d'abord la section « Transition depuis l'historique avant baseline » de
[`self-hosting.md`](self-hosting.md). C'est une opération exceptionnelle, jamais
une étape récurrente de mise à jour.

### 3. Déployer et vérifier avant de rouvrir

Activez `TARGET_RELEASE_DIR` dans le gestionnaire de service, recréez les
services dont l'environnement a changé et démarrez la nouvelle application sans
retirer la page de maintenance. Puis exécutez :

```bash
cd "$TARGET_RELEASE_DIR"
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health"
```

Avec un compte de test, contrôlez ensuite : connexion/déconnexion, ouverture
d'un projet, création et modification d'un ticket, upload puis téléchargement
d'une pièce jointe, mise à jour temps réel dans deux sessions et exécution d'un
job de fond sans effet dangereux. Contrôlez les logs de l'application, Auth,
PostgREST, Realtime et Storage pendant ces actions.

Rouvrez d'abord l'application, puis l'accès public Supabase et enfin
l'ordonnanceur. Notez l'heure, le tag, le commit, les migrations appliquées, la
durée d'indisponibilité et l'identifiant de sauvegarde dans le journal
d'exploitation.

## Restaurer dans un environnement vierge

La restauration est **destructive pour sa cible** et impose une indisponibilité
totale. Utilisez une nouvelle pile sans utilisateurs ni objets. Si la cible
contient déjà des données, arrêtez : ce runbook n'est pas une fusion.

### 1. Valider et préparer la cible

Définissez d'abord des cibles portant explicitement le nom de restauration :

```bash
export RESTORE_DB_URL='postgresql://postgres:…@restore-db:5432/postgres'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_ANON_KEY='…'
export RESTORE_SERVICE_ROLE_KEY='…'
export RESTORE_REPORT_DIR="/srv/restore/reports/$BACKUP_ID"
```

1. récupérez la sauvegarde hors site et vérifiez `SHA256SUMS` ;
2. provisionnez la même version majeure de PostgreSQL et les mêmes versions
   d'images Supabase que dans `supabase-images.txt` ;
3. restaurez la configuration Supabase et ses secrets avant le premier démarrage
   utile, ou documentez les secrets volontairement renouvelés ;
4. démarrez la pile Supabase vierge pour initialiser ses schémas internes, mais
   gardez son proxy public fermé et l'application minddy arrêtée ;
5. confirmez que la base cible et le backend Storage cible sont bien les cibles
   jetables attendues.

Sur un répertoire cible neuf, la configuration archivée peut être reposée ainsi
avant le démarrage. L'extraction écrit les fichiers du Compose sauvegardé : ne
l'exécutez jamais dans le répertoire de production ou une cible non vide.

```bash
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" \
  "$RESTORE_SUPABASE_DIR/.env"
```

Si `config/pgsodium_root.key` existe, restaurez-la dans le volume `db-config`
selon la procédure de la version Supabase archivée **avant** de charger les
données. Ne démarrez pas avec une clé nouvellement générée lorsque la base
sauvegardée contient des secrets Vault.

Initialisez ensuite la pile sans exposer son proxy :

```bash
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
docker compose ps
```

Utilisez une URL PostgreSQL de restauration distincte pour rendre une erreur de
cible visible :

```bash
cd "$BACKUP_DIR"
sha256sum --check SHA256SUMS
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select current_database(), inet_server_addr(), version()"
```

### 2. Restaurer PostgreSQL

Sur la base initialisée mais vierge, restaurez rôles, schéma et données dans une
transaction. `session_replication_role = replica` empêche les triggers de
rejouer des effets pendant le chargement.

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
```

Une erreur annule la transaction concernée. Lisez la première erreur ; ne
retirez pas arbitrairement une table ou une contrainte du dump. Une différence
de version Auth, Storage, extension ou PostgreSQL signifie généralement que la
pile cible n'est pas celle du manifeste.

### 3. Restaurer les octets Storage

Arrêtez `storage` et `imgproxy` sur la cible. Pour le backend fichier, inspectez
d'abord la liste de l'archive, confirmez que le chemin cible est celui du
Compose vierge, puis extrayez :

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" | sed -n '1,20p'
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

L'extraction remplace les fichiers homonymes : elle n'est autorisée que sur le
backend vierge validé à l'étape précédente. Pour un backend S3, restaurez le
snapshot dans un bucket backend vide, configurez `GLOBAL_S3_BUCKET` vers ce
bucket puis démarrez Storage. Ne réimportez pas les objets via l'API Storage
après avoir restauré `storage.objects`.

### 4. Reposer minddy et vérifier la restauration

Checkouttez le commit de `minddy-commit.txt`, restaurez les secrets applicatifs,
adaptez uniquement les URL de l'environnement d'essai, puis reconstruisez
l'application. Si les secrets Supabase ont été renouvelés, remplacez aussi les
clés anon/service côté minddy ; les utilisateurs devront se reconnecter après
une rotation du secret JWT.

```bash
export RESTORE_APP_URL='https://restore-tickets.example.test'
export NEXT_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export NEXT_PUBLIC_APP_URL="$RESTORE_APP_URL"
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
pnpm install --frozen-lockfile
pnpm build
pnpm bootstrap:supabase -- --db-url "$RESTORE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$RESTORE_SUPABASE_URL" \
  --service-role-key "$RESTORE_SERVICE_ROLE_KEY"
```

Le bootstrap ne doit appliquer aucune ancienne migration ; il peut seulement
appliquer celles postérieures au point sauvegardé si vous avez consciemment
checkouté un tag plus récent. Pour un test fidèle, utilisez d'abord le commit
sauvegardé.

Comparez les nombres de lignes restaurés avec ceux scellés dans la sauvegarde :

```bash
install -d -m 0700 "$RESTORE_REPORT_DIR"
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$RESTORE_REPORT_DIR/counts.json"
diff -u "$BACKUP_DIR/database/counts.json" \
  "$RESTORE_REPORT_DIR/counts.json"
```

Puis rejouez le parcours fonctionnel de la mise à jour et téléchargez plusieurs
objets de chaque bucket, dont une pièce jointe privée.

Une restauration est déclarée testée seulement si :

- les hashes sont valides et toutes les commandes SQL terminent sans erreur ;
- `verify:supabase` passe ;
- les comptages convenus correspondent ;
- un utilisateur restauré peut s'authentifier et lire ses données ;
- les objets Storage restaurés sont réellement téléchargeables ;
- la date, la durée, le RPO observé et les écarts sont consignés.

Testez cette procédure au moins après un changement de versions Supabase ou de
backend Storage et selon la fréquence imposée par votre RPO/RTO.

## Rollback et point de non-retour

| Moment de l'échec | Action sûre |
| --- | --- |
| Avant toute migration | Redémarrer le tag source avec son environnement ; la sauvegarde reste utilisable. |
| Après une migration, avant ouverture | Ne redémarrer l'ancien tag que si les notes déclarent toutes les migrations compatibles en arrière. Sinon restaurer le jeu complet. |
| Après ouverture aux écritures | Refermer immédiatement. Ne restaurez l'ancien snapshot qu'après avoir accepté la perte des écritures postérieures ou les avoir exportées pour une reprise manuelle. |
| Rotation de secret ou changement de backend | Restaurer ensemble configuration, base et Storage. Un rollback du code seul ne recrée ni un secret perdu ni des objets déplacés. |

Les migrations minddy sont orientées vers l'avant et n'ont pas de `down`
automatique. N'inventez pas de SQL inverse en incident. Une suppression de
colonne/table, une transformation de données, un changement de type, une
réécriture d'identifiants ou la consolidation d'historique est un point de
non-retour : le rollback passe par la restauration complète.

Gardez l'ancienne release et la sauvegarde jusqu'à la fin de la période
d'observation. La suppression de l'ancien volume PostgreSQL, de l'ancien bucket
ou du snapshot est elle-même irréversible et ne fait jamais partie de la
procédure de mise à jour.

## Diagnostics courants

Commencez par préserver l'erreur originale et l'heure. Collectez les sorties en
masquant URL avec mot de passe, JWT, cookies, en-têtes `Authorization` et contenu
utilisateur.

```bash
cd "$MINDDY_REPO"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty
cd "$MINDDY_CURRENT_DIR"
node -p "require('./package.json').version"
cd "$SUPABASE_COMPOSE_DIR"
docker compose ps
docker compose images
docker compose logs --since 15m --tail 300 db auth rest realtime storage
df -h
df -i
```

| Symptôme | Contrôles et décision |
| --- | --- |
| Migration refusée | Lisez la première erreur de `supabase db push`, contrôlez disque, verrous et `supabase_migrations.schema_migrations`. Corrigez la cause puis relancez : seules les migrations absentes sont appliquées. Ne modifiez pas le registre à la main. |
| `relation does not exist`, colonne absente | L'application a probablement démarré avant la base ou ne pointe pas vers la base migrée. Remettez la maintenance, comparez les URL et relancez le bootstrap du tag déployé. |
| 401 généralisés après restauration | Vérifiez la cohérence entre secret JWT, clés anon/service et variables de l'application. Après une rotation volontaire, forcez une nouvelle authentification ; ne remettez pas une ancienne clé avec un nouveau secret. |
| 502/503 | Vérifiez `docker compose ps`, les healthchecks et les logs du service derrière le proxy. Contrôlez DNS/TLS et les URL externes avant de redémarrer en boucle. |
| Upload impossible | Lancez `verify:supabase`, contrôlez les buckets et la policy `attachments insert`, l'espace/inodes, les permissions du montage ou les identifiants S3. |
| Objet listé mais téléchargement 404 | La métadonnée `storage.objects` existe mais les octets manquent dans le backend. Comparez snapshot, bucket/prefix et manifeste ; ne supprimez pas la métadonnée pour masquer l'incohérence. |
| Fichier présent mais absent de l'API | Les octets et la base ne viennent pas du même point, ou le fichier a été copié directement dans un format inattendu. Revenez au couple dump/snapshot cohérent. |
| Temps réel absent | Vérifiez que `supabase_realtime` existe avec `verify:supabase`, puis les logs Realtime, le secret JWT, le proxy WebSocket et l'abonnement de la table. |
| Jobs de fond inactifs ou 401 | Vérifiez l'ordonnanceur, l'URL canonique et que son bearer correspond au `CRON_SECRET` courant. Ne journalisez pas ce bearer. |
| Build correct, mauvaise URL dans le navigateur | Une valeur `NEXT_PUBLIC_*` a changé sans rebuild. Rebuild puis remplacez l'artefact ; un redémarrage seul ne suffit pas. |
| Restauration SQL échoue | Confirmez que la cible est vierge et utilise les images/majeure PostgreSQL du manifeste. Une erreur dans `data.sql` est souvent une divergence Auth/Storage ; ne poursuivez pas avec une restauration partielle. |

Pour vérifier uniquement les invariants minddy sans modifier le schéma, utilisez
toujours `pnpm verify:supabase`. Si le diagnostic nécessite une modification de
production, reprenez depuis une sauvegarde cohérente et une nouvelle fenêtre de
maintenance.

## Références d'infrastructure

- [Sauvegarde et restauration avec la CLI Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Auto-hébergement Supabase avec Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Backend et protocole S3 de Supabase Storage](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [Mise à niveau PostgreSQL d'une pile Supabase](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17)
