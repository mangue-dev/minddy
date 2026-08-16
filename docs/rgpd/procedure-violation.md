# Procédure de gestion des violations de données — minddy

*Articles 33 et 34 du RGPD. Document interne, à présenter en cas de contrôle.*

Une **violation de données personnelles** est tout incident de sécurité —
accidentel ou illicite — qui entraîne la destruction, la perte, l'altération, la
divulgation non autorisée de données personnelles, ou l'accès non autorisé à
celles-ci. Les trois formes comptent, pas seulement la fuite :

- **confidentialité** — quelqu'un a vu ce qu'il ne devait pas voir ;
- **intégrité** — des données ont été altérées sans autorisation ;
- **disponibilité** — des données sont perdues ou inaccessibles.

Une sauvegarde effacée par erreur sans copie est une violation, au même titre
qu'une base exposée publiquement.

**Le délai de 72 heures court à partir du moment où la violation est
*constatée*, pas de celui où elle a eu lieu.** Le chronomètre démarre au premier
signal crédible, même si l'ampleur est encore inconnue. Une notification
incomplète envoyée dans les délais vaut mieux qu'une notification complète
envoyée trop tard : l'article 33.4 prévoit explicitement une communication en
plusieurs temps.

---

## Rôles

| Rôle | Qui |
| --- | --- |
| Responsable de traitement | Clément Guérin |
| Point de contact | hello@minddy.app |
| Décision de notifier | Le responsable de traitement, seul |

Il n'y a pas de DPO : la décision et la rédaction incombent au responsable de
traitement.

---

## 1. Détecter

Sources d'alerte à surveiller :

- alertes de sécurité de l'hébergeur (Supabase, Vercel) et du dépôt de code ;
- comportement anormal en production : pic de requêtes, accès inattendus dans les
  journaux, erreurs d'autorisation en série ;
- signalement d'un utilisateur ou d'un chercheur en sécurité arrivant sur
  hello@minddy.app ;
