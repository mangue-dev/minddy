---
{
  "id": "recommended-models",
  "locale": "fr",
  "title": "Configuration de modèles recommandée",
  "summary": "Démarrer une instance avec la configuration de modèles IA de Minddy Cloud.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "MIN-829 instance administration",
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
      "app/api/recommended-models/route.ts",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "components/admin/admin-models-dashboard.tsx",
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:claude-code (MIN-829 article checked against app/api/recommended-models/route.ts, lib/ai-model-config-file.ts and lib/server/admin-model-config.ts; no figure)",
    "language": "agent:claude-code (fr MIN-829 article with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Importer la configuration de modèles recommandée"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Partir de la configuration de Minddy Cloud {#recommended-models}

Minddy Cloud publie la configuration de modèles IA qu’il utilise, toujours à jour : [téléchargez la configuration recommandée](https://www.minddy.app/api/recommended-models?download=1). Le fichier suit le format versionné d’**Exporter** dans l’onglet **Modèles** de l’administration (`minddy.instance-models`) : modèles par défaut des catégories, modèles des tâches, raccourcis de routage, niveau de raisonnement, modèles conseillés et valeurs par défaut des fournisseurs pour les clés personnelles. Il ne contient ni clé, ni compte, ni usage.

## L’importer sur votre instance {#import}

Téléchargez le fichier, ouvrez **Modèles** dans l’administration de votre instance, choisissez **Importer** et sélectionnez-le. Chaque changement est listé avant toute écriture ; **Appliquer** les écrit tous, ou aucun quand une valeur est refusée, par exemple un modèle de décision que votre fournisseur ne sert pas. Les réglages absents du fichier reviennent à leur valeur par défaut. Un fichier d’une version plus récente de minddy est refusé tant que votre instance n’est pas mise à jour. Vous pouvez aussi joindre le fichier dans une conversation Numo ouverte depuis une session administrateur et demander à Numo de l’importer : Numo affiche la même liste de changements et vous demande de confirmer. Voir [l’administration d’instance](/docs/instance-administration#models-file).

## Publier votre propre configuration {#publish}

Une instance auto-hébergée ne publie rien par défaut. Définissez `MINDDY_PUBLISH_MODEL_CONFIG=1` pour servir sa configuration à l’adresse `/api/recommended-models`, par exemple pour configurer plusieurs instances à l’identique. Le fichier est public : il ne nomme que des modèles et la façon de les servir.
