---
{
  "id": "self-hosted-diagnostics",
  "locale": "fr",
  "title": "Diagnostic d’instance",
  "summary": "Lancez le doctor en lecture seule depuis la version et l’environnement réellement installés.",
  "topic": "Exploiter une instance",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Diagnostiquer une installation self-hosted"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Diagnostiquer une installation self-hosted {#self-hosted-diagnostics}

Lancez le doctor en lecture seule depuis la version et l’environnement réellement installés. Utilisez `--mode full` avec le chemin Compose amont, ou managed avec la connexion de base fournisseur. Il vérifie compatibilité, configuration, conteneurs, DNS/TLS, santé applicative, espace et planificateur ; migrations et Storage exigent la connexion appropriée. Son masquage est utile, mais inspectez le rapport avant partage. Le contrôle de santé ne prouve pas livraison des emails, lisibilité du contenu chiffré ni fichiers restaurés.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Relier le symptôme au contrôle {#symptoms}

| Symptôme | Contrôle |
| --- | --- |
| Réponses 401 généralisées après restauration | Vérifiez que JWT, clés anon et service-role appartiennent à la même pile. |
| Envois de fichiers échoués ou erreurs 404 | Comparez les politiques, les enregistrements d’objets, les octets et les clés Storage. |
| Relations absentes dans la base | Conservez la première erreur de migration et vérifiez le disque, les verrous et l’URL cible. Relancez le bootstrap de la version uniquement après correction ; ne marquez jamais une migration échouée comme appliquée à la main. |
| Échecs Realtime | Vérifiez la publication, JWT, le proxy WebSocket et les journaux des services. |
| Cron inactif ou tâches en erreur 401 | Vérifiez l’état du planificateur, l’origine canonique et `CRON_SECRET` en privé. |
| Échec de la compatibilité de version | Comparez `MINDDY_RELEASE` avec une ligne de `deploy/self-hosted/compatibility.json` et `MINDDY_IMAGE` avec cette ligne ou le digest immuable vérifié. L’installateur copie `MINDDY_RELEASE` depuis le modèle de déploiement. |

## Préserver la récupération {#recovery}

Corrigez prérequis Docker/CLI ou valeurs API incomplètes puis relancez l’installateur idempotent avec l’environnement conservé. Corrigez les URLs runtime et recréez l’application, sans reconstruire l’image OCI. N’effacez pas de bucket non vide, de données ou de racine pour supprimer un avertissement. Les capacités optionnelles désactivées peuvent être normales. Pour le support, partagez version, profil, heures, codes d’erreur contrôlés et diagnostic expurgé. Retirez mots de passe, tokens, `Authorization`, cookies, URLs privées et contenu utilisateur.


Si un premier téléchargement s’arrête avec un long journal de progression sans erreur de registre, l’installateur v0.11.0 peut dépasser son tampon de sortie de sous-processus. Les installateurs suivants téléchargent en mode silencieux avec un tampon plus grand et, si la sortie le dépasse encore, s’arrêtent avec une consigne explicite. Dans les deux cas, lancez `compose pull --quiet` dans le contexte Compose exact de l’installation, puis relancez le même installateur avec `--skip-pull` pour utiliser ces images locales en conservant l’environnement. Ce contournement ne corrige ni une erreur de registre ni une signature invalide. Si la compilation hors ligne signale une version `jose` différente, arrêtez. L’outillage v0.11.0 exige 6.2.3 alors que sa dépendance directe figée résout 6.2.12 ; obtenez une combinaison release/outillage corrigée avant de valider cette installation. Dans les releases suivantes, l’épinglage correspond à la dépendance figée : un écart signifie que `pnpm install --frozen-lockfile` ne s’est pas terminé dans ce checkout. Ne relâchez pas silencieusement le contrôle d’identité de dépendance.


Le runner OCI v0.11.0 ne démarre pas non plus : `agent-runner-storage.mjs` manque dans son image runtime, si bien que l’application ne devient jamais saine. Les releases suivantes suppriment ce runner et ses sandboxes de code. Mettez à niveau vers une telle release au lieu de monter des fichiers du runner ou d’affaiblir l’isolation des conteneurs.
