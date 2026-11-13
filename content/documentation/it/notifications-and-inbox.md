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
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
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
      "lib/notification-prefs.ts",
      "components/mobile-navigation.tsx",
      "components/inbox-row.tsx",
      "lib/notification-line.ts",
      "mobile/README.md"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (MIN-973: the iOS app among the push delivery channels; checked against components/settings/account-push-devices-section.tsx and mobile/README.md; no figure affected); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of notifications-and-inbox-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the Inbox entry points to include notification search in the command palette, and the preferences section to state that administrators of a self-hosted instance get an unmutable Instance variables notification; no browser walkthrough; figures not reviewed in this pass); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-924: which routine runs notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-907 inbox button in the phone bottom bar with its dot: checked against components/mobile-navigation.tsx and components/app-shell-chrome.tsx; no browser walkthrough; existing figure kept); agent:claude-code (MIN-975: inbox redesign — view picker and More actions menu, actor/sentence/context rows with mention pills, no date groups, invitation buttons with confirmation, swipe actions on phones; source audit against the change; no browser walkthrough; work-inbox.png recaptured on 2026-11-13 from the local candidate (light, six locales, response-only demo notifications, no writes) and inspected)",
    "language": "agent:claude-code (it MIN-973 iOS app sentence, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (it figure update after the catalog review; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it corrected passages with catalog UI labels; fixed the All filter label to the catalog value Tutte; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 phone inbox entry point, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-975 passages, figure alt and caption with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
      "alt": "Posta in arrivo sulla vista Tutte con menzioni, assegnazioni e commenti dimostrativi: ogni riga indica chi ha agito, il ticket come pillola e il suo titolo.",
      "caption": "Ogni riga mostra chi ha agito, cosa è successo al ticket e il suo titolo. Le righe lette sono attenuate; Tutte elenca le notifiche lette e non lette.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-11-13",
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

Apri la posta in arrivo con la sua icona nella barra superiore, dal suo pulsante nella barra in fondo allo schermo su telefono oppure premendo G e poi I fuori da un campo di testo. Un contatore rosso sull’icona somma le notifiche non lette e gli inviti in attesa, e su telefono un punto ne segnala il pulsante; una PWA installata mostra lo stesso numero sull’icona dell’app. La posta in arrivo si apre in un pannello a comparsa, o in un foglio su telefono, ed elenca le notifiche dalla più recente, ognuna con la sua ora. Appena digiti nella palette dei comandi, trova anche le notifiche: sceglierne una apre la posta in arrivo sulla vista che la elenca, Non lette o Tutte, e la evidenzia senza segnarla come letta.

Si apre sulla vista Non lette. Il selettore in alto passa a Tutte, che mostra anche le notifiche lette, o a Menzioni, che mantiene solo le menzioni nei commenti e nelle pagine. Ogni riga indica chi ha agito (un membro, Numo, Smart Assign, un agente MCP, la bacheca dei feedback o la forge), dice cosa è successo al ticket, alla pagina, alla pull request o al progetto mostrato come pillola, e aggiunge contesto quando c’è, come l’estratto del commento o il titolo del ticket. Seleziona una riga per aprire il suo ticket, la sua pagina o la sua pull request. Aprire una notifica la contrassegna come letta. Su telefono, scorri una riga verso destra per segnarla come letta o non letta, o verso sinistra per eliminarla. Su computer, passando il puntatore su una riga compaiono Segna come letta o Segna come non letta, e Segna tutto come letto, nel menu Altre azioni accanto al selettore, rimuove tutti gli indicatori di non letto. Segnarla come non letta cambia solo l’indicatore: non annulla la modifica al ticket o alla pagina. Apri il contenuto collegato per consultarne lo stato attuale.

Numo può anche lasciarti un messaggio: un titolo breve che nomina l’elemento in questione, con una o due frasi di contesto se serve, su qualcosa che richiede la tua attenzione, scritto da una delle tue routine o in una conversazione in cui gli hai chiesto di avvisarti più tardi. Ha l’icona di Numo e, selezionandolo, apre il ticket, l’obiettivo, la pagina, la pull request o la routine di cui parla, oppure il progetto se non ne nomina nessuno. Numo scrive questi messaggi solo a te, mai agli altri membri, e invia lo stesso messaggio sullo stesso elemento al massimo una volta al giorno.

Una routine ti avvisa da sola quando un’esecuzione non riesce, esaurisce il budget o non può partire. Un’esecuzione che termina normalmente ti raggiunge solo come messaggio di Numo. Vedi [Routine](/docs/scheduled-routines#runs).

Elimina, che compare passando il puntatore su una riga su computer, cancella quella notifica dopo una conferma, ed Elimina lette, nel menu Altre azioni, cancella tutte le notifiche lette dopo una conferma. Entrambe le eliminazioni sono definitive; le notifiche non lette restano, e il ticket, la pagina o la pull request a cui punta una notifica non vengono toccati.

Gli inviti ai progetti in attesa compaiono in cima alle viste Non lette e Tutte, con i pulsanti Rifiuta e Unisciti. Ognuno chiede una conferma: controlla il progetto e chi ti invita prima di rispondere. I vecchi collegamenti alla posta in arrivo aprono il punto di accesso attuale, non una pagina separata.

![Posta in arrivo sulla vista Tutte con menzioni, assegnazioni e commenti dimostrativi: ogni riga indica chi ha agito, il ticket come pillola e il suo titolo.](/documentation/it/work-inbox.png)

## Scegliere i canali di notifica {#notification-preferences}

Scegli Impostazioni di Posta in arrivo nel menu Altre azioni della posta in arrivo, oppure apri Impostazioni account e la scheda Notifiche. In Notifiche di posta, un interruttore per categoria (Assegnazioni, Menzioni, Commenti, Numo, Routine, Pull request, Feedback, Pagine e Messaggi di Numo) decide cosa arriva nella tua posta in arrivo. Disattivare una categoria interrompe le future notifiche di quel tipo, inclusi i relativi avvisi push; non rimuove le notifiche già ricevute. Su un’istanza self-hosted, gli amministratori ricevono anche una notifica Variabili dell’istanza quando un altro amministratore modifica una variabile dell’istanza; nessun interruttore la disattiva. Vedi [Modificare le variabili dell’istanza](/docs/instance-administration#instance-variables).

La sezione Notifiche push della stessa scheda elenca i dispositivi che ricevono avvisi. La consegna tramite browser, PWA, app iOS o desktop richiede anche registrazione del dispositivo e permesso del sistema operativo. Disattivare o rimuovere un dispositivo interrompe gli avvisi solo su quel dispositivo; la posta in arrivo e le sue categorie non cambiano.

Se una notifica porta a contenuti non disponibili, verifica se l’appartenenza al progetto è cambiata o l’oggetto è stato eliminato. Se mancano notifiche push, controlla permesso e registrazione nella [sezione sulle notifiche del dispositivo](/it/documentazione/applications#devices-and-notifications); la posta in arrivo resta utile per consultare l’attività. Non inviare mai cookie di sessione o contenuti privati di notifiche in schermate diagnostiche.
