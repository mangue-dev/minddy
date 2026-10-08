---
{
  "id": "plans-and-ai-usage",
  "locale": "de",
  "title": "Cloud-Tarife und KI-Verbrauch verstehen",
  "summary": "Aktuelle Kapazität und Unterschiede zwischen Kontingent, Anbieter und Infrastruktur prüfen.",
  "topic": "Konto und Apps",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 2,
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
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/plans-and-ai-usage-workflow.png",
      "alt": "KI-Nutzungsseite des Demonstrationskontos.",
      "caption": "KI-Nutzungsseite des Demonstrationskontos. Budget, Nutzungskategorien und Verlauf werden aus dem Konto gelesen; kein Kauf oder kostenpflichtiger Lauf wurde ausgelöst.",
      "revision": 3,
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
    "plans-and-ai-usage-workflow"
  ]
}
---

## Das aktuelle Konto vergleichen {#plans-and-ai-usage}

Cloud bietet Free, Go und Pro. Alle enthalten MCP, Numo-Konversationen, Kontextaktionen, Codearbeit und Routinen. Kapazität, enthaltene KI, Modelle und Speicher unterscheiden sich. Öffnen Sie Abrechnung für Ihr aktuelles Kontingent und den Verbrauch. Vergleichen Sie vor der Tarifwahl die öffentliche Preisseite; ihre Angaben bilden die aktuelle Referenz.

Verwenden Sie den Ihrem Konto angebotenen Zahlungs- oder Abonnementverwaltungsbefehl. Prüfen Sie Betrag, Abrechnungszeitraum und Anbieterbestätigung, bevor Sie zustimmen. Ein erfolgreicher Tarifwechsel sollte in der Kontoabrechnung erscheinen. Prüfen Sie dies, statt ein geschlossenes Zahlungsfenster als Nachweis zu betrachten.


## Budgetverbrauch {#consumption}

Das enthaltene KI-Kontingent umfasst Reasoning, Minddy-Werkzeugaufrufe, Automatisierungen, Worker-Modellaufrufe und Rechenleistung der Serversandbox. Die monatliche Grenze des enthaltenen KI-Kontingents gilt für Arbeit, die Minddy finanziert. Das Limit pro Routinenlauf ist eine eigene Grenze, die den Lauf pausieren kann; abgeschlossene Arbeit bleibt in der Konversation erhalten. Diese Grenzen erlauben keine automatische Abrechnung von Überschreitungen. Prüfen Sie die Limitkarte und das Datum der Budgetzurücksetzung, sofern es verfügbar ist.

Kompatible persönliche Schlüssel lassen Modellaufrufe beim Anbieter abrechnen, statt das enthaltene KI-Kontingent zu verbrauchen. Für einen Worker mit einem validierten BYOK-Schlüssel gelten weder das Kontingent des Kontotarifs noch dessen Rechenleistungslimit. Die Sandbox-Rechenleistung verursacht weiterhin tatsächliche Kosten und wird im Verbrauch erfasst. Diese Erfassung bedeutet nicht, dass die monatliche Tarifgrenze auf diesen BYOK-Lauf angewendet wird. Nicht zugeordnete Familien oder Bereiche, deren Aufrufe Minddy finanziert, bleiben an ihr Minddy-Kontingent gebunden. Self-Hosting hat von der Installation abhängige Infrastruktur- und optionale Anbieterkosten. Derselbe Anwendungskern macht daraus kein Cloud-Abonnement.

## Kapazität der Kandidatenversion {#plan-capacities}

Diese Standardwerte beschreiben den identifizierten Kandidaten 0.11.1. Prüfen Sie vor einem Kauf die tatsächliche Preisseite und Ihr Konto. Konfigurierte Zahlungspreise und Kontoausnahmen können abweichen. Die Gästezahl schließt den Projektinhaber aus. Speicher wird dem Inhaber des Projekts angerechnet, das die Dateien erhält.

| Tarif | Projekte | Tickets pro Projekt | Gäste pro Projekt | Speicher | Enthaltene monatliche KI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unbegrenzt | Unbegrenzt | Unbegrenzt | 20 GiB | 5 |
| Pro | Unbegrenzt | Unbegrenzt | Unbegrenzt | 100 GiB | 15 |

![KI-Nutzungsseite des Demonstrationskontos.](/documentation/de/plans-and-ai-usage-workflow.png)
