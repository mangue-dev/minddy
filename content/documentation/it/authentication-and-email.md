---
{
  "id": "authentication-and-email",
  "locale": "it",
  "title": "Autenticazione ed email",
  "summary": "Configura le email di autenticazione, i redirect e MFA in Supabase, poi verifica conferma, accesso e recupero.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Configurare le email degli account, MFA e recupero",
    "Configurare email account, MFA e recupero"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/it/authentication-and-email-flow.svg",
      "alt": "Schema: Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.",
      "caption": "Segui le fasi in questo ordine. Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Origine Auth e redirect configurati"
          },
          {
            "title": "SMTP proprio e modelli versionati"
          },
          {
            "title": "Conferma e accesso con password"
          },
          {
            "title": "Prove TOTP, recupero e vecchia password"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurare le email degli account, MFA e recupero {#authentication-and-email}

Le email degli account dipendono da Supabase e GoTrue. Resend per le notifiche dell’applicazione non configura conferma o recupero password. Nel profilo full conserva l’overlay minddy in ogni comando Compose. Imposta `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` e `ADDITIONAL_REDIRECT_URLS` sulle origini della tua istanza. Configura `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_SENDER_NAME` con i valori del tuo provider. L’overlay imposta anche i limiti di sessione: `GOTRUE_SESSIONS_TIMEBOX` vale `8760h` (un anno) e `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` vale `720h` (30 giorni). Mantieni la conferma email attiva e riavvia Auth nel contesto installato.


Prima di usare `compose` qui sotto, definisci la funzione del profilo full installato dal [contesto Compose di riferimento](/it/documentazione/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Schema: Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.](/documentation/it/authentication-and-email-flow.svg)

## Configurare Supabase gestito {#managed}

Nella sezione Authentication del progetto gestito imposta Site URL e il redirect esatto `<app-origin>/auth/callback`. Configura SMTP e i due template email versionati. La conferma usa `token_hash` e `type=signup`. Richiedi password di almeno otto caratteri con minuscole, maiuscole e cifre, e abilita registrazione e verifica TOTP. Se disponibile, attiva il controllo delle password compromesse e registra i limiti del provider. Il profilo full nega l’accesso se quel controllo fallisce e deve poter raggiungere `api.pwnedpasswords.com`. Imposta la durata massima delle sessioni a 8760 ore (un anno) e il timeout di inattività a 720 ore (30 giorni). Il database rifiuta le sessioni oltre questi stessi limiti, quindi un limite Auth disattivato o più lungo continua a rinnovare sessioni che poi ogni API respinge. Registra durata delle sessioni, rotazione refresh, revoca e limiti Auth: il bootstrap SQL non configura questi controlli.

## Verificare il risultato {#verify}

Usa un indirizzo temporaneo sotto il tuo controllo. Verifica ricezione, apertura del link sulla tua istanza e conferma esplicita. Attiva TOTP in sicurezza e conserva i codici di recupero fuori dal browser. Esci e prova un nuovo accesso con password e TOTP. Reimposta la password e verifica che la precedente non funzioni. Prova l’accesso amministratore di un account presente in `ADMIN_EMAILS` dopo MFA. Registra versioni, date e risultati depurati. Container sani non provano consegna o sicurezza. Non includere token email, password, sessioni, segreti TOTP o codici di recupero.
