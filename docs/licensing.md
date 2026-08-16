# Politique de licence et d'open core

Date de décision : 16 août 2026. Ce document est une décision de produit et d'exploitation ; il ne remplace pas un avis juridique pour une situation particulière.

## Décision

Le dépôt `minddy` est distribué sous **GNU Affero General Public License v3.0 only** (AGPL-3.0-only). Ce choix remplace la politique MIT pour les versions publiées à partir de cette décision. Les copies et contributions historiques restent aussi soumises à leurs notices MIT et autres notices applicables, qui ne sont pas retirées par ce changement.

Nous choisissons l'AGPL pour accueillir les contributions et l'auto-hébergement tout en empêchant qu'une version modifiée, proposée comme service réseau, reste fermée. La MIT maximisait la réutilisation, mais ne protégeait pas cet objectif. L'AGPL impose à l'opérateur d'une version modifiée de proposer à ses utilisateurs distants le code source correspondant de cette version, sous AGPL-3.0.

L'expression « AGPL-3.0-only » est intentionnelle : aucune migration future vers une autre version de l'AGPL n'est automatique.

## Frontière produit et commerciale

Il n'existe **pas d'édition Enterprise distribuée** ni de module propriétaire chargé par le cœur. Tout ce qui est nécessaire pour installer, administrer, utiliser, exporter et faire évoluer minddy auto-hébergé appartient au cœur AGPL : application web, API, schéma et migrations de base de données, client desktop, CLI/outillage publié et documentation d'exploitation.

Le revenu peut provenir de services qui ne sont pas une distribution ou une extension du cœur : hébergement managé, support/SLA, migration, formation et opérations privées (facturation, support, supervision de flotte, gestion des comptes du service). Ces surfaces doivent vivre hors de ce dépôt et communiquer avec le cœur par des protocoles documentés. Elles ne doivent pas contenir une fonction nécessaire à l'usage normal de l'édition auto-hébergée.

Une future édition commerciale ne pourra être décidée qu'après un nouveau contrôle de chaîne de droits. Sans CLA ou cession couvrant explicitement la double licence, les titulaires de droits de chaque contribution concernée devront autoriser cette licence commerciale ; l'AGPL seule ne le permet pas.

## Chaîne de droits et dépendances

L'inventaire Git au 16 août 2026 identifie des contributions de Clément Guérin, « mangué », `minddy agent` et `minddy-app[bot]`. Git est une piste d'audit, pas une cession de droits. Le dépôt garde donc un fichier `NOTICE` avec les attributions connues et la licence MIT historique. Avant toute publication ou relicence présentant une propriété exclusive, le mainteneur doit archiver pour chaque contributeur externe l'accord/contrat qui confirme le droit de contribuer sous AGPL-3.0-only, ou obtenir une confirmation écrite. Les contributions d'un agent doivent être rattachées à la personne ou à l'organisation qui détenait les instructions et les droits d'utilisation du service d'IA.

L'audit du lockfile recense principalement MIT, Apache-2.0, ISC et BSD ; il ne recense pas de GPL-2.0-only. Des dépendances MPL-2.0 et LGPL-3.0-or-later existent (notamment dans la chaîne `sharp`) et restent sous leurs propres conditions. Le code du projet ne doit ni copier leurs sources dans le cœur sans nouvel examen, ni supprimer leurs notices. Le fichier de police Inter est sous SIL OFL-1.1 et garde sa notice dédiée. Toute dépendance, asset, police, icône ou capture ajouté doit avoir une origine et une licence tracées avant inclusion.

## Contributions

Les contributions sont acceptées sous AGPL-3.0-only, avec un **DCO** : chaque commit doit porter `Signed-off-by:` et atteste que son auteur a le droit de le soumettre sous cette licence. Aucun CLA ni cession de copyright n'est requis. Le DCO ne donne pas au projet le droit de proposer ultérieurement une licence propriétaire ; c'est volontaire et protège les contributeurs.

## Marque

La licence porte sur le droit d'auteur et les brevets éventuels, pas sur les marques. Les droits éventuels sur le nom « minddy », les logos et les éléments d'identité visuelle ne sont pas concédés. Un fork peut expliquer honnêtement sa relation avec minddy et conserver les attributions nécessaires, mais ne doit pas se présenter comme le service officiel ni employer les logos de façon à créer une confusion. Toute future marque enregistrée fera l'objet d'une politique séparée.

## Obligations opérateurs et distributeurs

- Un distributeur conserve `LICENSE`, `NOTICE` et les notices de tiers, et fournit le code source correspondant quand l'AGPL l'exige.
- Un opérateur qui modifie minddy et permet à des utilisateurs de l'employer via le réseau met à leur disposition l'offre de téléchargement du code source correspondant, y compris les scripts nécessaires pour générer, installer et exécuter la version déployée.
- Une instance non modifiée peut indiquer le commit/tag et l'URL du source ; une instance modifiée doit exposer son propre source, ses patches et ses instructions de construction. La mention de l'upstream seule ne suffit pas.
- Les clés, données clients, configurations de production et l'infrastructure d'hébergement ne font pas partie du code source correspondant et ne doivent jamais être publiés.

Cette politique doit être revue avant chaque modification de frontière entre le cœur et une surface commerciale, et à chaque ajout de code ou d'assets d'une provenance externe.

