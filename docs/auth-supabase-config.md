# Authentication settings, which do not live in the repository

> **Ticket**: MIN-297 · **Supabase Project**: `cmzrlbnlytvgnomzgmqf` (minddy) ·
> **Recorded on**: 2026-08-14
>
> Part of connection security is nowhere in this repository: it
> is in the Auth configuration of the Supabase project. A `git log` does not show it
> not, a reread doesn't see it, and no one knows if it was asked or
> if it remained at default. This page is here for that — and to say what
> was **decided not to change**, which is the information most quickly lost.

Everything that follows can be read and written in two places:

- the dashboard (Authentication → Sign In / Providers, Emails, Rate Limits,
  URLConfiguration);
- the management API, more convenient for a complete statement:

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -H "Authorization: Bearer $TOK" \
  https://api.supabase.com/v1/projects/cmzrlbnlytvgnomzgmqf/config/auth | jq
```

---

## Password policy — in place and up to date

| Setting | Value | What it gives |
| --- | --- | --- |
| `password_min_length` | `8` | Eight characters |
| `password_required_characters` | lowercase `:` uppercase `:` numbers | One of each |
| `password_hibp_enabled` | `true` | **HIBP check active**: GoTrue refuses on the server side a password that appeared in a known leak |

These are the requirements that [lib/password-policy.ts](../lib/password-policy.ts)
copies and displays as you type, rule by rule. **Both must move
together**: changing the policy here without changing it there is a button
“create my account” active on a password that the server will refuse.

Leak control has no client-side equivalent, and cannot have one:
it's a call to Have I Been Pwned, made by GoTrue, on a hash prefix. He
comes out as `weak_password`, translated as [lib/auth-errors.ts](../lib/auth-errors.ts)
(“This password is too common: choose one that is less predictable”).

## Rate limits — by default Supabase, deliberately

| GoTrue Endpoint | Setting | Value | Scope |
| --- | --- | --- | --- |
| `/token` (including `grant_type=password`) | `rate_limit_token_refresh` | `150` / 5 min | by IP |
| `/verify` (consuming a link) | `rate_limit_verify` | `30` / 5 min | by IP |
| `/otp`, `/magiclink` | `rate_limit_otp` | `30` / h | by IP |
| Any email sending (registration, reset) | `rate_limit_email_sent` | `30` / h | **entire project** |
| Two emails to the same address | `smtp_max_frequency` | `60` s | by address |
| MFA Challenge | not configurable | `15` / min | by IP |

**Nothing has been tightened, and that is a choice.** The limit that matters for strength
raw is that of `/token` — except that it is *shared* with the refresh
tokens, that is to say with the most banal use of the product (`jwt_exp` = 1 h,
so each session goes through it every hour, in each tab). The
lowering means disconnecting legitimate people behind a shared IP — an office,
a corporate network, a cafe — to hinder an attacker that the word policy
password and HIBP control are already more annoying.

**The real leverage against brute force, here, would be a CAPTCHA**
(`security_captcha_enabled`, hCaptcha or Turnstile): it aims for connection without
touch refreshment. It is not activated — it requests an account with the
provider, a key, and one more component on the login screen. To
reopen the day the failed attempts are visible in the logs, not before.

`rate_limit_email_sent` = 30/h **for the entire project** is the ceiling to monitor
first at launch: registrations and resets share it, and
someone who asks for links again and again may saturate it for others.

## What the connection failure shows

`invalid_credentials` is rendered identically for an unknown email and for a
false password: the form is not an account revealer. The route
“forgotten password” is the same line — GoTrue responds the same in both
case, and the screen displays “if an account exists for this address”.

**The only exception assumed**: `email_not_confirmed` says that an account exists
but did not confirm his address. We keep her — without her, someone who doesn't have
clicked on its confirmation link reads “incorrect email or password” and
recreate an account, or give up.

## Emails — templates and subjects

Custom SMTP: Resend (`smtp.resend.com`, `noreply@mail.minddy.app`, sender
“mindy”). Two templates are personalized, and **versioned in the repository**:

| Template | Versioned copy | Subject |
| --- | --- | --- |
| Confirm signup | [supabase/email-templates/confirm-signup.html](../supabase/email-templates/confirm-signup.html) | Locale branch from `lib/self-hosting-email-templates.ts` |
| Reset password | [supabase/email-templates/reset-password.html](../supabase/email-templates/reset-password.html) | Locale branch from `lib/self-hosting-email-templates.ts` |

Both the subject and body select one of the six supported locales from
`user_metadata.locale`, with English as the safe fallback for older accounts.
Both carry a link to `token_hash`, never `{{ .ConfirmationURL }}`: this one
logs in with a simple `GET`, which is precisely what MIN-345 removed. The
Reset template is the only place where the route destination is
written (`next=/reset-password`) — [lib/server/password-reset-link.test.ts](../lib/server/password-reset-link.test.ts)
reads the file and passes the URL obtained in the real routes, so that it
contract does not depend on a rereading.

`mailer_otp_exp` = 3600 s: a link is worth one hour, and is only used once.

## Authorized URLs

`site_url` = `https://www.minddy.app/`, and the allowlist only contains
`https://www.minddy.app/auth/callback`. The versioned local configuration uses
the loopback-only patterns `http://localhost:*/auth/callback` and
`http://127.0.0.1:*/auth/callback`; these cover the dedicated self-hosting port,
an explicit fallback port, and application development without allowing a
remote HTTP callback.

**Consequence to be aware of**: a Vercel preview is not there, therefore a link requested
from a preview to production (GoTrue falls back on `site_url`).
This was already true for the registration confirmation; it is also for
reset.

## Points looked at and left as is

- `security_update_password_require_reauthentication` = `false`. Activate it
  would request an email code for any password changes — including,
  depending on the version of GoTrue, at the end of a reset link, where it would be
  a second email for the same proof. To deal with the word change of
  happens *from settings*, not here.
- `sessions_timebox` / `sessions_inactivity_timeout` = `0`: no expiration
  forced sessions. Product-side slippage is addressed elsewhere
  ([lib/session-cookies.ts](../lib/session-cookies.ts)).
- `security_captcha_enabled` = `false`: see above.
- `disable_signup` = `false`, `mailer_autoconfirm` = `false`: registration is
  open and the address must be confirmed. That's what we want.
