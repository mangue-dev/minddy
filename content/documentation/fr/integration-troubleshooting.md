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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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

Si des identifiants client existants sont requis, enregistrez le callback exact affiché chez le fournisseur. Sur desktop, OAuth s’ouvre dans le navigateur système puis revient dans l’application. Les connexions distantes exigent HTTPS public ; commandes locales et serveurs privés sont exclus. Placez tokens bearer et secrets dans authentification/en-têtes, pas l’URL. Changer l’URL efface identifiants et en-têtes conservés. Désactiver ou retirer bloque les nouveaux appels, mais une demande envoyée peut finir. Les connexions de routine appartiennent au propriétaire actuel ; un transfert ne réutilise pas l’accès personnel précédent.

## Inspecter avant de répéter un appel {#webhooks}

Les appels MCP distants ont un délai de 30 secondes, une limite de transport de 1 Mio et de résultat de 64 Ko. Une expiration ne prouve pas l’échec de mutation : vérifiez la destination avant répétition. Pour API 401, vérifiez instance, type et révocation sans afficher la clé ; un mauvais type retourne 403. Pour webhooks, examinez dernier statut, destination publique, HMAC sur corps brut et déduplication delivery_id. Une livraison abandonnée n’a pas de file persistante. Gardez codes contrôlés et heures, sans contenu privé ni identifiants.

## Vérifier permissions et synchronisation {#git}

Les adaptateurs visent github.com et gitlab.com. Vérifiez dépôt lié, accès d’installation et canal choisi. La synchronisation GitHub exige Issues lecture/écriture et abonnements Issues, Issue comments et Issue dependencies ; les installations existantes doivent accepter les nouveaux droits. Les anciens timestamps ne remplacent pas des éditions locales plus récentes. Les identités distantes empêchent les répétitions de livraison. Les URLs de fichiers intégrés restent liens forge, sans copie d’octets. Vérifiez état distant et local avant reconnexion ou répétition et ne partagez que des diagnostics expurgés.
