# Sous-traitants et transferts hors UE — minddy

*Article 28 du RGPD. Document interne, à présenter en cas de contrôle.*

Chaque prestataire qui traite des données personnelles pour le compte de minddy
est un sous-traitant au sens de l'article 28. Il faut, pour chacun : un contrat
de sous-traitance (DPA) accepté, une base de transfert valide s'il traite hors
de l'Union européenne, et la garantie qu'il n'agit que sur instruction.

**Dernière revue : 6 août 2026.** À reprendre à chaque ajout de prestataire,
et au moins une fois par an.

> **⚠️ Colonne « DPA » à confirmer.** Le tableau ci-dessous recense les DPA que
> chaque prestataire publie, **pas** l'état de leur acceptation sur les comptes
> minddy. La plupart s'acceptent au moment de la souscription ou depuis un
> écran dédié du tableau de bord (Supabase → Organization → Legal Documents,
> Vercel → Team Settings → Legal, Stripe → Settings → Legal, PostHog → Settings
> → Organization, Resend → Settings → Legal). **Passer sur chaque compte, signer
> ce qui ne l'est pas, puis remplacer « à confirmer » par la date
> d'acceptation.** Un DPA non signé est le point qu'un contrôle relève en
> premier, et c'est la seule ligne de ce dossier qui ne peut pas se remplir
> depuis le code.

---

## Tableau récapitulatif