- constat propre lors d'une intervention : mauvaise politique `Row Level
  Security`, secret commité, sauvegarde manquante.

**Dès le premier signal crédible : noter la date et l'heure.** C'est cet
horodatage qui fait foi pour le délai de 72 heures.

## 2. Contenir — immédiatement, avant toute analyse

L'ordre compte : on arrête l'hémorragie d'abord, on comprend ensuite.

1. Révoquer ce qui peut l'être : clés API, jetons, sessions, clés de service,
   accès des sous-traitants.
2. Couper l'accès fautif : désactiver la route, rétablir la politique RLS,
   retirer le déploiement.
3. Faire tourner les secrets exposés (variables d'environnement, clés de
   chiffrement, jetons Git).
4. **Ne rien supprimer** : les journaux, la trace de la requête fautive et l'état
   de la base sont les preuves. Les figer, les exporter si nécessaire.

## 3. Qualifier

Répondre par écrit, dans le [registre des violations](registre-des-violations.md) :

| Question | À documenter |
| --- | --- |
| Quoi ? | Nature de la violation (confidentialité / intégrité / disponibilité) |
| Quelles données ? | Catégories précises — identification, contenu, authentification, facturation |
| Combien de personnes ? | Nombre exact ou estimation motivée |
| Depuis quand ? | Fenêtre d'exposition |
| Qui a pu y accéder ? | Public, un tiers identifié, personne (accès théorique) |
| Conséquences probables ? | Usurpation, divulgation d'informations professionnelles, perte de travail, fraude |
| Aggravants ? | Données facilement réidentifiables, personnes vulnérables, volume important, données de connexion réutilisables ailleurs |

## 4. Décider de notifier

Deux décisions distinctes, à ne pas confondre.

### 4.1 Notification à la CNIL — article 33

**Obligatoire sauf si** la violation est *improbable* d'engendrer un risque pour
les droits et libertés des personnes. La dispense est l'exception ; le doute
conduit à notifier.

**Ne pas notifier** peut se justifier, par exemple, si les données exposées
étaient chiffrées avec une clé restée hors d'atteinte, ou si l'exposition était
théorique et démontrablement sans accès effectif. **Cette décision se motive par
écrit dans le registre**, avec le raisonnement — c'est ce document que la CNIL
lira si elle apprend l'incident par ailleurs.

**Délai : 72 heures** à compter de la constatation. Au-delà, la notification
reste due mais doit expliquer le retard.

**Canal** : téléservice de notification de la CNIL —
<https://notifications.cnil.fr>.

**Contenu minimal** (art. 33.3) :

- nature de la violation, catégories et nombre approximatif de personnes
  concernées, catégories et nombre approximatif d'enregistrements ;
- coordonnées du point de contact (hello@minddy.app) ;
- conséquences probables ;
- mesures prises ou envisagées pour y remédier et en atténuer les effets.

Si tout n'est pas connu à 72 heures : notifier avec ce qui est établi et
compléter ensuite (art. 33.4).

### 4.2 Information des personnes concernées — article 34

**Obligatoire si** la violation est susceptible d'engendrer un **risque élevé**
pour les droits et libertés des personnes. Le seuil est plus haut que celui de la
notification à la CNIL : toute violation notifiée ne donne pas lieu à information
des personnes.

**Dispenses** (art. 34.3) : données rendues incompréhensibles par un chiffrement
robuste ; mesures ultérieures qui écartent le risque élevé ; effort
disproportionné — auquel cas une communication publique équivalente remplace
l'information individuelle.

**Délai** : dans les meilleurs délais.

**Canal** : e-mail à l'adresse du compte, et, si le nombre le justifie, bandeau
dans l'application et note publique sur le site.

**Contenu** : en termes clairs et simples — ce qui s'est passé, quelles données
sont concernées, quelles conséquences possibles, ce que minddy a fait, **ce que
la personne doit faire** (changer son mot de passe, révoquer une clé, surveiller
un accès), et le contact hello@minddy.app.

Une communication qui minimise ou noie l'information est une communication non
conforme. Dire ce qui s'est passé, y compris quand c'est une faute d'inattention,
est à la fois l'obligation et la seule position tenable.

## 5. Consigner — dans tous les cas

**Toute violation est inscrite au registre, y compris celle qui n'est pas
notifiée.** C'est une obligation autonome de l'article 33.5, et l'absence de
registre est en soi un manquement — indépendamment de la gravité de l'incident.

Voir [registre-des-violations.md](registre-des-violations.md).

## 6. Corriger

Une fois l'incident clos :

- corriger la cause racine, et pas seulement le symptôme ;
- ajouter le test ou le garde-fou qui aurait détecté la faille — une politique
  RLS manquante se rattrape par un test qui vérifie l'isolation, pas par une
  relecture attentive ;
- mettre à jour le registre interne des traitements si les mesures de sécurité
  changent ;
- reprendre cette procédure si l'incident a montré qu'elle était incomplète.

---

## Aide-mémoire — les 72 premières heures

| Quand | Quoi |
| --- | --- |
| **H+0** | Noter date et heure de la constatation. Contenir : révoquer, couper, faire tourner les secrets. Ne rien effacer. |
| **H+2** | Qualifier : quelles données, combien de personnes, quelle fenêtre, quel accès effectif. Ouvrir la ligne au registre. |
| **H+12** | Décider : notification CNIL ? information des personnes ? Motiver par écrit dans les deux cas, y compris le « non ». |
| **H+72** | Notification CNIL déposée si elle est due, même incomplète. |
| **Ensuite** | Information des personnes si risque élevé. Compléments à la CNIL. Correction de la cause racine. |

---

## Documents liés

- Registre interne des activités de traitement
- [Sous-traitants et transferts](sous-traitants.md)
- [Registre des violations](registre-des-violations.md)
- CNIL — [Notifier une violation de données personnelles](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
