---
{
  "id": "encryption-and-data-boundaries",
  "locale": "fr",
  "title": "Comprendre le chiffrement et ses limites",
  "summary": "Après configuration et migration, Minddy chiffre contenu et fichiers avant leur stockage durable avec un chiffrement authentifié côté serveur.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "workspace-encryption",
    "restore-and-roll-back",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/fr/encryption-and-data-boundaries-flow.svg",
      "alt": "Schéma: Contenu durable chiffré et clés enveloppées. Racine conservée dans le serveur protégé. Le runtime autorisé peut déchiffrer. Exports et fournisseurs : protection distincte.",
      "caption": "Ces composants ont des responsabilités distinctes. Contenu durable chiffré et clés enveloppées. Racine conservée dans le serveur protégé. Le runtime autorisé peut déchiffrer. Exports et fournisseurs : protection distincte.",
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
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Comprendre le chiffrement et ses limites {#encryption-and-data-boundaries}

Après configuration et migration, Minddy chiffre contenu et fichiers avant leur stockage durable avec un chiffrement authentifié côté serveur. Les clés projet, utilisateur et système sont versionnées et enveloppées par une racine dédiée hors PostgreSQL. Une extraction de base seule ne lit pas le contenu protégé sans clés. L’application déchiffre pour accès autorisé, recherche et travail IA autonome. Un runtime compromis ou l’accès simultané aux clés et aux données franchit cette frontière ; l’opérateur n’est pas exclu par un chiffrement de bout en bout.


![Schéma: Contenu durable chiffré et clés enveloppées. Racine conservée dans le serveur protégé. Le runtime autorisé peut déchiffrer. Exports et fournisseurs : protection distincte.](/documentation/fr/encryption-and-data-boundaries-flow.svg)

## Repérer les données lisibles et exportées {#exceptions}

Auth conserve l’email de connexion comme identité. Identifiants de routage, clés projets/tickets, statuts, priorités, dates et métadonnées autorisées restent interrogeables. Le contenu publié est volontairement lisible par son public. Exports, fichiers téléchargés, contenu visible du navigateur et données envoyées à IA, email, Git ou MCP externes nécessitent leurs propres règles. Un flag configuré ne prouve pas conversion ou retrait des copies historiques, journaux ou données retenues chez les fournisseurs. Ne déduisez jamais le chiffrement Cloud en production du seul code du dépôt.

## Préserver la récupération {#recovery}

Protégez MINDDY_DATA_ROOT_KEY hors de la base et gardez les copies de récupération pour sauvegardes actuelles et anciennes. Restaurez base, octets Storage et configuration correspondante en un ensemble cohérent. Chiffrez la sauvegarde externe si elle contient données et clés. Changer de racine sans réenvelopper rend le contenu illisible ; désactiver le chiffrement ne remet pas le texte en clair. Répétez la récupération avant activation sur données existantes et vérifiez déchiffrement réel et octets téléchargés.
