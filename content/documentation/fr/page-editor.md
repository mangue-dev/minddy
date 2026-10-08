---
{
  "id": "page-editor",
  "locale": "fr",
  "title": "Écrire une page avec blocs et mentions",
  "summary": "Utilisez contenu structuré, encadrés et liens en vérifiant l’enregistrement des modifications.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-files",
    "page-comments-and-collaboration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-editor.png",
      "alt": "Page de démonstration avec titres, paragraphes, cases de tâches et mention d’un ticket.",
      "caption": "Les titres, blocs de tâches et la mention AUR-2 structurent la page. Ce contenu est un exemple de démonstration.",
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
    "page-editor-steps"
  ]
}
---

## Écrire le document {#page-editor}

Ouvrez la page et modifiez son titre ou son corps en tant que membre. Le menu slash et les commandes de mise en forme insèrent titres, paragraphes, listes, tâches, code, sections repliables et encadrés. Un encadré peut porter une icône emoji et une couleur de palette ; utilisez-les pour distinguer une information, sans faire de la couleur l’unique moyen de comprendre un avertissement.

Les mentions relient tickets, objectifs, personnes ou pages. Les liens retour aident à retrouver les pages qui citent celle-ci. Un lien apporte du contexte, sans ouvrir les objets privés d’un autre projet.


![Page de démonstration avec titres, paragraphes, cases de tâches et mention d’un ticket.](/documentation/fr/page-editor.png)

## Enregistrement et portabilité {#editor-save}

Surveillez l’indicateur d’enregistrement avant de quitter une modification importante. En cas de conflit, utilisez les commandes de récupération et conservez votre texte ; ne supposez pas que les deux modifications ont fusionné. L’historique aide à inspecter les versions enregistrées.

Les exports Markdown et les lectures par des agents préservent les icônes et couleurs des encadrés dans leur représentation prise en charge. La fidélité du contenu et le traitement des pièces jointes varient selon le format ; vérifiez le résultat avant de remplacer la source. Utilisez des blocs de code pour les commandes littérales et gardez les prérequis et les avertissements autour d’elles.
