---
{
  "id": "storage-and-attachments",
  "locale": "fr",
  "title": "Conserver Storage durable et diagnostiquer les pièces jointes",
  "summary": "PostgreSQL conserve les métadonnées des objets Storage et les références applicatives.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
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
      "docs/self-hosting.md",
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts"
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
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/fr/storage-and-attachments-flow.svg",
      "alt": "Schéma: Accès fichier autorisé par l’application. Métadonnées d’objets PostgreSQL. Octets bruts sur fichiers ou S3. Configuration et clés correspondantes.",
      "caption": "Ces composants ont des responsabilités distinctes. Accès fichier autorisé par l’application. Métadonnées d’objets PostgreSQL. Octets bruts sur fichiers ou S3. Configuration et clés correspondantes.",
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
    "storage-and-attachments-flow"
  ]
}
---

## Conserver Storage durable et diagnostiquer les pièces jointes {#storage-and-attachments}

PostgreSQL conserve les métadonnées des objets Storage et les références applicatives. Le backend Storage conserve les octets. Les deux appartiennent à la même instance et au même point de sauvegarde. Le profil full sur fichiers persiste les octets dans docker/volumes/storage du Supabase amont épinglé ; un backend S3 compatible exige un snapshot brut distinct. Les fichiers éphémères des conteneurs ne sont pas durables. Surveillez la capacité de la base, des pièces jointes et des sauvegardes, en gardant celles-ci hors du disque Storage actif.


![Schéma: Accès fichier autorisé par l’application. Métadonnées d’objets PostgreSQL. Octets bruts sur fichiers ou S3. Configuration et clés correspondantes.](/documentation/fr/storage-and-attachments-flow.svg)

## Vérifier les accès autorisés {#access}

Les fichiers privés de pages et tickets passent par l’autorisation applicative avant qu’un téléchargement soit généré. Publier une page expose uniquement les fichiers de l’ensemble publié au moyen d’URLs signées ; cela ne rend pas le bucket public ni la route privée anonyme. Un objet présent sur disque ne prouve pas que métadonnées, politiques, clé et permissions sont correctes. Avec un compte de démonstration, téléversez puis téléchargez un fichier et comparez son SHA-256. Recommencez après restauration dans chaque bucket utilisé.

## Récupérer une panne {#recover}

Lancez le vérificateur Supabase, vérifiez pile et clé service-role, puis comparez enregistrements des objets, octets du backend et clés conservées. Corrigez la panne de service, politique ou configuration avant de réessayer. Ne supprimez jamais un bucket avatars non vide pour éliminer un avertissement. Restaurer les enregistrements SQL seuls ne restaure pas les octets. Pour S3, restaurez le snapshot brut du backend, sans passer par /storage/v1/s3 qui peut produire des métadonnées contradictoires.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Stockage filesystem avec Docker Desktop {#docker-desktop}

Sur le profil macOS Docker Desktop testé, un montage de dossier hôte a renvoyé ENOTSUP lors de l’écriture des attributs étendus par Storage. Un nouveau volume Linux nommé a évité cet échec. Pour une nouvelle installation sans octets d’objets, l’override persistant suivant remplace uniquement le montage Storage. Conservez RESTORE_OVERRIDE dans le contexte Compose installé. Ne remplacez pas un montage déjà rempli par un volume vide et n’écrasez pas un override de restauration existant : arrêtez les écritures et préservez d’abord ses octets avec les procédures de sauvegarde et de restauration.

```bash
: "${RESTORE_OVERRIDE:=/etc/minddy/storage-volume.yml}"
export RESTORE_OVERRIDE
test ! -e "$RESTORE_OVERRIDE"
export STORAGE_VOLUME=minddy-filesystem-storage
if docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "Refusing to replace an existing Storage volume." >&2
  exit 1
fi
cat > "$RESTORE_OVERRIDE" <<EOF
services:
  storage:
    volumes:
      - $STORAGE_VOLUME:/var/lib/storage
volumes:
  $STORAGE_VOLUME:
EOF
# Apply this overlay with the installed Compose context before the first start.
```