| Sous-traitant | Rôle | Données traitées | Hébergement | Hors UE | Base de transfert | DPA |
| --- | --- | --- | --- | --- | --- | --- |
| **Supabase** | Base de données, authentification, stockage de fichiers | Toutes les données applicatives | UE — Irlande (`eu-west-1`) | Non | — | [DPA](https://supabase.com/legal/dpa) — à confirmer |
| **Vercel** | Hébergement de l'application, exécution des fonctions, bacs à sable de l'agent | Données en transit ; journaux de requêtes | États-Unis, avec points de présence mondiaux | Oui | CCT + DPF | [DPA](https://vercel.com/legal/dpa) — à confirmer |
| **Stripe** | Paiement et abonnements | E-mail, identifiants client et abonnement, données de paiement (chez Stripe uniquement) | Irlande (entité UE) + États-Unis | Oui | CCT intragroupe | [DPA](https://stripe.com/legal/dpa) — à confirmer |
| **OpenRouter** | Routage des appels aux modèles de langage | Contenu transmis aux modèles (tickets, code, messages, **retours déposés sur un board public et audio de leur dictée**) | États-Unis | Oui | CCT | [Politique](https://openrouter.ai/privacy) — à confirmer |
| **PostHog** | Mesure d'audience | Événements d'usage, identifiant de mesure | UE — Allemagne (`eu.posthog.com`) | Non | — | [DPA](https://posthog.com/dpa) — à confirmer |
| **Resend** | E-mails transactionnels | Adresse de destination, contenu du message | États-Unis | Oui | CCT | [DPA](https://resend.com/legal/dpa) — à confirmer |
| **GitHub** | Connexion aux dépôts, *pull requests* de l'agent | Identifiant du compte, contenu du dépôt relié | États-Unis | Oui | CCT (Microsoft) | [DPA](https://github.com/customer-terms/github-data-protection-agreement) — à confirmer |
| **GitLab** | Connexion aux dépôts, *merge requests* de l'agent | Identifiant du compte, contenu du dépôt relié | États-Unis ou instance auto-hébergée du client | Oui | CCT | [DPA](https://about.gitlab.com/handbook/legal/data-processing-agreement/) — à confirmer |

**CCT** : clauses contractuelles types de la Commission européenne (décision
2021/914). **DPF** : *EU–US Data Privacy Framework* (décision d'adéquation du
10 juillet 2023).

---

## Détail par sous-traitant

### Supabase

*Supabase Inc. — instance hébergée dans la région Union européenne (Irlande).*

Le sous-traitant principal : il porte la base PostgreSQL, l'authentification et
les buckets de fichiers. Toutes les données applicatives y résident.

- **Données hors UE** : aucune. L'instance est provisionnée en `eu-west-1` et le
  reste ; le choix de région est figé à la création du projet.
- **Sous-traitants ultérieurs** : AWS (infrastructure de la région irlandaise).
- **Sécurité** : chiffrement au repos, sauvegardes quotidiennes avec restauration
  à un instant donné, `Row Level Security` activée sur toutes les tables
  applicatives.
- **À la fin du contrat** : suppression du projet et des sauvegardes.

### Vercel

*Vercel Inc. — hébergement de l'application Next.js et exécution des bacs à sable
de l'agent de code.*

Vercel exécute le code applicatif : les données transitent par ses fonctions,
elles n'y sont pas stockées durablement. Les journaux de requêtes (URL, code de
réponse, durée, adresse IP) y sont conservés selon la rétention du plan.

- **Transfert hors UE** : oui — CCT et adhésion au *Data Privacy Framework*.
- **Bacs à sable de l'agent** : micro-VM éphémère par run, détruite à la fin. Le
  code du dépôt y est cloné le temps du run uniquement.
- **À surveiller** : la région d'exécution des fonctions. Les fixer sur une
  région européenne (`fra1`, `cdg1`) réduit le transit ; le point est ouvert.

### Stripe

*Stripe Payments Europe Ltd (Irlande), avec Stripe Inc. comme sous-traitant
ultérieur.*

- **Aucune donnée bancaire ne transite par minddy** : la saisie se fait sur des
  pages hébergées par Stripe (Checkout, portail client). minddy ne conserve que
  des identifiants opaques (`cus_…`, `sub_…`) et l'état de l'abonnement.
- **Transfert hors UE** : oui, intragroupe, encadré par CCT.
- **Certification** : PCI-DSS niveau 1.

### OpenRouter et fournisseurs de modèles

*OpenRouter, Inc. — passerelle unique vers les fournisseurs de modèles.*

Le contenu transmis aux modèles (texte des tickets, commentaires, extraits de
code lus par l'agent) sort du périmètre européen à cet endroit. C'est le
transfert le plus sensible du service et il doit être annoncé comme tel dans la
politique de confidentialité.

**Y compris les retours des boards publics** (traitement n° 6), et c'est le cas
qui demande le plus d'attention : les personnes concernées ne sont pas des
clients de minddy mais ceux de son client, elles n'ont accepté aucune condition
d'utilisation, et le texte qu'elles écrivent part au modèle AVANT toute revue —
donc avant que quoi que ce soit ait pu repérer qu'il contient des données
personnelles. Trois appels au maximum par retour : la revue (modération,
catégorisation, dédoublonnage, traduction), le calcul de l'embedding, et pour une
dictée la transcription de l'audio puis la mise en forme du formulaire. Aucun de
ces appels ne porte l'identité de l'auteur.

- **Transfert hors UE** : oui — CCT.
- **Rétention chez le fournisseur : variable, et hors du contrôle de minddy.**
  OpenRouter route l'appel vers le fournisseur du modèle retenu, qui applique sa
  propre politique — certains journalisent les prompts, certains les conservent,
  certains s'en servent pour améliorer leurs modèles. Le modèle étant choisi par
  l'utilisateur, **aucune garantie de rétention nulle ne peut être donnée**, et
  il ne faut pas en écrire une : une promesse de confidentialité qu'on ne tient
  pas est un manquement de plus, pas une précaution.
- **Sous-traitants ultérieurs** : les fournisseurs de modèles routés par
  OpenRouter. Leur liste dépend des modèles ouverts au catalogue.
- **Clés apportées par l'utilisateur (BYOK)** : quand l'utilisateur configure sa
  propre clé, l'appel part vers *son* fournisseur, sous *sa* responsabilité
  contractuelle. minddy ne stocke que la clé chiffrée.

### PostHog

*PostHog, Inc. — instance européenne `eu.posthog.com` (hébergement Allemagne).*

- **Transfert hors UE** : aucun, l'instance européenne est utilisée.
- **Base légale** : consentement, recueilli par le bandeau. Un refus déclenche
  `opt_out_capturing()` — plus rien n'est envoyé ni écrit sur l'appareil.
- **Minimisation** : les propriétés d'événement sont assainies avant envoi
  (`lib/analytics-sanitize.ts`) ; aucune donnée personnelle en texte libre, pas
  d'adresse IP conservée.

### Resend

*Resend, Inc. — envoi des e-mails transactionnels (invitations, notifications,
codes de vérification des boards publics).*

- **Transfert hors UE** : oui — CCT.
- **Données** : adresse de destination et contenu du message. Aucun e-mail
  commercial n'est envoyé, donc aucune liste de diffusion n'est constituée.

### GitHub et GitLab

*Sollicités uniquement sur action explicite de l'utilisateur, lorsqu'il relie un
dépôt à un projet.*

- **Données** : identifiant du compte, dépôts autorisés, contenu du dépôt lu et
  écrit par l'agent.
- **Jetons d'accès** : chiffrés au repos en base, portée limitée aux dépôts
  explicitement reliés, révocables depuis les réglages du compte.
- **Transfert hors UE** : oui — CCT.

---

## Ce qui n'est pas de la sous-traitance

- **L'utilisateur qui invite quelqu'un sur son projet** n'est pas un
  sous-traitant : il agit comme responsable de traitement pour le contenu qu'il
  crée, minddy étant à cet égard *son* sous-traitant (voir la section « Rôle de
  sous-traitant » de la politique de confidentialité).
- **Les fournisseurs de connexion tierce (Google, GitHub)** utilisés pour
  s'authentifier sont des responsables de traitement autonomes pour leur propre
  service ; minddy ne reçoit d'eux que l'identité minimale nécessaire à la
  création du compte.

---

## Procédure d'ajout d'un sous-traitant

1. Vérifier qu'il propose un DPA conforme à l'article 28 et l'accepter.
2. Déterminer l'hébergement réel des données et, s'il est hors UE, la base de
   transfert (adéquation, CCT, DPF).
3. Ajouter une ligne au tableau ci-dessus et une section de détail.
4. Ajouter le traitement concerné au [registre](registre-des-traitements.md).
5. Mettre à jour la liste des sous-traitants dans la politique de confidentialité
   publique (clé `transfersProcessors` des namespaces `Privacy`, en français et
   en anglais) — cette liste est **nominative**, un prestataire non cité ne peut
   pas être considéré comme porté à la connaissance des personnes.
6. Mettre à jour `lastModified` de la clé `privacy` dans `lib/public-routes.ts`.

**Cas particulier des fournisseurs de modèles.** La politique de confidentialité
les nomme aussi (clé `aiProvidersGateway` : DeepSeek, Anthropic, OpenAI,
Google). Cette liste suit le catalogue réel — `lib/agent-models.ts` pour les
modèles de l'agent, `lib/ai-model-config.ts` pour les tâches de fond, la dictée
et les embeddings. **Ouvrir un modèle d'un fournisseur non cité, c'est ajouter un
destinataire non déclaré** : la clé i18n bouge dans le même commit que le
catalogue.
