---
{
  "id": "ai-keys-and-models",
  "locale": "fr",
  "title": "Configurer ses clés IA et modèles",
  "summary": "Choisir fournisseurs et usages en tenant compte de leur facturation et du sandbox.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 3,
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
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/ai-keys-and-models-workflow.png",
      "alt": "Carte du fournisseur IA avec minddy Cloud sélectionné.",
      "caption": "Le fournisseur Cloud sélectionné utilise le forfait du compte. Le sélecteur permet de configurer un fournisseur personnel.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/ai-keys-and-models-defaults-workflow.png",
      "alt": "Modèle de code et niveau de raisonnement par défaut.",
      "caption": "Modèle de code et niveau de raisonnement par défaut. Les nouveaux workers utilisent ces réglages ; les workers en cours conservent leurs paramètres figés.",
      "revision": 4,
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
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Ajouter et affecter un fournisseur {#ai-keys-and-models}

Ouvrez les réglages IA du compte, ajoutez un fournisseur compatible et saisissez sa clé ainsi que l’URL de base éventuellement requise. Enregistrez et vérifiez l’état de confirmation. Pour les appels IA disposant d’un recours géré, une clé non confirmée ou injoignable laisse l’utilisation sur Minddy. Ce recours exige une IA gérée configurée ; les workers de code suivent les règles de modèle lié au fournisseur ci-dessous. Ne collez jamais la clé dans une conversation ou une capture.

Attribuez les familles de modèles de texte, transcription et embeddings à des clés compatibles ou laissez-les sur Minddy. Pour chaque clé, choisissez les usages activés : conversations Numo, travail sur le code, automatisations, voix et retours. Un usage ou une famille sans attribution utilisable reste comptabilisé sur Minddy. Votre fournisseur facture les appels réalisés avec sa clé. Le calcul de la sandbox serveur conserve un coût réel et reste comptabilisé dans l’utilisation. Cette comptabilisation est distincte de l’application d’une limite du compte : un worker utilisant une clé BYOK validée contourne le quota du forfait et le plafond de calcul, tandis que le travail financé par Minddy reste soumis à son allocation incluse.

![Carte du fournisseur IA avec minddy Cloud sélectionné.](/documentation/fr/ai-keys-and-models-workflow.png)


## Modèles et lieu d’exécution {#models}

Le choix du modèle de code est lié à son fournisseur. Après le changement, la désactivation ou la perte d’une clé personnelle, le choix précédent peut ne plus correspondre au fournisseur actif. Un nouveau worker refuse alors de démarrer jusqu’au choix d’un modèle compatible dans les réglages IA du compte ; il ne sélectionne pas automatiquement un modèle moins cher ou une valeur par défaut de la plateforme. Une exécution BYOK déjà fixée ne change pas de payeur lorsque sa clé devient indisponible.

Réglez ici le modèle de code et le niveau de raisonnement par défaut des nouveaux workers. Les workers existants conservent leur niveau de raisonnement fixé à la création. Choisissez séparément la région et la taille des nouvelles sandboxes. Ces valeurs par défaut ne remplacent pas le modèle sélectionné dans une conversation.

Lorsqu’ils sont configurés, Ollama local et les endpoints compatibles OpenAI peuvent servir les conversations par le bridge desktop. Ils ne peuvent pas servir le travail sur le code délégué ou les routines exécutées dans la sandbox serveur. Pour ces usages, choisissez un fournisseur joignable depuis le serveur. Retirez un fournisseur devenu inutile avec son contrôle de confirmation et vérifiez le routage obtenu avant la prochaine exécution.

![Modèle de code et niveau de raisonnement par défaut.](/documentation/fr/ai-keys-and-models-defaults-workflow.png)
