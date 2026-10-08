---
{
  "id": "recover-numo-work",
  "locale": "fr",
  "title": "Reprendre un travail Numo arrêté ou en attente",
  "summary": "Identifier la cause de l’arrêt et vérifier les résultats conservés avant de continuer.",
  "topic": "Numo et intégrations",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "docs/architecture/numo-durable-turns.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/recover-numo-work-workflow.png",
      "alt": "Réponse de Numo indiquant du code et des tests locaux, un envoi de branche échoué et aucune pull request à ce stade.",
      "caption": "Résultat initial partiel d’une véritable exécution de démonstration. À ce stade, l’envoi a échoué et aucune PR n’existait. Vérifiez la branche sauvegardée et les services externes avant de continuer ; la conversation a ensuite repris et la PR a été corrigée.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "recover-numo-work-workflow"
  ]
}
---

## Lire l’état d’arrêt {#recover-numo-work}
Revenez à la conversation et lisez ses derniers messages et la carte du worker. Distinguez une question en attente, une limite du compte, un plafond de routine, une allocation d’opération épuisée et une erreur technique. Fermer le panneau ne prouve pas que le travail s’est arrêté.

Dans une carte de questions active, répondez à toutes les questions requises puis envoyez l’ensemble. Les anciennes cartes sont des traces, sans nouvel envoi possible. Passer une question ne fournit pas l’information manquante et n’autorise pas les modifications qui en dépendent.

## Budget et erreurs {#recovery}
La carte de limite du compte affiche la date de réinitialisation lorsqu’elle est connue et peut proposer un forfait ou une clé personnelle. Celle d’une routine mène à sa gestion : vérifiez le plafond par exécution. L’allocation d’opération concerne cette opération. Répéter la demande ne supprime pas la limite. Une clé personnelle ne rend pas le calcul du sandbox gratuit.

Une exécution échouée reprend depuis un point sauvegardé seulement s’il subsiste. Vérifiez tickets, branche, PR et services externes avant de relancer : une écriture peut avoir réussi malgré une réponse perdue. Précisez le travail restant et demandez de continuer. Sans point récupérable, transmettez l’état vérifié dans une nouvelle demande. Pour signaler une erreur persistante, indiquez la conversation concernée sans identifiants secrets.

![Réponse de Numo indiquant du code et des tests locaux, un envoi de branche échoué et aucune pull request à ce stade.](/documentation/fr/recover-numo-work-workflow.png)
