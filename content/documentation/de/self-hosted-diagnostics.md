---
{
  "id": "self-hosted-diagnostics",
  "locale": "de",
  "title": "Instanzdiagnose",
  "summary": "Führe den nur lesenden doctor aus dem tatsächlich installierten Release-Checkout und der geschützten Umgebung aus.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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

Führe den nur lesenden doctor aus dem tatsächlich installierten Release-Checkout und der geschützten Umgebung aus. Verwende `--mode full` mit Upstream-Compose-Pfad oder managed mit Anbieter-Datenbankverbindung. Er prüft Kompatibilität, Konfiguration, Container, DNS/TLS, Anwendung, Speicher und Scheduler. Migrationen und Storage brauchen die passende Verbindung. Schwärzung hilft, prüfe Berichte dennoch vor Weitergabe. Liveness beweist weder Kontomailzustellung noch lesbare verschlüsselte Inhalte oder restaurierte Dateien.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Symptome gezielt prüfen {#symptoms}

Prüfe bei allgemeinen 401 nach Restore, dass JWT, Anon- und Service-Role-Schlüssel zu demselben Stack gehören. Bei Uploadfehlern oder 404 vergleiche Storage-Richtlinien, Objekte, Bytes und Schlüssel. Bei fehlenden Relationen erhalte den ersten Migrationsfehler, prüfe Platte, Sperren und Ziel-URL und wiederhole Bootstrap erst nach Ursachenbehebung. Markiere gescheiterte Migrationen nie manuell als ausgeführt. Prüfe für Realtime Publikation, JWT, WebSocket-Proxy und Logs. Prüfe bei inaktiven Cronjobs oder 401 Scheduler, kanonischen Origin und `CRON_SECRET` privat. Schlägt die Versionskompatibilität fehl, vergleiche `MINDDY_RELEASE` mit einem Eintrag in `deploy/self-hosted/compatibility.json` und `MINDDY_IMAGE` mit diesem Eintrag oder dem geprüften unveränderlichen Digest. Der Installer übernimmt `MINDDY_RELEASE` aus der Bereitstellungsvorlage.

## Wiederherstellbarkeit erhalten {#recovery}

Behebe fehlendes Docker/CLI oder unvollständige API-Werte und wiederhole den idempotenten Installer mit erhaltener Umgebung. Korrigiere öffentliche Laufzeit-URLs und erstelle die App neu, ohne OCI-Neubuild. Lösche keine gefüllten Buckets, Daten oder Wurzelschlüssel wegen Warnungen. Optionale deaktivierte Funktionen können beabsichtigt sein. Gib Support Version, Profil, Zeiten, kontrollierte Fehlercodes und bereinigte Diagnosen. Entferne Passwörter, Tokens, `Authorization`-Header, Cookies, private Objekt-URLs und Benutzerinhalte.


Bricht der erste Image-Download nach einem langen Fortschrittsprotokoll ohne Registry-Fehler ab, kann der Installer von v0.11.0 seinen Ausgabepuffer für Unterprozesse überschreiten. Spätere Installer laden leise mit einem größeren Puffer und brechen, falls die Ausgabe ihn dennoch überschreitet, mit einer ausdrücklichen Anweisung ab. Führe in beiden Fällen `compose pull --quiet` im exakten Compose-Kontext der Installation aus und wiederhole anschließend denselben Installer mit `--skip-pull`, um die geladenen Images zu verwenden und die Umgebung zu erhalten. Das behebt weder Registry- noch Signaturfehler. Meldet die Offline-Kompilierung eine abweichende `jose`-Version, halte an. Die Werkzeuge von v0.11.0 verlangen 6.2.3, ihre direkte eingefrorene Abhängigkeit ergibt jedoch 6.2.12; besorge eine korrigierte Kombination aus Release und Werkzeugen, bevor du diese Installation abnimmst. In späteren Releases entspricht die Bindung der eingefrorenen Abhängigkeit, eine Abweichung bedeutet also, dass `pnpm install --frozen-lockfile` in diesem Checkout nicht abgeschlossen wurde. Lockere die Identitätsprüfung nicht stillschweigend.


Auch der OCI-Runner von v0.11.0 startet nicht, weil `agent-runner-storage.mjs` im Runtime-Image fehlt; die Anwendung wird daher nie gesund. Spätere Releases entfernen diesen Runner und seine Code-Sandboxes. Aktualisiere auf eine solche Release, statt Runner-Dateien einzubinden oder die Container-Isolation zu lockern.
