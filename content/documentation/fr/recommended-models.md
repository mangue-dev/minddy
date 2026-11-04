---
{
  "id": "recommended-models",
  "locale": "fr",
  "title": "Configuration de modèles recommandée",
  "summary": "Démarrer une instance avec la configuration de modèles IA de minddy Cloud.",
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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
    "revision": 2,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
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

## Partir de la configuration de minddy Cloud {#recommended-models}

minddy Cloud publie la configuration de modèles IA qu’il utilise, toujours à jour : [téléchargez la configuration recommandée](https://www.minddy.app/api/recommended-models?download=1). Le fichier suit le format versionné d’**Exporter** dans l’onglet **Modèles** de l’administration (`minddy.instance-models`) : modèles par défaut des catégories, modèles des tâches, raccourcis de routage, niveau de raisonnement, modèles conseillés et valeurs par défaut des fournisseurs pour les clés personnelles. Il ne contient ni clé, ni compte, ni usage.

## L’importer sur votre instance {#import}

Téléchargez le fichier, ouvrez **Modèles** dans l’administration de votre instance, choisissez **Importer** et sélectionnez-le. Chaque changement est listé avant toute écriture ; **Appliquer** les écrit tous, ou aucun quand une valeur est refusée, par exemple un modèle de décision que votre fournisseur ne sert pas. Les réglages absents du fichier reviennent à leur valeur par défaut. Un fichier d’une version plus récente de minddy est refusé tant que votre instance n’est pas mise à jour. Vous pouvez aussi joindre le fichier dans une conversation Numo ouverte depuis une session administrateur et demander à Numo de l’importer : Numo affiche la même liste de changements et vous demande de confirmer. Voir [l’administration d’instance](/docs/instance-administration#models-file).

## Publier votre propre configuration {#publish}

Une instance auto-hébergée ne publie rien par défaut. Définissez `MINDDY_PUBLISH_MODEL_CONFIG=1` pour servir sa configuration à l’adresse `/api/recommended-models`, par exemple pour configurer plusieurs instances à l’identique. Le fichier est public : il ne nomme que des modèles et la façon de les servir.
