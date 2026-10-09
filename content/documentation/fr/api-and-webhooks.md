---
{
  "id": "api-and-webhooks",
  "locale": "fr",
  "title": "API, webhooks et SSO des retours",
  "summary": "Créez des tickets ou des retours via l’API d’intégration, vérifiez les webhooks signés et authentifiez les visiteurs des retours avec le SSO.",
  "topic": "Concepts techniques",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Créer tickets ou feedback et recevoir des webhooks signés",
    "Connecter ingestion des retours et SSO visiteurs"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/fr/integration-api-and-webhooks-flow.svg",
      "alt": "Schéma: Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.",
      "caption": "Lisez les étapes dans cet ordre. Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Le serveur garde la clé d’intégration projet"
          },
          {
            "title": "POST tickets ou feedback avec le bon type"
          },
          {
            "title": "Le propriétaire choisit la destination webhook"
          },
          {
            "title": "Réception : HMAC brut et UUID de livraison"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Séquences distinctes d’ingestion backend et de SSO navigateur, avec deux secrets.",
      "caption": "La clé d’ingestion authentifie les appels serveur. Le secret SSO du tableau signe un jeton visiteur court, à usage unique.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Deux parcours de retours distincts",
        "columns": [
          {
            "title": "Ingestion côté serveur",
            "items": [
              "Le backend garde la clé de retours",
              "POST /api/v1/feedback avec clé Bearer et identité stable",
              "HTTP 201 : retour enregistré dans la boîte équipe ; tableau désactivé possible"
            ]
          },
          {
            "title": "SSO du visiteur navigateur",
            "items": [
              "Le backend garde le secret SSO séparé du tableau",
              "Signer JWT HS256 : sub, exp, jti unique ; validité ≤ 600 s",
              "Rediriger le navigateur vers /f/<board-token>?sso=<jwt>",
              "Le jeton à usage unique crée la session ; ouvrir Mes retours"
            ]
          }
        ],
        "note": "Ne jamais envoyer clé d’ingestion ou secret SSO au code navigateur. Tolérance d’horloge : 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

L’API d’intégration reçoit des tickets ou des retours depuis un serveur, avec des clés propres au projet. Les intégrations de tickets peuvent aussi envoyer des webhooks signés ; le SSO des visiteurs des retours utilise un secret distinct du tableau. Suivez les contrôles des points d’accès, de l’identité et de la livraison : les clés restent sur le serveur et les jetons de redirection SSO ne doivent pas figurer dans les journaux partagés.

## Créer tickets ou feedback et recevoir des webhooks signés {#integration-api-and-webhooks}

Le propriétaire crée une intégration dans les paramètres du projet. Choisissez issues pour les tâches internes en triage, feedback pour les besoins utilisateur avec votes/statut public. La clé mdy_ en clair apparaît une fois. Gardez-la uniquement côté serveur, dans MINDDY_API_KEY ou MINDDY_FEEDBACK_KEY, jamais navigateur, dépôt ou journaux partagés. La révocation est définitive ; clés inconnues/révoquées retournent 401 invalid_api_key. La clé appartient à un projet et ne peut appeler l’autre famille d’endpoints (403 wrong_key_kind).


![Schéma: Le serveur garde la clé d’intégration projet. POST tickets ou feedback avec le bon type. Le propriétaire choisit la destination webhook. Réception : HMAC brut et UUID de livraison.](/documentation/fr/integration-api-and-webhooks-flow.svg)

### Envoyer les champs corrects {#send}

Utilisez GET /api/v1/issues/options pour obtenir les identifiants des catégories du projet et les valeurs de priorité et d’effort. Envoyez ensuite POST /api/v1/issues avec un titre non vide et, si nécessaire, une description Markdown, une priorité, un effort et des catégories.

| Champ | Limite |
| --- | --- |
| Titre | 500 caractères |
| Description | 65 536 caractères |
| Catégories | 50 identifiants |

Le ticket créé entre toujours en triage ; son statut, son responsable et son parent ne sont pas réglables de l’extérieur. La réponse 201 contient id, number, identifier et status. Pour les champs des retours, les contrôles d’identité et la modération, suivez la [procédure d’ingestion des retours](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Rapport de démonstration","description":"Reproduire avec des données de démonstration","priority":"low","effort":"s"}'
```

### Vérifier et dédupliquer les événements {#receive}

Une intégration issues envoie issue.created, issue.status_changed et issue.updated. Le propriétaire choisit toute nouvelle destination dans les paramètres ; les agents peuvent régler événements/périmètre existants ou désactiver, sans créer de nouveau canal sortant. Le périmètre integration limite aux tickets de cette clé ; all couvre tout le projet. Vérifiez X-minddy-Signature : sha256= suivi de HMAC-SHA256 sur les octets bruts reçus, avec comme clé le digest SHA-256 hexadécimal minuscule de la clé API. Comparez en temps constant avant de croire le contenu. Ne parsez/résérialisez pas avant le hash. X-minddy-Delivery correspond à delivery_id ; dédupliquez par UUID.

### Traiter les échecs et limites {#limits}

La livraison est sans garantie : délai de cinq secondes et une tentative immédiate après erreur réseau ou 5xx, puis abandon définitif. Doublons et désordre sont possibles. Persistez le contenu vérifié, retournez 2xx rapidement et traitez après. issue.updated regroupe les changements ; description et plan indiquent le champ sans sa valeur. Vérifiez le dernier statut dans les paramètres. Pour 429, respectez Retry-After. Les erreurs de validation sont 422 ; un quota atteint est un 403 issue_limit_reached définitif. Une création dont la réponse a expiré peut avoir abouti : contrôlez le résultat avant de réessayer. Le vote sur les retours possède son [point d’accès et ses limites](#errors).

## Connecter ingestion des retours et SSO visiteurs {#feedback-ingestion-and-sso}

Le propriétaire du projet crée une clé d’intégration feedback dans les réglages du projet. Enregistrez la clé, affichée une seule fois, sous `MINDDY_FEEDBACK_KEY` dans la configuration secrète de votre backend. Ne l’intégrez jamais au code du navigateur. Définissez `MINDDY_ORIGIN` sur l’origine de l’instance cible, sans barre oblique finale.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Afficher la date de livraison","body":"Le support a besoin de la date prévue.","user":{"external_id":"demo-user-1","name":"Lecteur de démonstration"}}'
```

Fournissez un titre non vide de 200 caractères maximum, un corps facultatif de 10 000 caractères maximum et `user.external_id` et/ou `user.email`. `user.name` est facultatif. L’identifiant externe accepte 255 caractères, l’email 254 et le nom 200. Votre backend garantit l’identité transmise ; l’ingestion anonyme est refusée. Le succès renvoie HTTP 201 avec `id`, `status`, `review_state`, les votes et le pseudonyme. Le board n’a pas besoin d’être activé pour l’ingestion. `analyze` est un booléen qui vaut true par défaut ; la chaîne "false" est refusée. Définissez-le sur false pour ignorer la modération, la catégorisation et la fusion des doublons de ce retour et lui donner l’état de revue `published` sans attente. Cet état de revue n’active pas le board et ne contourne pas les règles de visibilité du retour ou son statut spam. L’API crée les retours publics par défaut et n’accepte pas de paramètre de visibilité privée.

### Votes, erreurs et webhooks {#errors}

Envoyez `{"user":{"external_id":"demo-user-1"}}` par POST à `/api/v1/feedback/<id>/vote`, avec les mêmes en-têtes. Chaque identité dispose d’un vote ; répéter ce vote est idempotent. Un retour fusionné renvoie 409 `post_merged` et indique sa cible canonique.

La création autorise 20 appels par minute et par clé ; le vote, 60. Respectez `Retry-After` après 429. Vérifiez 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` et les erreurs de champs 422 avant de réessayer. La création n’est pas une mise à jour idempotente : si la réponse est perdue, vérifiez la boîte de retours de l’équipe avant de répéter. Les clés feedback n’ont pas de webhook sortant de tickets. Une intégration tickets configurée séparément fournit ce canal, avec sa signature et son contrat de livraison sans garantie.

### Identifier les visiteurs par SSO {#sso}

En tant que propriétaire, activez le board et configurez son secret SSO distinct. Votre backend signe un JWT HS256 avec un `sub` stable, un `exp` obligatoire et un email et un nom facultatifs. Limitez sa validité à 600 secondes et utilisez un `jti` unique ; la vérification tolère un décalage d’horloge de 60 secondes. Redirigez immédiatement vers `/f/<board-token>?sso=<jwt>`. Un token n’est consommable qu’une fois par board ; une nouvelle tentative exige un token fraîchement signé. Ne réutilisez jamais la clé d’ingestion comme secret SSO. Gardez les tokens hors des journaux et captures partagées.

Vérifiez que le visiteur ouvre Mes retours avec l’identité prévue. Un token expiré exige une nouvelle redirection. Si le secret est compromis, renouvelez-le avec la confirmation du board et mettez à jour le backend en même temps. Le parcours par code email reste disponible lorsque le SSO ne l’est pas.

![Séquences distinctes d’ingestion backend et de SSO navigateur, avec deux secrets.](/documentation/fr/feedback-ingestion-and-sso-workflow.svg)
