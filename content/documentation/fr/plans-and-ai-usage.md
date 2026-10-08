---
{
  "id": "plans-and-ai-usage",
  "locale": "fr",
  "title": "Comprendre forfaits Cloud et consommation IA",
  "summary": "Vérifier les capacités actuelles et distinguer budget inclus, fournisseurs et infrastructure.",
  "topic": "Compte et applications",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 2,
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
      "content/knowledge/plans-and-billing.md",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/plans-and-ai-usage-workflow.png",
      "alt": "Page d’usage IA du compte de démonstration.",
      "caption": "Page d’usage IA du compte de démonstration. Le budget actuel, les catégories et l’historique proviennent du compte ; aucun achat ni travail facturé n’a été déclenché.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "plans-and-ai-usage-workflow"
  ]
}
---

## Comparer le compte actuel {#plans-and-ai-usage}

Cloud propose Free, Go et Pro. Tous incluent MCP, conversations Numo, actions contextuelles, travail sur le code et routines. Les capacités, l’utilisation IA incluse, les modèles et le stockage diffèrent. Ouvrez Facturation pour consulter votre budget et votre consommation actuels, puis comparez la page publique des prix avant de choisir un plan ; ses chiffres constituent la référence actuelle.

Utilisez l’action de paiement ou de gestion d’abonnement proposée à votre compte. Vérifiez le montant, la période de facturation et la confirmation du fournisseur avant d’accepter. Un changement de plan réussi doit apparaître dans la facturation du compte ; vérifiez cet état plutôt que de considérer une fenêtre de paiement fermée comme une preuve.


## Ce qui consomme le budget {#consumption}

L’utilisation IA incluse couvre le raisonnement, les appels aux outils Minddy, l’automatisation, les appels au modèle du worker et le calcul de la sandbox serveur. La limite mensuelle d’IA incluse s’applique au travail financé par Minddy. Le plafond par exécution d’une routine constitue une limite distincte qui peut mettre son exécution en pause ; le travail terminé reste dans la conversation. Ces limites n’autorisent pas la facturation automatique de dépassements. Consultez la carte de limite et la date de réinitialisation du budget lorsqu’elle est disponible.

Les clés personnelles compatibles font facturer les appels aux modèles par leur fournisseur plutôt que par l’utilisation IA incluse. Un worker qui utilise une clé BYOK validée contourne le quota du forfait et le plafond de calcul du compte. Le calcul de la sandbox conserve un coût réel et reste comptabilisé dans l’utilisation ; cet enregistrement ne signifie pas que le plafond mensuel du forfait s’applique à cette exécution BYOK. Les familles ou usages non attribués qui passent par des appels financés par Minddy restent soumis à leur allocation Minddy. L’auto-hébergement comporte des coûts d’infrastructure et de fournisseurs facultatifs déterminés par l’installation ; exécuter le même cœur ne le transforme pas en abonnement Cloud.

## Capacités de la version candidate {#plan-capacities}

Ces valeurs par défaut décrivent la version candidate 0.11.1 identifiée. Vérifiez la page de prix et le compte réels avant d’acheter ; les prix configurés au paiement et les dérogations du compte peuvent différer. Le nombre d’invités exclut le propriétaire du projet. Le stockage est imputé au propriétaire du projet qui reçoit les fichiers.

| Plan | Projets | Tickets par projet | Invités par projet | Stockage | IA mensuelle incluse (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Illimités | Illimités | Illimités | 20 GiB | 5 |
| Pro | Illimités | Illimités | Illimités | 100 GiB | 15 |

![Page d’usage IA du compte de démonstration.](/documentation/fr/plans-and-ai-usage-workflow.png)
