---
{
  "id": "web-and-mobile",
  "locale": "de",
  "title": "Im Browser und auf kleinen Bildschirmen arbeiten",
  "summary": "Projekte, Ticketdetails und Numo mit ihren Netzwerkanforderungen nutzen.",
  "topic": "Konto und Apps",
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
      "src": "/documentation/de/web-and-mobile-workflow.png",
      "alt": "Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.",
      "caption": "Auf einem schmalen Bildschirm erscheinen Ticketdetails in einem angepassten Panel. Schließen Sie es über die Schaltfläche, um zum Projekt zurückzukehren; Numo bleibt über seine schwebende Schaltfläche erreichbar.",
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

## Ein Ticket öffnen und bearbeiten {#web-and-mobile}
Öffnen Sie die Adresse Ihrer Instanz und melden Sie sich dort an. Blenden Sie auf einem schmalen Bildschirm die Seitenleiste ein, wählen Sie ein Projekt und öffnen Sie ein Ticket aus der Liste oder dem Board. Lesen Sie die Details im an die Bildschirmgröße angepassten Panel, ändern Sie das gewünschte Feld oder fügen Sie einen Kommentar hinzu. Warten Sie auf das Ergebnis der Speicherung, bevor Sie das Panel schließen. Schließen Sie das Detailpanel, um zur Liste zurückzukehren; die mobile Darstellung unterscheidet sich von der Darstellung auf einem breiten Bildschirm.

Öffnen Sie Numo über die schwebende Schaltfläche oder eine Kontextaktion des Tickets. Prüfen Sie den Ticketkontext im Eingabefeld. Wenn ein Panel den benötigten Inhalt verdeckt, schließen Sie es vor der weiteren Navigation. Verwenden Sie auf Touchgeräten die sichtbaren Schaltflächen und Menüs; setzen Sie weder Aktionen beim Darüberfahren mit der Maus noch Desktop-Tastenkürzel voraus.

## Tastatur und Verbindung {#access}
Mit der Tastatur können Sie Steuerelemente fokussieren und die Befehlspalette für die Navigation und häufige Aktionen verwenden. Die sichtbare Sendeschaltfläche bleibt eine Alternative zur Tastatureingabe. Verwenden Sie das Kürzel, das die App für Ihre Plattform anzeigt.

Browser und installierte Web-App benötigen eine Netzwerkverbindung für Projektdaten und das Speichern von Änderungen. Der Service Worker verarbeitet Push-Mitteilungen und stellt keinen Offline-Datencache bereit. Prüfen Sie nach einem Verbindungsfehler, ob die Änderung gespeichert wurde, bevor Sie sie wiederholen. Die PWA-Installation erstellt kein separates Konto und umgeht keine Instanzberechtigungen.

![Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.](/documentation/de/web-and-mobile-workflow.png)
