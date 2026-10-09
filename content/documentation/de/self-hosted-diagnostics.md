---
{
  "id": "self-hosted-diagnostics",
  "locale": "de",
  "title": "Instanzdiagnose",
  "summary": "Führen Sie den nur lesenden doctor aus dem tatsächlich installierten Release-Checkout und der geschützten Umgebung aus.",
  "topic": "Instanz betreiben",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Fehler einer selbstgehosteten Installation eingrenzen"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Fehler einer selbstgehosteten Installation eingrenzen {#self-hosted-diagnostics}

Führen Sie den nur lesenden doctor aus dem tatsächlich installierten Release-Checkout und der geschützten Umgebung aus. Verwenden Sie `--mode full` mit Upstream-Compose-Pfad oder managed mit Anbieter-Datenbankverbindung. Er prüft Kompatibilität, Konfiguration, Container, DNS/TLS, Anwendung, Speicher, Scheduler und Runner. Migrationen und Storage brauchen die passende Verbindung. Schwärzung hilft, prüfen Sie Berichte dennoch vor Weitergabe. Liveness beweist weder Kontomailzustellung noch lesbare verschlüsselte Inhalte oder restaurierte Dateien.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Symptome gezielt prüfen {#symptoms}

Prüfen Sie bei allgemeinen 401 nach Restore, dass JWT, Anon- und Service-Role-Schlüssel zu demselben Stack gehören. Bei Uploadfehlern oder 404 vergleichen Sie Storage-Richtlinien, Objekte, Bytes und Schlüssel. Bei fehlenden Relationen erhalten Sie den ersten Migrationsfehler, prüfen Platte, Sperren und Ziel-URL und wiederholen Bootstrap erst nach Ursachenbehebung. Markieren Sie gescheiterte Migrationen nie manuell als ausgeführt. Prüfen Sie für Realtime Publikation, JWT, WebSocket-Proxy und Logs. Prüfen Sie bei inaktiven Cronjobs oder 401 Scheduler, kanonischen Origin und `CRON_SECRET` privat.

## Wiederherstellbarkeit erhalten {#recovery}

Beheben Sie fehlendes Docker/CLI oder unvollständige API-Werte und wiederholen Sie den idempotenten Installer mit erhaltener Umgebung. Korrigieren Sie öffentliche Laufzeit-URLs und erstellen Sie die App neu, ohne OCI-Neubuild. Löschen Sie keine gefüllten Buckets, Daten oder Wurzelschlüssel wegen Warnungen. Optionale deaktivierte Funktionen können beabsichtigt sein. Geben Sie Support Version, Profil, Zeiten, kontrollierte Fehlercodes und bereinigte Diagnosen. Entfernen Sie Passwörter, Tokens, `Authorization`-Header, Cookies, private Objekt-URLs und Benutzerinhalte.


Bricht der erste Image-Download nach einem langen Fortschrittsprotokoll ohne Registry-Fehler ab, kann der Installer von v0.11.0 seinen Ausgabepuffer für Unterprozesse überschreiten. Im exakten Compose-Kontext der Installation war `compose pull --quiet` im Wegwerftest erfolgreich. Wiederholen Sie anschließend denselben Installer mit `--skip-pull`, um die geladenen Images zu verwenden und die Umgebung zu erhalten. Das behebt weder Registry- noch Signaturfehler. Meldet die Offline-Kompilierung nach einer Installation mit eingefrorenen Abhängigkeiten eine abweichende `jose`-Version, halten Sie an: Diese Release verlangt 6.2.3, ihre direkte eingefrorene Abhängigkeit ergibt jedoch 6.2.12. Besorgen Sie eine korrigierte Kombination aus Release und Werkzeugen, bevor Sie die Standardinstallation abnehmen; lockern Sie die Identitätsprüfung nicht stillschweigend.


Auch der OCI-Runner von v0.11.0 startet nicht, weil `agent-runner-storage.mjs` im Runtime-Image fehlt. Die aktuelle `Dockerfile` enthält diese Abhängigkeit inzwischen. Im Wegwerfversuch wurde die Datei desselben Tags schreibgeschützt eingebunden. Das ist ein ausdrücklich geändertes Profil und keine Abnahme des unveränderten signierten Images. Veröffentlichen Sie weder den Runner-Port noch lockern Sie seine Isolation, um Startfehler zu umgehen.
