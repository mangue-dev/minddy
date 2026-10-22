---
{
  "id": "integration-troubleshooting",
  "locale": "fr",
  "title": "Dépannage des connexions",
  "summary": "MCP minddy connecte un assistant externe à minddy ; les connexions MCP personnelles permettent à Numo d’appeler d’autres serveurs.",
  "topic": "Concepts techniques",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts",
      "lib/server/mcp-http.ts",
      "lib/server/mcp-client.ts",
      "lib/server/safe-fetch.ts",
      "app/api/mcp/route.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "Récupérer une connexion OAuth, MCP, webhook ou Git"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Récupérer une connexion OAuth, MCP, webhook ou Git {#integration-troubleshooting}

MCP minddy connecte un assistant externe à minddy ; les connexions MCP personnelles permettent à Numo d’appeler d’autres serveurs. Onglets du compte et identifiants sont distincts. Pour MCP personnel, examinez l’état dans les paramètres et utilisez test/reconnexion. Découverte OAuth, inscription dynamique, PKCE et refresh sont disponibles, mais une entrée de catalogue ne contourne ni approbation, ni aperçu développeur, ni application enregistrée. Vérifiez les prérequis actuels du fournisseur avant de conclure à un défaut minddy.


## Reconnecter avec le bon périmètre {#oauth}

Si des identifiants client existants sont requis, enregistrez le callback exact affiché chez le fournisseur. Sur desktop, OAuth s’ouvre dans le navigateur système puis revient dans l’application. Les connexions MCP personnelles utilisées par Numo exigent HTTPS public ; commandes locales et serveurs privés sont exclus. Pour un assistant externe connecté au MCP minddy, consultez [l’accès réseau à votre instance](/docs/minddy-mcp#network-access). Placez tokens bearer et secrets dans authentification/en-têtes, pas l’URL. Changer l’URL efface identifiants et en-têtes conservés. Désactiver ou retirer bloque les nouveaux appels, mais une demande envoyée peut finir. Les connexions de routine appartiennent au propriétaire actuel ; un transfert ne réutilise pas l’accès personnel précédent.

## Inspecter avant de répéter un appel {#webhooks}

Les appels de Numo aux serveurs MCP personnels ont un délai de 30 secondes, une limite de transport de 1 Mio et de résultat de 64 Ko. Une expiration ne prouve pas l’échec de mutation : vérifiez la destination avant répétition. Pour API 401, vérifiez instance, type et révocation sans afficher la clé ; un mauvais type retourne 403. Pour webhooks, examinez dernier statut, destination publique, HMAC sur corps brut et déduplication `delivery_id`. Une livraison abandonnée n’a pas de file persistante. Gardez codes contrôlés et heures, sans contenu privé ni identifiants.

## Vérifier permissions et synchronisation {#git}

Les adaptateurs visent github.com et gitlab.com. Vérifiez dépôt lié, accès d’installation et canal choisi. La synchronisation GitHub exige Issues lecture/écriture et abonnements Issues, Issue comments et Issue dependencies ; les installations existantes doivent accepter les nouveaux droits. Les anciens timestamps ne remplacent pas des éditions locales plus récentes. Les identités distantes empêchent les répétitions de livraison. Les URLs de fichiers intégrés restent liens forge, sans copie d’octets. Vérifiez état distant et local avant reconnexion ou répétition et ne partagez que des diagnostics expurgés.
