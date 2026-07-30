# Registre des violations de données — minddy

*Article 33.5 du RGPD. Document interne, à présenter en cas de contrôle.*

**Toute violation y figure, notifiée ou non.** L'obligation de tenir ce registre
est autonome : elle ne dépend ni de la gravité de l'incident, ni de la décision
de notifier. Un registre absent est un manquement en soi.

La procédure à suivre est décrite dans
[procedure-violation.md](procedure-violation.md).

---

## État

**Aucune violation de données personnelles constatée à ce jour.**

Dernière vérification : 30 juillet 2026.

---

## Comment consigner une violation

Copier le gabarit ci-dessous sous « Violations enregistrées », le remplir dès la
qualification (étape 3 de la procédure) et le compléter au fil de la réponse.
Ne jamais attendre la clôture pour ouvrir la ligne : le registre sert aussi à
tenir le fil pendant l'incident.

Les champs se remplissent même quand la réponse est « inconnu à ce stade » —
écrire « inconnu » et dater est une information ; laisser vide n'en est pas une.

### Gabarit

```markdown
### V-AAAA-NN — <titre court et factuel>

| Champ | Valeur |
| --- | --- |
| Date et heure de la violation | |
| Date et heure de la constatation | *(fait courir le délai de 72 h)* |
| Origine de la découverte | alerte hébergeur / signalement / journaux / constat interne |
| Nature | confidentialité / intégrité / disponibilité *(cumulables)* |
| Cause | erreur de configuration / faille applicative / compromission d'un accès / erreur humaine / défaillance d'un sous-traitant |
| Traitements concernés | *renvoi au registre des traitements* |
| Catégories de données | |
| Catégories de personnes | utilisateurs inscrits / visiteurs de boards publics / prospects |
| Nombre de personnes concernées | exact ou estimation motivée |
| Nombre d'enregistrements | |
| Fenêtre d'exposition | du … au … |
| Accès effectif constaté | oui *(par qui, quelle preuve)* / non / indéterminé |
| Conséquences probables | |
| Facteurs aggravants | volume, réidentification aisée, identifiants réutilisables, personnes vulnérables |

**Mesures de confinement immédiates**

*(ce qui a été révoqué, coupé, mis en rotation — avec l'horodatage de chaque action)*

**Notification à la CNIL**

| | |
| --- | --- |
| Décision | notifiée / non notifiée |
| Motivation | *obligatoire dans les deux cas — le « non » se justifie par écrit* |
| Date et heure du dépôt | |
| Numéro de récépissé | |
| Compléments transmis | *(art. 33.4)* |

**Information des personnes concernées**

| | |
| --- | --- |
| Décision | informées / non informées |
| Motivation | *risque élevé ? dispense de l'art. 34.3 invoquée ?* |
| Date | |
| Canal | e-mail / bandeau applicatif / communication publique |
| Nombre de personnes informées | |

**Correction de la cause racine**

*(correctif déployé, test ou garde-fou ajouté, procédure mise à jour)*

**Clôture**

| | |
| --- | --- |
| Date de clôture | |
| Enseignement retenu | |
```

---

## Violations enregistrées

*(aucune à ce jour)*
