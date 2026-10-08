---
{
  "id": "desktop-app",
  "locale": "fr",
  "title": "Installer et gérer l’application desktop",
  "summary": "Choisir le paquet et l’instance, puis suivre la mise à jour propre à la plateforme.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A12"
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
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "install-the-pwa",
    "web-and-mobile",
    "devices-and-notifications",
    "import-issues"
  ],
  "aliases": [
    "desktop-and-speed"
  ],
  "tags": [],
  "figures": [
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/desktop-app-workflow.png",
      "alt": "Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé.",
      "caption": "Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé. Cette capture ne valide ni les releases signées ni les autres systèmes.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "desktop-app-workflow"
  ]
}
---

## Installer et choisir un serveur {#desktop-app}
Ouvrez la page publique de téléchargement. Sur macOS, choisissez le paquet Apple silicon ou Intel. Sur Windows, installez l’application depuis Microsoft Store. Sur Linux, choisissez une AppImage ou un paquet deb/rpm signé correspondant à x64 ou ARM64. Suivez le guide de la plateforme et les instructions de vérification du paquet. Windows ne propose pas d’installeur exe.

Dans le sélecteur de serveur, choisissez Minddy Cloud, l’origine d’un serveur self-hosted ou le runtime local disponible. Vérifiez la destination avant de vous connecter : chaque compte appartient à son instance. OAuth utilise le navigateur système puis revient à l’application desktop. La présence d’un runtime local ne signifie pas que le worker de code Numo travaille dans votre dossier local.

## Onglets, fermeture et mises à jour {#operation}
Utilisez les commandes des onglets et la palette de commandes pour naviguer entre vos travaux. Suivez les raccourcis affichés pour votre plateforme : macOS utilise Command là où Windows et Linux utilisent généralement Control. Fermer la fenêtre la masque et laisse l’application active. Utilisez Quitter pour terminer l’application ; macOS propose Cmd+Q. Les notifications en arrière-plan dépendent du paquet et des capacités de la plateforme.

macOS et les AppImage portables proposent les mises à jour dans l’application. Windows se met à jour depuis Microsoft Store. Pour deb/rpm, installez le nouveau paquet vérifié. Les réglages desktop du compte affichent le serveur connecté et les commandes de mise à jour ou d’assistance disponibles. Après une mise à jour, vérifiez la version desktop affichée et confirmez que l’instance voulue s’ouvre toujours.

![Réglages Bureau dans la véritable application Electron de développement sur macOS, version 0.11.1, connectée au serveur local avec un profil isolé.](/documentation/fr/desktop-app-workflow.png)
