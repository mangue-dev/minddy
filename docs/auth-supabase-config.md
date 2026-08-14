# Les réglages d'authentification, qui ne vivent pas dans le dépôt

> **Ticket** : MIN-297 · **Projet Supabase** : `cmzrlbnlytvgnomzgmqf` (minddy) ·
> **Relevé le** : 2026-08-14
>
> Une partie de la sécurité de la connexion n'est nulle part dans ce dépôt : elle
> est dans la configuration Auth du projet Supabase. Un `git log` ne la montre
> pas, une relecture ne la voit pas, et personne ne sait si elle a été posée ou
> si elle est restée au défaut. Cette page est là pour ça — et pour dire ce qui a
> été **décidé de ne pas changer**, ce qui est l'information la plus vite perdue.

Tout ce qui suit se lit et s'écrit à deux endroits :

- le tableau de bord (Authentication → Sign In / Providers, Emails, Rate Limits,
  URL Configuration) ;
- l'API de gestion, plus commode pour un relevé complet :

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -H "Authorization: Bearer $TOK" \
  https://api.supabase.com/v1/projects/cmzrlbnlytvgnomzgmqf/config/auth | jq
```

---

## Politique de mot de passe — en place, et à jour

| Réglage | Valeur | Ce que ça donne |
| --- | --- | --- |
| `password_min_length` | `8` | Huit caractères |
| `password_required_characters` | minuscules `:` majuscules `:` chiffres | Une de chaque |
| `password_hibp_enabled` | `true` | **Contrôle HIBP actif** : GoTrue refuse côté serveur un mot de passe apparu dans une fuite connue |

Ce sont les exigences que [lib/password-policy.ts](../lib/password-policy.ts)
recopie et affiche à la frappe, règle par règle. **Les deux doivent bouger
ensemble** : changer la politique ici sans la changer là, c'est un bouton
« créer mon compte » actif sur un mot de passe que le serveur refusera.

Le contrôle de fuite n'a pas d'équivalent côté client, et ne peut pas en avoir :
c'est un appel à Have I Been Pwned, fait par GoTrue, sur un préfixe de hachage. Il
ressort en `weak_password`, traduit par [lib/auth-errors.ts](../lib/auth-errors.ts)
(« Ce mot de passe est trop courant : choisissez-en un moins prévisible »).

## Limites de débit — au défaut Supabase, délibérément

| Endpoint GoTrue | Réglage | Valeur | Portée |
| --- | --- | --- | --- |
| `/token` (dont `grant_type=password`) | `rate_limit_token_refresh` | `150` / 5 min | par IP |
| `/verify` (consommation d'un lien) | `rate_limit_verify` | `30` / 5 min | par IP |
| `/otp`, `/magiclink` | `rate_limit_otp` | `30` / h | par IP |
| Tout envoi d'e-mail (inscription, reset) | `rate_limit_email_sent` | `30` / h | **projet entier** |
| Deux e-mails à la même adresse | `smtp_max_frequency` | `60` s | par adresse |
| Challenge MFA | non configurable | `15` / min | par IP |

**Rien n'a été resserré, et c'est un choix.** La limite qui compte pour la force
brute est celle de `/token` — sauf qu'elle est *partagée* avec le rafraîchissement
des jetons, c'est-à-dire avec l'usage le plus banal du produit (`jwt_exp` = 1 h,
donc chaque session repasse par là toutes les heures, dans chaque onglet). La
baisser, c'est déconnecter des gens légitimes derrière une IP partagée — un bureau,
un réseau d'entreprise, un café — pour gêner un attaquant que la politique de mot
de passe et le contrôle HIBP gênent déjà davantage.

**Le vrai levier contre la force brute, ici, serait un CAPTCHA**
(`security_captcha_enabled`, hCaptcha ou Turnstile) : il vise la connexion sans
toucher au rafraîchissement. Il n'est pas activé — il demande un compte chez le
fournisseur, une clé, et un composant de plus sur l'écran de connexion. À
rouvrir le jour où les tentatives ratées se voient dans les logs, pas avant.

`rate_limit_email_sent` = 30/h **pour tout le projet** est le plafond à surveiller
en premier au lancement : inscriptions et réinitialisations le partagent, et
quelqu'un qui redemande des liens en boucle peut le saturer pour les autres.

## Ce que l'échec de connexion laisse voir

`invalid_credentials` est rendu à l'identique pour un e-mail inconnu et pour un
mot de passe faux : le formulaire n'est pas un révélateur de comptes. Le parcours
« mot de passe oublié » tient la même ligne — GoTrue répond pareil dans les deux
cas, et l'écran affiche « si un compte existe pour cette adresse ».

**La seule exception assumée** : `email_not_confirmed` dit qu'un compte existe
mais n'a pas confirmé son adresse. On la garde — sans elle, quelqu'un qui n'a pas
cliqué sur son lien de confirmation lit « e-mail ou mot de passe incorrect » et
recrée un compte, ou abandonne.

## E-mails — gabarits et sujets

SMTP personnalisé : Resend (`smtp.resend.com`, `noreply@mail.minddy.app`, expéditeur
« minddy »). Deux gabarits sont personnalisés, et **versionnés dans le dépôt** :

| Gabarit | Copie versionnée | Sujet |
| --- | --- | --- |
| Confirm signup | [supabase/email-templates/confirm-signup.html](../supabase/email-templates/confirm-signup.html) | `Confirm your email address` |
| Reset password | [supabase/email-templates/reset-password.html](../supabase/email-templates/reset-password.html) | `Réinitialisez votre mot de passe · Reset your password` |

Les deux portent un lien à `token_hash`, jamais `{{ .ConfirmationURL }}` : celui-ci
ouvre une session sur un simple `GET`, ce que MIN-345 a précisément retiré. Le
gabarit de réinitialisation est le seul endroit où la destination du parcours est
écrite (`next=/reset-password`) — [lib/server/password-reset-link.test.ts](../lib/server/password-reset-link.test.ts)
lit le fichier et fait passer l'URL obtenue dans les vraies routes, pour que ce
contrat-là ne dépende pas d'une relecture.

`mailer_otp_exp` = 3600 s : un lien vaut une heure, et ne sert qu'une fois.

## URLs autorisées

`site_url` = `https://www.minddy.app/`, et l'allowlist ne contient que
`https://www.minddy.app/auth/callback` et `http://localhost:3000/auth/callback`.

**Conséquence à connaître** : une preview Vercel n'y est pas, donc un lien demandé
depuis une preview part vers la production (GoTrue retombe sur le `site_url`).
C'était déjà vrai pour la confirmation d'inscription ; ça l'est aussi pour la
réinitialisation.

## Les points regardés et laissés tels quels

- `security_update_password_require_reauthentication` = `false`. L'activer
  demanderait un code e-mail pour tout changement de mot de passe — y compris,
  selon la version de GoTrue, au bout d'un lien de réinitialisation, où ce serait
  un second e-mail pour la même preuve. À traiter avec le changement de mot de
  passe *depuis les réglages*, pas ici.
- `sessions_timebox` / `sessions_inactivity_timeout` = `0` : pas d'expiration
  forcée des sessions. La glissade côté produit est traitée ailleurs
  ([lib/session-cookies.ts](../lib/session-cookies.ts)).
- `security_captcha_enabled` = `false` : voir plus haut.
- `disable_signup` = `false`, `mailer_autoconfirm` = `false` : l'inscription est
  ouverte et l'adresse doit être confirmée. C'est bien ce qu'on veut.
