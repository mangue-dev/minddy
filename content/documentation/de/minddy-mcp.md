---
{
  "id": "minddy-mcp",
  "locale": "de",
  "title": "minddy MCP",
  "summary": "Verbinden Sie einen externen Assistenten mit minddy, steuern Sie den Zugriff und lernen Sie verfügbare MCP-Tools und sichere Änderungsverfahren kennen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 de network guidance and terminology review)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Einen externen Assistenten mit minddy MCP verbinden",
    "minddy MCP nutzen und aktuelle Werkzeuge entdecken"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-workflow.png",
      "alt": "minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.",
      "caption": "Wähle deinen Client, um dessen Installationsbefehl oder Konfiguration anzuzeigen.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-install-workflow.png",
      "alt": "Codex-Installationsdialog auf der lokalen Instanz.",
      "caption": "Codex-Installationsdialog. Verwende den Ursprung deiner eigenen Instanz; der angezeigte Befehl wurde für diese Aufnahme nicht ausgeführt.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        380
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

minddy MCP ermöglicht einem externen Assistenten den Werkzeugzugriff mit den Berechtigungen Ihres Kontos. Verbinden Sie ihn über die Einrichtung Ihrer Instanz und prüfen oder widerrufen Sie seinen Zugriff in den Kontoeinstellungen. Lesen Sie vor Änderungen an Tickets, Seiten oder Routinen die aktuellen Werkzeugschemas.

## Einen externen Assistenten mit minddy MCP verbinden {#external-minddy-mcp}

Öffnen Sie die öffentliche MCP-Einrichtungsseite Ihrer Instanz und wählen Sie die Client-Anleitung. Nutzen Sie den dort angezeigten Endpunkt mit `/api/mcp`. Bei Self-Hosting verwenden Sie Ihre Instanzadresse statt Cloud. Der Client muss die beschriebene entfernte MCP-Verbindung und OAuth unterstützen.

Melden Sie sich im Browser an und prüfen Sie die Freigabe. Die Verbindung handelt als Ihr minddy-Konto und erhält keinen Zugriff auf gesperrte Projekte. Beginnen Sie mit dem Lesen eines bereits zugänglichen Tickets und prüfen Sie das zurückgegebene Projekt.

![minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.](/documentation/de/external-minddy-mcp-workflow.png)

### MCP-Verfügbarkeit und Netzwerkzugriff {#network-access}

MCP ist in selbst gehostetem minddy enthalten und startet mit der Anwendung. Es funktioniert sofort unter `/api/mcp` an der mit `MINDDY_PUBLIC_APP_URL` konfigurierten Instanzadresse. OAuth-Erkennung und dynamische Client-Registrierung sind enthalten: Ein separater MCP-Server, eine eigene OAuth-Anwendung oder ein minddy-Cloud-Proxy ist nicht erforderlich. Verbinden Sie Ihren MCP-Client mit dem Endpunkt Ihrer Instanz, melden Sie sich an und erteilen Sie den Zugriff im Browser.

Die Verfügbarkeit des Dienstes garantiert keine Erreichbarkeit im Netzwerk. Sowohl der MCP-Client als auch der Browser für die Autorisierung müssen die bekannt gegebenen MCP- und OAuth-URLs erreichen können. Wenn Sie `OAUTH_ISSUER` ausdrücklich überschreiben, muss auch diese Adresse erreichbar sein. Der Client muss die Verbindung, den OAuth-Ablauf und den gewählten Netzwerkweg unterstützen; manche Clients verlangen auch in privaten Netzwerken HTTPS.

- **Derselbe Computer:** `http://localhost:6463/api/mcp` funktioniert für einen kompatiblen Client auf dem Computer, der die lokale Instanz betreibt. `localhost` und `127.0.0.1` bezeichnen den Computer, der die Verbindung aufbaut. Der Start lokaler Instanzen über die Desktop-App bindet nur an die Loopback-Schnittstelle; ein anderer Computer oder ein gehosteter Cloud-Agent kann sie nicht direkt erreichen. Die localhost-URL des Servers zeigt auf einem anderen Computer auf diesen anderen Computer.

- **LAN oder VPN:** Eine mit `http://192.168.1.50` konfigurierte Instanz gibt `http://192.168.1.50/api/mcp` bekannt. Ein Client im LAN oder über VPN kann sie verwenden, wenn Bindungsadresse, konfigurierte Instanzadresse, Anwendungsport, Firewall und Routing den Zugriff zulassen. Der Browser muss dieselben bekannt gegebenen Autorisierungs-URLs erreichen. Dafür ist eine erreichbare Serverinstallation erforderlich; allein das Ändern der Client-URL macht einen auf Loopback beschränkten Prozess nicht erreichbar.

- **Außerhalb des privaten Netzwerks:** Verwenden Sie eine erreichbare HTTPS-Adresse, etwa `https://tickets.example.com/api/mcp`, oder einen anderen vom Client unterstützten Netzwerkweg. Ein gehosteter Agent benötigt einen eigenen Netzwerkweg zur Instanz; ein VPN auf dem Computer des Browsers allein bietet ihm diesen Weg nicht. Lokales Hosting macht minddy nicht automatisch im Internet erreichbar.

### Umfang und Widerruf {#access}

Externe Clients verwenden verfügbare Tools für Tickets, Pläne, Kommentare, Seiten, Feedback, Zyklen, Routinen und Notizbuch innerhalb ihrer Rechte. MCP ist in jedem Cloud-Tarif verfügbar; KI des Clients hängt weiterhin von dessen Einrichtung und Kosten ab.

Der Bereich minddy MCP in den Kontoeinstellungen zeigt externe Zugriffe und Widerrufsmöglichkeiten. Widerrufen Sie ungenutzte oder nicht mehr vertrauenswürdige Clients. MCP für Numo verbindet dagegen Numo mit anderen Diensten. Kopieren Sie keine Zugriffstoken in Tickets, öffentliche Beiträge oder Screenshots.

![Codex-Installationsdialog auf der lokalen Instanz.](/documentation/de/external-minddy-mcp-install-workflow.png)


## minddy MCP nutzen und aktuelle Werkzeuge entdecken {#mcp-tool-reference}

minddy bietet `/api/mcp` mit Streamable HTTP, zustandslosen Werkzeugen und OAuth 2.1. Verbinden Sie Ihr Konto durch Browserzustimmung; alte statische `mdyk_`-Schlüssel gelten nicht. Starten Sie `minddy_list_projects` für zugängliche Projekt-UUIDs und lesen Sie Schemas des verbundenen Servers. `/llms-full.txt` wird daraus erzeugt und nennt genaue aktuelle Parameter. Erraten Sie Werkzeuge nicht anhand alter Kopien. Projektwerkzeuge prüfen Zugriff erneut und geben stabile Fehlercodes zurück.

### Vor Planänderungen lesen {#issue-plans}

`minddy_get_issue` akzeptiert eine Ticket-UUID, eine Ticketkennung wie `DEMO-42` oder eine Ticketnummer; `project_id` wird separat angegeben. `plan_tasks` liefert nullbasierte `task_index`-Werte. `minddy_update_plan_task` nimmt `tasks` mit `pending`, `in_progress`, `completed` oder `cancelled` an; ein ungültiger Index lehnt den ganzen Satz ab. Ergänzen Sie mit `minddy_append_to_plan` und ändern Sie Passagen mit `minddy_edit_issue_text` sowie eindeutigen exakten `old_string`/`new_string`. Lesen Sie bei veralteter Passage neu. Gesamtersatz kann fremden Fortschritt überschreiben. Fragen unter `## Questions` zählen nicht als Aufgaben.

### Versionen und Eigentum beachten {#pages-and-routines}

`minddy_list_pages` zeigt Hierarchie, `minddy_search_pages` Textausschnitte und `minddy_get_page` vollständiges Markdown, Kommentare und Datenbankwerte. Verwenden Sie Teiländerungen und aktuelle Versionsguards bei Gesamtersatz. Erhalten Sie Datei-/Bild-URLs exakt. `minddy_create_page` mit `database=true` erstellt Datenbanken; `minddy_update_page_database` verlangt Revision für Schema, vorherigen Wert für Zellen und Vorschau-/Anwendungstokens für Konvertierung. Eigentümerwerkzeuge erstellen, pausieren, verschieben und entfernen Routinen. Lesen Sie zuerst vorhandene Routinen gegen Duplikate. `minddy_add_resource` begrenzt Dateien auf 10 MB; Seitenwerkzeuge erfinden keine URLs.

### Mit einem Beispiel überprüfen {#example}

Das bereinigte Beispiel ändert die erste Aufgabe eines zuvor gelesenen Plans. Ersetzen Sie Projekt-UUID und Ticket durch entdeckte Werte; `task_index` muss aus der letzten Lektüre stammen. Prüfen Sie zurückgegebene `plan_tasks` und `plan_progress`. Bei Zugriffsfehlern prüfen Sie Konto/Projekt, bei veraltetem Konflikt lesen Sie erneut und ändern nur das Gewünschte. Wiederholen Sie unklare externe Mutationen nicht vor Ergebniskontrolle.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
