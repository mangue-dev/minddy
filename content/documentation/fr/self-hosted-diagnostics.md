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
  "revision": 4,
  "sourceRevision": 4,
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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

Lancez le doctor en lecture seule depuis la version et l’environnement réellement installés. Utilisez `--mode full` avec le chemin Compose amont, ou managed avec la connexion de base fournisseur. Il vérifie compatibilité, configuration, conteneurs, DNS/TLS, santé applicative, espace, planificateur et runner ; migrations et Storage exigent la connexion appropriée. Son masquage est utile, mais inspectez le rapport avant partage. Le contrôle de santé ne prouve pas livraison des emails, lisibilité du contenu chiffré ni fichiers restaurés.

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

## Préserver la récupération {#recovery}

Corrigez prérequis Docker/CLI ou valeurs API incomplètes puis relancez l’installateur idempotent avec l’environnement conservé. Corrigez les URLs runtime et recréez l’application, sans reconstruire l’image OCI. N’effacez pas de bucket non vide, de données ou de racine pour supprimer un avertissement. Les capacités optionnelles désactivées peuvent être normales. Pour le support, partagez version, profil, heures, codes d’erreur contrôlés et diagnostic expurgé. Retirez mots de passe, tokens, `Authorization`, cookies, URLs privées et contenu utilisateur.


Si un premier téléchargement s’arrête avec un long journal de progression sans erreur de registre, l’installateur v0.11.0 peut dépasser son tampon de sortie de sous-processus. Dans le contexte Compose exact de l’installation, `compose pull --quiet` a réussi lors de l’essai jetable. Relancez ensuite le même installateur avec `--skip-pull` pour utiliser ces images locales en conservant l’environnement. Ce contournement ne corrige ni une erreur de registre ni une signature invalide. Si la compilation hors ligne signale une version `jose` différente après l’installation figée, arrêtez : cette release exige 6.2.3 alors que sa dépendance directe figée résout 6.2.12. Obtenez une combinaison release/outillage corrigée avant de valider l’installation standard ; ne relâchez pas silencieusement le contrôle d’identité de dépendance.


Le runner OCI v0.11.0 ne démarre pas non plus : `agent-runner-storage.mjs` manque dans son image runtime. Le `Dockerfile` courant inclut désormais cette dépendance. L’essai d’ingénierie jetable a fourni le fichier du même tag par montage en lecture seule ; ce profil modifié ne vaut pas validation de l’image signée intacte. N’exposez pas le port du runner et ne retirez pas son isolation pour contourner un échec de démarrage.
