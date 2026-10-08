---
{
  "id": "create-an-issue",
  "locale": "fr",
  "title": "Créer et modifier un ticket",
  "summary": "Décrivez une tâche réalisable, choisissez son projet et modifiez ses propriétés sans dupliquer le travail.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/new-issue.png",
      "alt": "Brouillon de ticket non envoyé avec titre, description et propriétés manuelles.",
      "caption": "Décrivez le résultat attendu, puis choisissez les propriétés utiles avant de créer le ticket.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps"
  ]
}
---

## Créer la tâche {#create-an-issue}

Vous devez être membre du projet destinataire. Ouvrez le projet et sa commande de création de ticket. Saisissez un titre qui nomme le travail, puis décrivez contexte, résultat attendu et contraintes. Depuis une vue personnelle ou transversale, choisissez explicitement le projet.

Pour une création manuelle, désactivez Smart-fill si son bouton est affiché et activé. Les contrôles de priorité, d’effort, de catégories et d’objectif deviennent alors disponibles. Ce choix concerne ce ticket ; la réouverture du formulaire rétablit la préférence du compte. Il reste indépendant des réglages d’automatisation et de Smart Assign du projet.

Définissez les propriétés utiles avant de confirmer : état, priorité, effort, responsable, objectif, catégories, échéance et récurrence. Le responsable est un membre du projet ; l’objectif regroupe des tickets autour d’un résultat du projet. Laissez une propriété optionnelle vide plutôt que de la deviner. La priorité va d’aucune à urgente, avec basse, moyenne et haute ; l’effort utilise XS, S, M, L et XL.

Confirmez la création et ouvrez le ticket. Vérifiez son identifiant et son projet. Modifiez ses propriétés à mesure que la tâche se précise. La description explique le travail ; le plan d’implémentation est séparé, dans l’onglet Plan.


![Brouillon de ticket non envoyé avec titre, description et propriétés manuelles.](/documentation/fr/new-issue.png)

## Vérifier l’enregistrement et la visibilité {#issue-save}

Après une modification, vérifiez la valeur affichée. Un changement de responsable, d’état ou de catégorie peut retirer immédiatement le ticket de la vue filtrée. Recherchez son identifiant ou ouvrez le projet sans ces filtres avant de créer un remplacement.

Si la création ou la sauvegarde échoue, conservez votre texte, lisez l’erreur et vérifiez l’adhésion et la destination. Après un échec réseau, vérifiez d’abord si le ticket existe déjà. Liez une page comme ressource vivante lorsque son contenu actuel est nécessaire, et utilisez les commentaires pour la discussion de la tâche.
