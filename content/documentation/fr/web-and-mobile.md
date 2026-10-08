---
{
  "id": "web-and-mobile",
  "locale": "fr",
  "title": "Travailler sur le web et sur mobile",
  "summary": "Naviguer entre projets, tickets et Numo en gardant les besoins réseau visibles.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A10"
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json"
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
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/web-and-mobile-workflow.png",
      "alt": "Panneau mobile d’un ticket avec titre, description, propriétés et zone de commentaire.",
      "caption": "Sur un écran étroit, les détails du ticket occupent un panneau adaptatif. Utilisez le bouton de fermeture pour revenir au projet ; Numo reste accessible par son bouton flottant.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow"
  ]
}
---

## Ouvrir et modifier un ticket {#web-and-mobile}
Ouvrez l’adresse de votre instance et connectez-vous à celle-ci. Sur un écran étroit, affichez la barre latérale pour choisir un projet, puis ouvrez un ticket depuis la liste ou le tableau. Consultez ses détails dans le panneau adapté à l’écran, modifiez le champ voulu ou ajoutez un commentaire, puis attendez le résultat de l’enregistrement avant de fermer. Fermez le panneau de détails pour revenir à la liste ; sa présentation mobile diffère de celle d’un écran large.

Ouvrez Numo avec son bouton flottant ou une action contextuelle du ticket. Vérifiez le contexte du ticket dans le champ de saisie. Si un panneau masque le contenu dont vous avez besoin, fermez-le avant de poursuivre la navigation. Sur un écran tactile, utilisez les boutons et menus explicites : les actions au survol et les raccourcis d’un ordinateur ne sont pas toujours disponibles.

## Clavier et connexion {#access}
Au clavier, vous pouvez placer le focus sur les contrôles et utiliser la palette de commandes pour naviguer ou effectuer les actions courantes. Le bouton d’envoi reste une alternative au raccourci clavier. Suivez le raccourci affiché par l’application pour votre plateforme.

Le navigateur et l’application web installée ont besoin d’une connexion réseau pour accéder aux données des projets et enregistrer les modifications. Le service worker gère les notifications push sans fournir de cache de données hors ligne. Après une coupure, vérifiez si la modification a été enregistrée avant de la répéter. Installer la PWA ne crée pas de compte distinct et ne modifie pas les permissions de l’instance.

![Panneau mobile d’un ticket avec titre, description, propriétés et zone de commentaire.](/documentation/fr/web-and-mobile-workflow.png)
