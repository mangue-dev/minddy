---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "fr",
  "title": "Connecter ingestion des retours et SSO visiteurs",
  "summary": "Garder les clés côté serveur et signer des identités courtes avec un secret de tableau distinct.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/feedback-ingestion-and-sso-workflow.png",
      "alt": "Séquences distinctes d’ingestion backend et de SSO navigateur, avec deux secrets.",
      "caption": "La clé d’ingestion authentifie les appels serveur. Le secret SSO du tableau signe un jeton visiteur court, à usage unique.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Envoyer depuis le backend {#feedback-ingestion-and-sso}

Le propriétaire du projet crée une clé d’intégration feedback dans les réglages du projet. Enregistrez la clé, affichée une seule fois, sous `MINDDY_FEEDBACK_KEY` dans la configuration secrète de votre backend. Ne l’intégrez jamais au code du navigateur. Définissez `MINDDY_ORIGIN` sur l’origine de l’instance cible, sans barre oblique finale.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Afficher la date de livraison","body":"Le support a besoin de la date prévue.","user":{"external_id":"demo-user-1","name":"Lecteur de démonstration"}}'
```

Fournissez un titre non vide de 200 caractères maximum, un corps facultatif de 10 000 caractères maximum et `user.external_id` et/ou `user.email`. L’identifiant externe accepte 255 caractères, l’email 254 et le nom 200. Votre backend garantit l’identité transmise ; l’ingestion anonyme est refusée. Le succès renvoie HTTP 201 avec `id`, `status`, `review_state`, les votes et le pseudonyme. Le board n’a pas besoin d’être activé pour l’ingestion. `analyze` vaut true par défaut ; false ignore modération, catégorisation et fusion pour ce retour et lui donne l’état de revue `published` sans attente. Cet état de revue n’active pas le board et ne contourne pas les règles de visibilité du retour ou son statut spam. L’API crée les retours publics par défaut et n’accepte pas de paramètre de visibilité privée.


## Votes, erreurs et webhooks {#errors}

Envoyez `{"user":{"external_id":"demo-user-1"}}` par POST à `/api/v1/feedback/<id>/vote`, avec les mêmes en-têtes. Chaque identité dispose d’un vote ; répéter ce vote est idempotent. Un retour fusionné renvoie 409 `post_merged` et indique sa cible canonique.

La création autorise 20 appels par minute et par clé ; le vote, 60. Respectez `Retry-After` après 429. Vérifiez 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` et les erreurs de champs 422 avant de réessayer. La création n’est pas une mise à jour idempotente : si la réponse est perdue, vérifiez la boîte de retours de l’équipe avant de répéter. Les clés feedback n’ont pas de webhook sortant de tickets. Une intégration tickets configurée séparément fournit ce canal, avec sa signature et son contrat de livraison sans garantie.


## Identifier les visiteurs par SSO {#sso}

En tant que propriétaire, activez le board et configurez son secret SSO distinct. Votre backend signe un JWT HS256 avec un `sub` stable, un `exp` obligatoire et un email et un nom facultatifs. Limitez sa validité à 600 secondes et utilisez un `jti` unique ; la vérification tolère un décalage d’horloge de 60 secondes. Redirigez immédiatement vers `/f/<board-token>?sso=<jwt>`. Un token n’est consommable qu’une fois par board ; une nouvelle tentative exige un token fraîchement signé. Ne réutilisez jamais la clé d’ingestion comme secret SSO. Gardez les tokens hors des journaux et captures partagées.

Vérifiez que le visiteur ouvre Mes retours avec l’identité prévue. Un token expiré exige une nouvelle redirection. Si le secret est compromis, renouvelez-le avec la confirmation du board et mettez à jour le backend en même temps. Le parcours par code email reste disponible lorsque le SSO ne l’est pas.

![Séquences distinctes d’ingestion backend et de SSO navigateur, avec deux secrets.](/documentation/fr/feedback-ingestion-and-sso-workflow.png)
