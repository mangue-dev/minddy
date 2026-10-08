---
{
  "id": "integration-api-and-webhooks",
  "locale": "fr",
  "title": "Créer tickets ou feedback et recevoir des webhooks signés",
  "summary": "Le propriétaire crée une intégration dans les paramètres du projet.",
  "topic": "Concepts techniques",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/fr/integration-api-and-webhooks-flow.svg",
      "alt": "Schéma: Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.",
      "caption": "Lisez les étapes dans cet ordre. Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.",
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
    "integration-api-and-webhooks-flow"
  ]
}
---

## Créer tickets ou feedback et recevoir des webhooks signés {#integration-api-and-webhooks}

Le propriétaire crée une intégration dans les paramètres du projet. Choisissez issues pour les tâches internes en triage, feedback pour les besoins utilisateur avec votes/statut public. La clé mdy_ en clair apparaît une fois. Gardez-la uniquement côté serveur, dans MINDDY_API_KEY ou MINDDY_FEEDBACK_KEY, jamais navigateur, dépôt ou journaux partagés. La révocation est définitive ; clés inconnues/révoquées retournent 401 invalid_api_key. La clé appartient à un projet et ne peut appeler l’autre famille d’endpoints (403 wrong_key_kind).


![Schéma: Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.](/documentation/fr/integration-api-and-webhooks-flow.svg)

## Envoyer les champs corrects {#send}

GET /api/v1/issues/options donne catégories et valeurs priorité/effort ; POST /api/v1/issues reçoit titre non vide, description Markdown, priorité, effort et catégories optionnels. Le résultat entre toujours en triage ; statut, responsable et parent ne sont pas réglables de l’extérieur. Les limites sont 500 caractères de titre, 65 536 de description et 50 catégories. La réponse 201 contient id, number, identifier et status. POST /api/v1/feedback exige title et user.external_id et/ou user.email ; user.name et body sont optionnels. analyze est un booléen, true par défaut. false désactive ensemble modération, catégorisation et fusion des doublons, et publie tel quel ; la chaîne "false" est refusée. Examinez review_state et faites garantir l’identité par votre serveur.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Rapport de démonstration","description":"Reproduire avec des données de démonstration","priority":"low","effort":"s"}'
```

## Vérifier et dédupliquer les événements {#receive}

Une intégration issues envoie issue.created, issue.status_changed et issue.updated. Le propriétaire choisit toute nouvelle destination dans les paramètres ; les agents peuvent régler événements/périmètre existants ou désactiver, sans créer de nouveau canal sortant. Le périmètre integration limite aux tickets de cette clé ; all couvre tout le projet. Vérifiez X-Minddy-Signature : sha256= suivi de HMAC-SHA256 sur les octets bruts reçus, avec comme clé le digest SHA-256 hexadécimal minuscule de la clé API. Comparez en temps constant avant de croire le contenu. Ne parsez/résérialisez pas avant le hash. X-Minddy-Delivery correspond à delivery_id ; dédupliquez par UUID.

## Traiter les échecs et limites {#limits}

La livraison est sans garantie : délai de cinq secondes et une tentative immédiate après erreur réseau ou 5xx, puis abandon définitif. Doublons et désordre sont possibles. Persistez le contenu vérifié, retournez 2xx rapidement et traitez après. issue.updated regroupe les changements ; description et plan indiquent le champ sans sa valeur. Vérifiez le dernier statut dans les paramètres. Pour 429, respectez Retry-After. Les erreurs de validation sont 422 ; un quota atteint est un 403 issue_limit_reached définitif. Une création expirée peut avoir abouti : contrôlez avant répétition. Le vote feedback utilise POST `/api/v1/feedback/<post_id>/vote`, idempotent par identité.
