---
{
  "id": "notifications-and-inbox",
  "locale": "it",
  "title": "Posta in arrivo e notifiche",
  "summary": "Controlla attività non letta e menzioni, poi regola le preferenze di notifica dell’account.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 11,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-06",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts",
      "lib/server/numo-notes.ts",
      "lib/notification-prefs.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of notifications-and-inbox-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (it figure update after the catalog review; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it corrected passages with catalog UI labels; fixed the All filter label to the catalog value Tutte; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-06"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Seguire notifiche e inviti nella posta in arrivo"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-inbox.png",
      "alt": "Posta in arrivo con menzioni, assegnazioni e commenti dimostrativi, letti e non letti.",
      "caption": "L’attività dimostrativa mostra l’autore, il ticket e lo stato di lettura. Tutti include le notifiche lette e non lette.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Leggere la posta in arrivo {#notifications-and-inbox}

Apri la posta in arrivo con la sua icona nella barra superiore, dalla sua riga nella barra laterale su telefono oppure premendo G e poi I fuori da un campo di testo. Un contatore rosso sull’icona somma le notifiche non lette e gli inviti in attesa; una PWA installata mostra lo stesso numero sull’icona dell’app. La posta in arrivo si apre in un pannello a comparsa, o in un foglio su telefono, e raggruppa le notifiche sotto Oggi, Ieri e Prima. Appena digiti nella palette dei comandi, trova anche le notifiche: sceglierne una apre la posta in arrivo sulla scheda che la elenca, Non lette o Tutte, e la evidenzia senza segnarla come letta.

Si apre sul filtro Non letto. Tutti mostra anche le notifiche lette, e Menzioni mantiene solo le menzioni nei commenti e nelle pagine. Seleziona un elemento per aprire il ticket, la pagina o la pull request sottostante. Aprire una notifica la contrassegna come letta. La sua riga offre anche Segna come letta o Segna come non letta, e Marca tutto come letto, nell’intestazione della posta in arrivo, rimuove tutti gli indicatori di non letto. Segnarla come non letta cambia solo l’indicatore: non annulla la modifica al ticket o alla pagina. Apri il contenuto collegato per consultarne lo stato attuale.

Numo può anche lasciarti un messaggio: un titolo breve e una o due frasi su qualcosa che richiede la tua attenzione, scritto da una delle tue routine o in una conversazione in cui gli hai chiesto di avvisarti più tardi. Ha l’icona di Numo e, selezionandolo, apre il ticket, l’obiettivo, la pagina, la pull request o la routine di cui parla, oppure il progetto se non ne nomina nessuno. Numo scrive questi messaggi solo a te, mai agli altri membri, e invia lo stesso messaggio sullo stesso elemento al massimo una volta al giorno.

Una routine ti avvisa da sola quando un’esecuzione non riesce, esaurisce il budget o non può partire. Un’esecuzione che termina normalmente ti raggiunge solo come messaggio di Numo. Vedi [Routine](/docs/scheduled-routines#runs).

Cancella, su una riga, elimina quella notifica dopo una conferma, e Elimina lette, nell’intestazione, elimina tutte le notifiche lette dopo una conferma. Entrambe le eliminazioni sono definitive; le notifiche non lette restano, e il ticket, la pagina o la pull request a cui punta una notifica non vengono toccati.

Gli inviti ai progetti in attesa compaiono sotto Inviti nei filtri Non lette e Tutte. Accetta o rifiuta dopo aver controllato il progetto e chi ti invita. I vecchi collegamenti alla posta in arrivo aprono il punto di accesso attuale, non una pagina separata.

![Posta in arrivo con menzioni, assegnazioni e commenti dimostrativi, letti e non letti.](/documentation/it/work-inbox.png)

## Scegliere i canali di notifica {#notification-preferences}

Scegli Impostazioni inbox nell’intestazione della posta in arrivo, oppure apri Impostazioni account e la scheda Notifiche. In Notifiche di posta, un interruttore per categoria (Assegnazioni, Menzioni, Commenti, Numo, Routine, Pull request, Feedback, Pagine e Messaggi di Numo) decide cosa arriva nella tua posta in arrivo. Disattivare una categoria interrompe le future notifiche di quel tipo, inclusi i relativi avvisi push; non rimuove le notifiche già ricevute. Su un’istanza self-hosted, gli amministratori ricevono anche una notifica Variabili dell’istanza quando un altro amministratore modifica una variabile dell’istanza; nessun interruttore la disattiva. Vedi [Modificare le variabili dell’istanza](/docs/instance-administration#instance-variables).

La sezione Notifiche push della stessa scheda elenca i dispositivi che ricevono avvisi. La consegna tramite browser, PWA o desktop richiede anche registrazione del dispositivo e permesso del sistema operativo. Disattivare o rimuovere un dispositivo interrompe gli avvisi solo su quel dispositivo; la posta in arrivo e le sue categorie non cambiano.

Se una notifica porta a contenuti non disponibili, verifica se l’appartenenza al progetto è cambiata o l’oggetto è stato eliminato. Se mancano notifiche push, controlla permesso e registrazione nella [sezione sulle notifiche del dispositivo](/it/documentazione/applications#devices-and-notifications); la posta in arrivo resta utile per consultare l’attività. Non inviare mai cookie di sessione o contenuti privati di notifiche in schermate diagnostiche.
