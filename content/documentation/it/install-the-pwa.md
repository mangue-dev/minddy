---
{
  "id": "install-the-pwa",
  "locale": "it",
  "title": "Installare l’app web su telefono o tablet",
  "summary": "Aggiungere l’istanza alla schermata Home e conoscere condizioni di rete e push.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/install-the-pwa-workflow.png",
      "alt": "Guida illustrata di Minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.",
      "caption": "La guida pubblica illustra i tre passaggi di Safari e l’opzione Apri come app web da mantenere attiva. Sono illustrazioni didattiche mostrate da Minddy, non schermate di un’installazione iOS completata.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Installare dal browser {#install-the-pwa}
Apri l’istanza Minddy che vuoi usare in Safari su iPhone o iPad oppure in Chrome o in un altro browser Android compatibile. Se il link si è aperto all’interno di un’altra app, aprilo prima nel browser completo. Per un’istanza self-hosted, usa l’indirizzo del tuo server.

Su iOS, apri Condividi e scegli Aggiungi alla schermata Home. Lascia attiva l’opzione Apri come app web e tocca Aggiungi. A seconda dell’interfaccia di Safari, potrebbe essere necessario aprire Altro prima di Condividi. Se l’azione manca, controlla Modifica azioni.

Su Android, usa la proposta di installazione oppure scegli Installa l’app o Aggiungi alla schermata Home dal menu del browser e conferma Installa. I nomi dipendono dal browser. Apri la nuova icona e accedi con l’account di quell’istanza. Si tratta di una PWA installata dal browser; non esiste un’app nativa Minddy nell’App Store di iOS o su Google Play.

## Aggiornamenti, accesso offline e notifiche {#operation}
L’installazione non crea una copia offline del progetto. Il service worker di Minddy gestisce soltanto le notifiche push e non conserva le richieste dell’applicazione nella cache. Usa una connessione di rete e ricarica la pagina per ottenere i contenuti web aggiornati. Le notifiche richiedono anche un browser compatibile, il suo permesso e una configurazione push sul server. Su iOS, usa l’app installata quando il percorso lo richiede. Se l’opzione di installazione non compare, apri un browser completo compatibile e controlla se l’istanza è già installata.

![Guida illustrata di Minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.](/documentation/it/install-the-pwa-workflow.png)
