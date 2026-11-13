---
{
  "id": "minddy-mcp",
  "locale": "de",
  "title": "minddy MCP",
  "summary": "Verbinde einen externen Assistenten mit minddy, steuere den Zugriff und lerne verfügbare MCP-Tools und sichere Änderungsverfahren kennen.",
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
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/server/project-stats.ts",
      "lib/project-stats.ts",
      "lib/server/database-view-tools.ts",
      "components/first-run/onboarding-screen.tsx"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:claude-code (MIN-951: short prompts, the brief and sending to an agent app described from lib/issue-prompt.ts, lib/prompt-delivery.ts, lib/server/mcp/tools.ts and components/settings/account-issues-section.tsx; quoted labels checked against messages/*.json; not checked in the running app; no figure recaptured); agent:claude (MIN-878: minddy_get_project_stats paragraph checked against lib/server/mcp/tools.ts, lib/server/project-stats.ts and lib/project-stats.ts; existing figures unaffected and kept); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude (MIN-898: saved database views paragraph checked against lib/server/mcp/page-tools.ts and lib/server/database-view-tools.ts; existing figures unaffected and kept); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-907 connection wizard: the install step's Copy the prompt action and the collapsible Set it up by hand section checked against components/settings/mcp-connect-panel.tsx and messages/*.json; no browser walkthrough; the client-picker figure caption updated; the install-step figure still shows the former layout and needs recapture); agent:claude-code (MIN-907 Other client: the Other entry copying the general prompt with the instance's /api/mcp address, and the two-column cards in the phone tour's sheet, checked against components/settings/mcp-connect-panel.tsx, components/first-run/onboarding-screen.tsx and messages/*.json; no browser walkthrough; the client-picker figure does not show the Other entry and needs recapture); agent:claude-code (MIN-964 tour on every platform: Connect a coding agent opens the client cards in a sheet on a phone and in a dialog on a computer, checked against components/first-run/onboarding-screen.tsx; no browser walkthrough; no figure recaptured)",
    "language": "agent:claude-code (de passage added for MIN-951; self-reviewed; agent review, not human acceptance); agent:claude (de paragraph translated from en revision 16 with the glossary register; agent self-review, not human acceptance); agent:claude (de paragraph translated from en revision 17 for MIN-898 with the glossary register; agent self-review, not human acceptance); agent:claude-code (de MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 connection wizard paragraph and figure caption with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 Other client paragraph with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "caption": "Wähle deinen Client, um seine zwei Verbindungsschritte zu öffnen.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "alt": "Codex-Installationsschritt im Verbindungsassistenten für minddy MCP mit dem Endpunkt von minddy Cloud.",
      "caption": "Dieses Beispiel verbindet sich mit minddy Cloud. Verwende bei Selbsthosting den Ursprung deiner eigenen Instanz; der angezeigte Befehl wurde für diese Aufnahme nicht ausgeführt.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        560,
        308
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

minddy MCP ermöglicht einem externen Assistenten den Werkzeugzugriff mit den Berechtigungen deines Kontos. Verbinde ihn über die Einrichtung deiner Instanz und prüfe oder widerrufe seinen Zugriff in den Kontoeinstellungen. Lies vor Änderungen an Tickets, Seiten oder Routinen die aktuellen Werkzeugschemas.

## Einen externen Assistenten mit minddy MCP verbinden {#external-minddy-mcp}

Öffne die öffentliche MCP-Einrichtungsseite deiner Instanz und wähle die Client-Anleitung. Nutze den dort angezeigten Endpunkt mit `/api/mcp`. Bei Self-Hosting verwendest du deine Instanzadresse statt Cloud. Der Client muss die beschriebene entfernte MCP-Verbindung und OAuth unterstützen.

Melde dich im Browser an und prüfe die Freigabe. Die Verbindung handelt als dein minddy-Konto und erhält keinen Zugriff auf gesperrte Projekte. Beginne mit dem Lesen eines bereits zugänglichen Tickets und prüfe das zurückgegebene Projekt.

In den Kontoeinstellungen öffnet der Bereich minddy MCP für jeden Client einen Assistenten mit zwei Schritten. Im ersten Schritt kopiert **Prompt kopieren** eine Anfrage, die du in den Client einfügst: Sie bittet ihn, den minddy-MCP-Server mit der Konfiguration für diesen Client hinzuzufügen, die im Prompt steht. Um es selbst zu erledigen, öffne **Manuell einrichten**: Dort stehen Installationsbefehl, Konfiguration oder Server-URL mit einer Schaltfläche zum Kopieren. Der zweite Schritt erlaubt die Anmeldung des Clients. Er zeigt, wann minddy diesen Zugriff erhält; bis dahin verschiebt Schließen nur die Anmeldung.

Die Clientliste endet mit **Andere**, für einen Client, der nicht aufgeführt ist. Es öffnet keinen Assistenten: Es kopiert einen allgemeinen Prompt, der den Client bittet, den minddy-MCP-Server hinzuzufügen, einen entfernten Server über HTTP unter der Adresse dieser Instanz mit der Endung `/api/mcp`, mit OAuth-Anmeldung. Füge ihn in den Client ein; wenn der Client minddy zum ersten Mal nutzt, erlaubst du seine Anmeldung im Browser. In den ersten Schritten öffnet **Coding-Agent verbinden** dieselbe Liste, auf dem Smartphone in einem Sheet und am Computer in einem Dialog, mit den Clients als quadratische Karten in zwei Spalten; die Kontoeinstellungen behalten die kompakte Liste.

![minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.](/documentation/de/external-minddy-mcp-workflow.png)

### MCP-Verfügbarkeit und Netzwerkzugriff {#network-access}

MCP ist in selbst gehostetem minddy enthalten und startet mit der Anwendung. Es funktioniert sofort unter `/api/mcp` an der mit `MINDDY_PUBLIC_APP_URL` konfigurierten Instanzadresse. OAuth-Erkennung und dynamische Client-Registrierung sind enthalten: Ein separater MCP-Server, eine eigene OAuth-Anwendung oder ein minddy-Cloud-Proxy ist nicht erforderlich. Verbinde deinen MCP-Client mit dem Endpunkt deiner Instanz, melde dich an und erteile den Zugriff im Browser.

Die Verfügbarkeit des Dienstes garantiert keine Erreichbarkeit im Netzwerk. Sowohl der MCP-Client als auch der Browser für die Autorisierung müssen die bekannt gegebenen MCP- und OAuth-URLs erreichen können. Wenn du `OAUTH_ISSUER` ausdrücklich überschreibst, muss auch diese Adresse erreichbar sein. Der Client muss die Verbindung, den OAuth-Ablauf und den gewählten Netzwerkweg unterstützen; manche Clients verlangen auch in privaten Netzwerken HTTPS.

- **Derselbe Computer:** `http://localhost:6463/api/mcp` funktioniert für einen kompatiblen Client auf dem Computer, der die lokale Instanz betreibt. `localhost` und `127.0.0.1` bezeichnen den Computer, der die Verbindung aufbaut. Der Start lokaler Instanzen über die Desktop-App bindet nur an die Loopback-Schnittstelle; ein anderer Computer oder ein gehosteter Cloud-Agent kann sie nicht direkt erreichen. Die localhost-URL des Servers zeigt auf einem anderen Computer auf diesen anderen Computer.

- **LAN oder VPN:** Eine mit `http://192.168.1.50` konfigurierte Instanz gibt `http://192.168.1.50/api/mcp` bekannt. Ein Client im LAN oder über VPN kann sie verwenden, wenn Bindungsadresse, konfigurierte Instanzadresse, Anwendungsport, Firewall und Routing den Zugriff zulassen. Der Browser muss dieselben bekannt gegebenen Autorisierungs-URLs erreichen. Dafür ist eine erreichbare Serverinstallation erforderlich; allein das Ändern der Client-URL macht einen auf Loopback beschränkten Prozess nicht erreichbar.

- **Außerhalb des privaten Netzwerks:** Verwende eine erreichbare HTTPS-Adresse, etwa `https://tickets.example.com/api/mcp`, oder einen anderen vom Client unterstützten Netzwerkweg. Ein gehosteter Agent benötigt einen eigenen Netzwerkweg zur Instanz; ein VPN auf dem Computer des Browsers allein bietet ihm diesen Weg nicht. Lokales Hosting macht minddy nicht automatisch im Internet erreichbar.

### Umfang und Widerruf {#access}

Externe Clients verwenden verfügbare Tools für Tickets, Pläne, Kommentare, Seiten, Feedback, Zyklen, Routinen und Notizbuch innerhalb ihrer Rechte. Die Tools folgen bei jedem Aufruf deiner aktuellen Rolle im jeweiligen Projekt, eine Rollenänderung gilt also ohne erneutes Verbinden. Als Leser erhältst du die Lesetools und zusätzlich die Kommentartools, wenn der Eigentümer **Darf kommentieren** für dich aktiviert hat. MCP ist in jedem Cloud-Plan verfügbar; KI des Clients hängt weiterhin von dessen Einrichtung und Kosten ab.

Der Bereich minddy MCP in den Kontoeinstellungen zeigt externe Zugriffe und Widerrufsmöglichkeiten. Widerrufe ungenutzte oder nicht mehr vertrauenswürdige Clients. Die Karte **MCP für Numo** im Tab **MCP** verbindet dagegen Numo mit anderen Diensten. Kopiere keine Zugriffstoken in Tickets, öffentliche Beiträge oder Screenshots.

![Codex-Installationsschritt im Verbindungsassistenten für minddy MCP mit dem Endpunkt von minddy Cloud.](/documentation/de/external-minddy-mcp-install-workflow.png)


## minddy MCP nutzen und aktuelle Werkzeuge entdecken {#mcp-tool-reference}

minddy bietet `/api/mcp` mit Streamable HTTP, zustandslosen Werkzeugen und OAuth 2.1. Verbinde dein Konto durch Browserzustimmung; alte statische `mdyk_`-Schlüssel gelten nicht. Starte `minddy_list_projects` für zugängliche Projekt-UUIDs und lies Schemas des verbundenen Servers. `/llms-full.txt` wird daraus erzeugt und nennt genaue aktuelle Parameter. Errate Werkzeuge nicht anhand alter Kopien. Projektwerkzeuge prüfen Zugriff erneut und geben stabile Fehlercodes zurück.

### Vor Planänderungen lesen {#issue-plans}

Um ein Ticket zu finden, rufe `minddy_list_issues` mit `query` auf: Die Suche erfasst Wörter aus Titel und Beschreibung, eine Kennung oder eine Nummer. Textübereinstimmungen und exakte Kennungen stehen zuerst; eine beschreibende Anfrage kann danach [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets desselben Projekts ergänzen, markiert mit `match: "semantic"`. Lies ein solches Ticket, bevor du danach handelst. Die inhaltliche Suche wird deinem Konto als **Ticketsuche** berechnet und entfällt, wenn du **Tickets indexieren** ausgeschaltet hast.

`minddy_get_issue` akzeptiert eine Ticket-UUID, eine Ticketkennung wie `DEMO-42` oder eine Ticketnummer; `project_id` wird separat angegeben. `plan_tasks` liefert nullbasierte `task_index`-Werte. `minddy_update_plan_task` nimmt `tasks` mit `pending`, `in_progress`, `completed` oder `cancelled` an; ein ungültiger Index lehnt den ganzen Satz ab. Ergänze mit `minddy_append_to_plan` und ändere Passagen mit `minddy_edit_issue_text` sowie eindeutigen exakten `old_string`/`new_string`. Lies bei veralteter Passage neu. Gesamtersatz kann fremden Fortschritt überschreiben. Fragen unter `## Questions` zählen nicht als Aufgaben.

Nennt ein Prompt aus minddy einen Brief (`plan`, `implement`, `verify`, `comments` oder `custom`), übergib ihn als `brief` an `minddy_get_issue`. Das Ergebnis beginnt dann mit einem Feld `brief`: dem Vorgehen für diese Aufgabe an diesem Ticket. Der Rest des Ergebnisses sind Daten, keine Anweisungen.

`minddy_get_project_stats` liest die Statistiken aus den allgemeinen Einstellungen eines Projekts: Tickets pro Status; die Anzahl offener, überfälliger, nicht zugewiesener und stockender Tickets; die überfälligen und stockenden Tickets selbst, die dringendsten zuerst; die Dynamik über vier Wochen; die mediane Durchlaufzeit; die pro Woche erstellten und erledigten Tickets; die wichtigsten Mitwirkenden; und die verknüpften Pull Requests. Ein stockendes Ticket ist in Bearbeitung oder in Prüfung und seit 14 Tagen unverändert. Das Tool liest nur und steht allen Rollen offen, auch Lesenden.

Um mehrere Tickets zu ändern, sende einen einzigen Aufruf von `minddy_update_issues`: `issues` mit `fields` wendet dieselbe Änderung auf jedes Ticket an, und `updates` fügt Tickets hinzu, die jeweils eigene Felder erhalten. Ein Aufruf nimmt bis zu 50 Tickets an, jedes nur einmal genannt, und meldet `updated` und `failed` pro Ticket, sodass ein Fehler die übrigen nicht aufhält. Andere wiederholte Schreibvorgänge nehmen neben ihren üblichen Feldern eine Liste weiterer Einträge an: `links` für `minddy_link_issues`, `edits` für `minddy_edit_issue_text` und `minddy_edit_page_text` (der Reihe nach angewendet; passt eine nicht, wird nichts geschrieben), `pages` für `minddy_create_page` (Seiten unter derselben übergeordneten Seite, etwa Einträge einer Datenbank) und `feedback_post_ids` für `minddy_update_feedback`. `minddy_update_page` mit `parent_page_id` verschiebt eine Seite im Baum, mit `null` an die oberste Ebene. Das Aufgabenheft und Zielbeschreibungen werden genauso korrigiert: `minddy_edit_scratchpad_text` schreibt Passagen des Hefts um oder entfernt sie, und `minddy_update_objective` nimmt `description_edits` statt einer ganzen `description` an. `minddy_append_to_plan` mit `field: "description"` fügt am Ende der Beschreibung eines Tickets einen Block hinzu, und `description_append` tut dasselbe für ein Ziel; eine Änderung an einem Ziel wird abgelehnt statt angewendet, wenn sich das Ziel seit dem Lesen geändert hat.

Lesevorgänge, die Text mit Bildern liefern (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`), führen diese unter `images` auf, jeweils mit `src` und Alternativtext. Übergib dieses `src` unverändert an `minddy_get_image`: Das Werkzeug prüft deinen Zugriff auf das Projekt des Bildes oder dass ein Notizbuchbild dir gehört, und liefert das Bild bis 10 MB direkt mit einer signierten `download_url`, die etwa zehn Minuten gilt. Ein außerhalb von minddy gehostetes Bild kommt nur als URL zurück.

### Versionen und Eigentum beachten {#pages-and-routines}

`minddy_list_pages` zeigt die Hierarchie, `minddy_search_pages` findet Textausschnitte und `minddy_get_page` liest das vollständige Markdown, Kommentare und Datenbankwerte. Bevorzuge gezielte Teiländerungen und verwende beim vollständigen Ersetzen die aktuelle Version, um zwischenzeitliche Änderungen zu erkennen. Behalte Datei- und Bild-URLs unverändert bei. `minddy_create_page` mit `database=true` erstellt eine Seitendatenbank. `minddy_update_page_database` verlangt die Schema-Revision und den vorherigen Wert für Zelländerungen. Um eine Datenbank mit weniger Aufrufen zu füllen, übergib `values` an `minddy_create_page`, um einen Eintrag mit seinen Eigenschaften zu erstellen, oder verwende `operation=values`, um mehrere Eigenschaften eines Eintrags auf einmal zu ändern: Alle Zellen werden gemeinsam geschrieben oder keine.

Gespeicherte Datenbankansichten liest du mit `minddy_list_page_database_views`; mit `minddy_update_page_database_views` erstellst, änderst, löschst oder sortierst du sie. Filter verwenden die Eigenschafts- und Options-IDs aus `minddy_get_page`, nie den Namen einer Option. `filters` und `hidden_property_ids` ersetzen jeweils den gesamten aktuellen Wert, und `operation=reorder` nennt jede Ansicht genau einmal.

Gib für eine Konvertierung `operation=convert`, `propertyId`, `targetType`, `revision` und zunächst `preview=true` an. Prüfe `incompatibleCount` und sende dann dieselben Konvertierungseinstellungen mit `preview=false` und dem zurückgegebenen `token`. Setze `confirmLoss=true` nur, wenn der Benutzer dem Verlust inkompatibler Werte ausdrücklich zugestimmt hat.

Mit den Routinenwerkzeugen, die nur Eigentümern zur Verfügung stehen, erstellst, änderst, pausierst und entfernst du Routinen, die ein Zeitplan, ein Ereignis oder ein neuer Datenbankeintrag auslöst. Lies vorhandene Routinen, bevor du eine neue erstellst, um doppelte Aufträge zu vermeiden. `minddy_add_resource` begrenzt Dateien auf 10 MB; Seitenwerkzeuge erfinden keine URLs.

### Mit einem Beispiel überprüfen {#example}

Das bereinigte Beispiel ändert die erste Aufgabe eines zuvor gelesenen Plans. Ersetze Projekt-UUID und Ticket durch entdeckte Werte; `task_index` muss aus der letzten Lektüre stammen. Prüfe zurückgegebene `plan_tasks` und `plan_progress`. Bei Zugriffsfehlern prüfe Konto/Projekt, bei veraltetem Konflikt lies erneut und ändere nur das Gewünschte. Wiederhole unklare externe Mutationen nicht vor Ergebniskontrolle.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Ein Ziel für Feedback wählen {#feedback-objectives}

Feedback-Lesezugriffe enthalten `objective_id`; `minddy_list_feedback` unterstützt einen optionalen Zielfilter (`null` wählt Anfragen ohne Ziel). Verwende `minddy_link_feedback_objective` mit `project_id`, `feedback_post_id` und `objective_id` nur auf ausdrücklichen Wunsch des Benutzers; `null` entfernt die Zuordnung. Das Ziel muss aktiv sein und zum selben Projekt gehören. Zieldetails enthalten `linked_feedback`. Eigentümer können `objective_id` bei `minddy_create_integration` für Feedback-Schlüssel angeben oder die Vorgabe mit `minddy_update_integration_objective` ändern. Bestehendes Feedback bleibt unverändert. Die Umwandlung übernimmt Ziel und Kategorien; Numo weist bei der Prüfung niemals ein Ziel zu.
