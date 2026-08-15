# Une app de bureau pour minddy — cadrage

> **Date** : 2026-08-13 · **Ticket** : MIN-285 · **Statut** : exploration, aucun
> code Electron écrit.
>
> **Quatre décisions prises avant d'écrire**, et ce document ne les rouvre pas :
> le livrable de MIN-285 est ce texte, pas un prototype ; **l'agent qui agit sur
> le dépôt local est le sujet**, le wrapper n'en est que le véhicule ; les
> les notifications se contentaient initialement de l'app ouverte (remplacé par
> APNs en MIN-356) ; macOS est la seule cible.
>
> **Ce qui a été lu pour l'écrire**, plutôt que supposé : le harness de la
> microVM et son protocole ([vm/protocol.ts](../lib/server/agent/vm/protocol.ts),
> [vm/local-host.ts](../lib/server/agent/vm/local-host.ts),
> [vm-launch.ts](../lib/server/agent/vm-launch.ts)), la porte du plan de contrôle
> ([app/api/agent-vm/[...path]/route.ts](<../app/api/agent-vm/[...path]/route.ts>)),
> la politique réseau ([network-policy.ts](../lib/server/agent/network-policy.ts)),
> la clé par run ([run-key.ts](../lib/server/agent/run-key.ts)), le push existant
> ([public/sw.js](../public/sw.js), [lib/push/](../lib/push/)) et l'écran de
> connexion ([login-form.tsx](../components/auth/login-form.tsx)).
> **Rien n'a été mesuré** : aucune des durées de ce document n'est une sonde, et
> les endroits où ça manque sont dits à la fin.

---

## Ce que le ticket croyait, et ce que le dépôt dit

Deux prémisses de MIN-285 ne tiennent pas telles quelles. L'une lui retire son
premier argument, l'autre le rend beaucoup plus constructible qu'il n'en a l'air.

**Le Web Push est indisponible dans Electron.** Electron n'est pas bâti sur Chromium
mais sur *Chromium Content*, un sous-ensemble qui **n'embarque pas le service de
push**. Mesuré dans une vraie fenêtre en MIN-291, et la nuance compte : l'API,
elle, est bien là — `PushManager` existe, `pushManager` est sur le prototype de
`ServiceWorkerRegistration`, et `/sw.js` s'enregistre normalement. C'est
`subscribe()` qui échoue, sur `AbortError: Registration failed - push service not
available`. Conséquence pratique, et elle n'est pas cosmétique :
`isPushSupported()` ([lib/push/client.ts](../lib/push/client.ts)) rend **`true`**
dans l'app, donc l'interrupteur des réglages s'y afficherait comme partout et
échouerait sur une erreur illisible. D'où la branche desktop de
[account-push-devices-section.tsx](../components/settings/account-push-devices-section.tsx)
le disait explicitement jusqu'à MIN-356.
Or minddy a déjà le vrai push web depuis MIN-183 — service worker, VAPID, émetteur
serveur — et il sonne **même quand l'app est fermée**, dans Chrome comme dans
Safari. Emballer la web app dans Electron ne l'améliore pas : ça le supprime. Les
Le remplacement livré en MIN-356 est l'APNs d'Apple (`pushNotifications`,
**macOS uniquement**) : entitlement sur l'app signée, token associé au compte
par la page authentifiée et second émetteur côté serveur. VAPID reste inchangé
pour le web ; aucun FCM non officiel n'entre dans la coquille.

**Tu as déjà une app installable.** [app/manifest.json](../app/manifest.json), les
icônes 192/512, le service worker : « fenêtre sans barre d'URL, icône dans le
dock, notifications même fermée » est une PWA, elle est à portée, elle ne coûte ni
signature ni notarisation ni maintenance d'un binaire Chromium. **Tout ce qu'un
wrapper Electron apporte de plus au confort d'usage, la PWA l'apporte déjà** — sauf
une chose, et c'est celle qui justifie le chantier : la PWA ne touchera jamais ton
disque.

**Le harness, lui, est déjà à moitié local.** Depuis MIN-224 la boucle de l'agent
ne vit plus dans une fonction : c'est un **bundle Node autonome** produit par
[scripts/build-agent-vm.mjs](../scripts/build-agent-vm.mjs), écrit sur le disque de
la microVM et lancé par `node main.js`. Il écrit ses fichiers et lance ses commandes
par [local-host.ts](../lib/server/agent/vm/local-host.ts) — `node:fs` et
`node:child_process`, rien d'autre — et il ne parle au backend que par HTTPS, via
[control-plane-client.ts](../lib/server/agent/vm/control-plane-client.ts). Le faire
tourner sur un Mac au lieu d'une microVM `iad1` n'est pas une réécriture : c'est un
changement d'hébergeur, avec **trois verrous** (§4) et un renoncement (§4.4).

---

## 1. Ce qu'Electron apporte, et ce qu'il retire

| | PWA installée | Wrapper Electron |
| --- | --- | --- |
| Fenêtre dédiée, icône au dock | oui | oui |
| Notifications **app fermée** | **oui** (Web Push) | **oui** (APNs, MIN-356) |
| Notifications app ouverte | oui | oui, natives |
| Raccourci global (⌥ Espace) | non | oui |
| Menu natif, badge de dock chiffré | partiel | oui |
| **Exécuter du code sur ta machine** | **jamais** | **oui** |
| Coût d'entrée | zéro | signature + notarisation + canal de mise à jour |
| Coût récurrent | zéro | ~99 $/an, et une majeure Electron toutes les 8 semaines |

La ligne qui décide est la sixième. Les cinq premières se discutent ; celle-là
n'a pas de substitut. **Le dossier de l'app de bureau, c'est l'agent local, et
rien d'autre.** Si l'agent local ne se fait pas, il faut soigner la PWA et fermer
ce ticket — c'est moins de travail et un meilleur résultat sur les notifications.

Une conséquence à tenir tout du long : **la coquille doit rester mince**. Tout ce
qu'elle contient devra être signé, notarisé, distribué et mis à jour sur les
machines des gens, à un rythme qui n'est pas celui de `git push`. Une coquille de
300 lignes se met à jour deux fois par an ; une coquille qui a des écrans à elle
devient une seconde app à maintenir.

---

## 2. La coquille

**Décision : une seule `BrowserWindow`, qui charge `https://www.minddy.app`, sans
aucun rendu local.** Pas de `file://`, pas de bundle de l'UI dans l'app — c'est ce
qui garantit que l'app de bureau et le web disent toujours la même chose, et que
livrer une feature ne demande pas de re-signer un binaire.

Les réglages qui ne se discutent pas :

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Le renderer
  charge du **code distant** : il ne doit pouvoir appeler que ce qu'un `preload`
  expose nommément par `contextBridge`, et cette surface doit se lire en trente
  secondes.
- Une **garde de navigation** (`will-navigate`) qui refuse tout ce qui n'est pas
  notre origine, et un `setWindowOpenHandler` qui envoie le reste dans le
  navigateur système. Sans ça, un lien vers un site tiers ouvre ce site *dans*
  minddy, avec notre `preload` chargé.
- Un suffixe d'user agent (`minddy-desktop/<version>`), pour que le serveur et
  l'UI sachent tous deux qu'on est dans l'app.

**La barre de titre est une décision d'interface, pas un réglage.** Elle est
masquée (`titleBarStyle: "hidden"`, et non `frame: false` — sans cadre, les
boutons ne se positionnent plus depuis la même origine et remontent dans le
coin). Trois conséquences se tiennent ensemble :

- macOS ne sait plus par où saisir la fenêtre. `-webkit-app-region` est du CSS,
  donc c'est la PAGE qui doit le dire (app/globals.css, section « app de
  bureau »). **Une seule bande, dans le layout racine**, haute comme l'en-tête
  de l'app (60 px) et présente sur tout ce que la fenêtre affiche. La première
  version accrochait la prise à l'en-tête du shell et à la ligne de marque —
  c'est-à-dire aux deux meubles que six configurations n'ont pas : mode zen,
  pages légales, board public, page publiée, vue partagée, `not-found`. La
  fenêtre y était strictement immobile (MIN-292). Une zone `drag` avalant le
  clic, la bande s'accompagne d'un `no-drag` GLOBAL sur tout ce qui s'active.
- Les boutons du système n'existent plus d'eux-mêmes : ils s'allument à la main,
  et se posent **dans la ligne de marque de la barre latérale, à la place de la
  marque**, qui passe à droite. Pas dans une bande à eux, qui pousserait toute la
  colonne vers le bas et se trahirait par une couture d'une autre couleur.
- Barre REPLIÉE (rail), ses 56 px ne les tiennent plus : on les retire, et la
  marque reprend sa place. Le survol qui déplie le rail les ramène — une barre
  dépliée par-dessus la secondaire est une barre dépliée comme une autre. Aller
  les cliquer depuis là revient à SORTIR de la barre du point de vue de
  Chromium : le rail se refermerait sous le pointeur et les emporterait, d'où le
  guetteur de `app-sidebar.tsx`, qui reconnaît cette sortie-là à son coin.

**Ce qui est du SITE ne suit pas dans la fenêtre — et « site » veut dire TOUT le
site** (resserré en MIN-292). L'app de bureau ne montre que deux choses :
l'authentification, et l'app. Les tarifs, la doc du serveur MCP, les
comparatifs, les nouveautés, les pages légales, la page de téléchargement, et
les surfaces publiques à jeton — board de feedback, page publiée, vue partagée —
s'ouvrent dans le NAVIGATEUR. Un board de feedback public dans une fenêtre
installée, c'est le site web dans une fenêtre.

La seule exception est la **landing**, qui ne part pas dehors mais ramène à
l'entrée : on n'y va pas, on y TOMBE, par un logo qui pointe sur `/`. Lancer un
navigateur à chaque clic de logo serait un châtiment.

La décision est dérivée de `PUBLIC_ROUTES`, donc une page publique de plus sort
de la fenêtre sans que personne y pense
([window-routes.ts](../lib/desktop/window-routes.ts)). Et elle a demandé
**quatre** points d'accroche, dont deux qu'on ne trouve pas en réfléchissant :
`will-redirect`, parce que le board de feedback s'atteint par une redirection
SERVEUR (`/feedback` pose un JWT et renvoie vers `/f/<jeton>`, aucun lien ne
pointe jamais dessus), et `did-navigate-in-page`, pour les navigations SPA. Ce
dernier n'est PAS annulable : il ne peut que ramener à l'entrée, et défaire la
navigation a été essayé deux fois sans succès (`canGoBack()` rend `false` juste
après un `pushState` ; la promesse d'`executeJavaScript("history.back()")`
rejette, la navigation détruisant le contexte qui l'attendait). D'où le partage
des rôles : le main process garantit qu'aucune page publique ne s'affiche, et
c'est la PAGE qui évite d'y arriver — les mentions légales de l'écran
d'inscription ouvrent le navigateur elles-mêmes plutôt que de naviguer.

Le bandeau de cookies, lui : une carte flottante qui demande la permission
de mesurer s'adresse à quelqu'un qui vient d'arriver de nulle part, et dans une
app installée elle ne dit plus qu'une chose — « ceci est un site web dans une
fenêtre ». Le choix, lui, ne disparaît pas. Il se pose **une fois**, au centre, dans le
langage de l'app — deux réponses franches, aucune sortie sans répondre, pour que
la question ne se repose jamais (le défaut même des bandeaux qu'on remplace) —
et il vit ensuite dans les réglages (onglet Données), où toute app de bureau le
met, RÉVERSIBLE, ce qu'il n'était pas tant que le bandeau était le seul chemin.

Le laisser seulement dans les réglages avait été essayé une heure : personne n'y
serait allé, et la mesure serait restée éteinte pour tout le monde sans que ce
soit un choix. Tant qu'aucune réponse n'est donnée, le consentement vaut `null`
et PostHog reste sans cookie ni identité — rien n'est mesuré en douce.

**Une boîte de dialogue les retire, sans que rien ne bouge.** Ils sont natifs, et
aucun `z-index` ne passe devant : un dialogue les gardait en travers de son coin,
par-dessus son propre voile. On les retire donc — mais la ligne de marque garde
leur PLACE, figée à ce qu'elle valait à l'ouverture, et dessine trois pastilles
inertes à l'identique
([app-sidebar.tsx](../components/app-sidebar.tsx), `WindowButtonDecoys`). Elles
passent sous le voile comme le reste de l'app. Sans ce leurre, la marque sautait
d'un bout à l'autre de la barre à chaque ouverture de dialogue, pour un objet
qu'on ne regarde même pas.

Leur géométrie est **relevée sur une capture d'écran système décodée pixel par
pixel**, et pas déduite : bords gauches à 19, 42 et 65, haut à 22, **14 px de
diamètre**, donc 23 px de centre à centre. La première version reprenait
l'origine donnée à `trafficLightPosition` et un pas supposé de 20 px — la seule
des trois valeurs qui était juste était l'origine, et le décalage se voyait.

Et la demande **appartient à la page** : elle meurt avec elle. Un rechargement
alors qu'un dialogue est ouvert laissait sinon les boutons cachés pour toujours,
sans plus personne pour les rendre.

**Et en plein écran, on ne les cache jamais.** macOS les emmène en haut de
l'écran, sous sa propre garde ; les masquer par-dessus retire le seul moyen d'en
sortir à la souris. La page, elle, doit quand même l'apprendre pour ne pas leur
garder leur place — d'où deux notions distinctes, ce que la barre DEMANDE et ce
que les boutons FONT, et un aller-retour par le pont
([lib/use-window-buttons.ts](../lib/use-window-buttons.ts)).

**Le seul vrai piège est l'authentification.** minddy propose Google et GitHub
([login-form.tsx](../components/auth/login-form.tsx)), et la politique de Google
est de **refuser OAuth depuis un navigateur embarqué** : l'écran « this browser or
app may not be secure ». La sonde de MIN-290 a nuancé le fait sans changer la
décision : dans une `BrowserWindow` ordinaire (user agent Chrome + `Electron/43`),
l'écran d'identification de Google **s'affiche normalement**, aucun refus — on n'a
pas mené le tour jusqu'au bout avec de vrais identifiants. C'est une détection
qu'on ne contrôle pas et qui peut se resserrer du jour au lendemain ; s'appuyer
dessus, c'est faire dépendre la connexion d'une politique tierce. Falsifier
l'user agent pour passer est fragile et contraire à cette politique. Le chemin
correct est le même que celui de toutes les apps de bureau :

1. l'app demande l'URL d'autorisation sans naviguer (`signInWithOAuth` avec
   `skipBrowserRedirect`), et l'ouvre avec `shell.openExternal` ;
2. le navigateur système fait le tour, revient sur `/auth/callback`, qui — **quand
   la demande vient du desktop** — redirige vers `minddy://auth?code=…` au lieu de
   poser un cookie ;
3. l'app reçoit le deep link (`app.setAsDefaultProtocolClient` + `open-url`, et
   `CFBundleURLTypes` dans l'Info.plist), et échange le code contre une session
   dans sa propre partition (`exchangeCodeForSession`, flux PKCE).

**Ce chemin est nécessaire de toute façon**, même sans OAuth : un lien magique
reçu par mail s'ouvre dans le navigateur par défaut, jamais dans Electron. Donc on
le construit une fois et les trois chemins d'entrée s'en servent. Seule la
connexion par mot de passe fonctionne sans lui.

Ce qui restait à vérifier dans une vraie fenêtre — palette ⌘K, presse-papier,
collage d'images dans tiptap, glisser-déposer, realtime en arrière-plan — a été
vérifié : voir §7.1. Rien ne casse ; il faut un menu applicatif à nous.

**Construit en MIN-291**, et deux choses à savoir avant d'y toucher. La coquille
vit dans [desktop/](../desktop/README.md) et ne contient que du câblage : les
décisions — garde de navigation, contenu du deep link, surface du pont — vivent
dans `lib/desktop/` et y sont testées, parce qu'un dossier qu'on ne compile
qu'avec Electron installé ne peut pas l'être par la suite du dépôt. Et
**`minddy://` ne se teste pas avant l'empaquetage** : hors app empaquetée,
`app.setAsDefaultProtocolClient` inscrit *Electron.app* auprès de LaunchServices,
pas notre instance, et un `open minddy://…` n'atteint donc rien. C'est
`CFBundleURLTypes` qui le règle, et il arrive avec le `.dmg` de MIN-292 — la
première vraie connexion par lien externe se vérifie là.

---

## 3. Les notifications : Web Push et APNs

MIN-291 utilisait le temps réel puis `new Notification()` tant que le renderer
tournait. MIN-356 garde ce chemin comme compatibilité pour une ancienne coquille,
mais les versions actuelles s'inscrivent auprès d'APNs au lancement. Le token du
bundle signé passe par le pont Electron, puis par la session web authentifiée,
et rejoint `push_subscriptions` avec `transport = 'apns'`.

À l'insertion d'une ligne d'inbox, le serveur construit toujours une seule
formulation. `sendPushToUser` choisit ensuite VAPID pour un navigateur ou APNs
pour l'app macOS. APNs affiche l'alerte quand aucun process minddy ne tourne ; si
l'app tourne, `received-apns-notification` la transforme en bannière native et
son clic ouvre la route transportée. Le relais realtime est alors coupé pour ne
pas afficher deux fois la même chose. Le badge du dock reste alimenté par la
liste temps réel : lui représente un état exact, pas un événement APNs.

Ce que ça ouvre en revanche, et qui n'existe pas sur le web : le clic sur une
notification réveille la fenêtre sur le bon ticket, le badge est un chiffre exact,
et le raccourci global ouvre la palette sans passer par le navigateur.

---

## 4. L'agent local

C'est le sujet. Aujourd'hui, un tour d'agent se joue ainsi : la fonction crée une
microVM, y écrit `main.js` et `job.json`, lance `node main.js` détaché, et rend la
main ([vm-launch.ts](../lib/server/agent/vm-launch.ts)). La VM clone le dépôt avec
un token éphémère, fait travailler le modèle, pousse une branche et ouvre une pull
request, et rend son rapport au plan de contrôle.

**Ce qui doit changer pour que ce même tour se joue sur un Mac : le lanceur, et
trois verrous.** Le reste — la boucle, les tools, le ledger, le fil — ne bouge
presque pas, et c'est ce qui rend le chantier raisonnable.

> ### ⚠ Le critère de bascule a changé (MIN-363)
>
> Ce paragraphe disait *« le produit est identique, seule la machine change »*,
> §4.3 le répétait en toutes lettres (« C'est le critère de bascule »), et MIN-293
> le portait comme critère d'acceptation. **Il est mort.** L'audit du 2026-08-14
> l'a mesuré, et le code écrit depuis l'a confirmé. Le laisser là serait un piège
> pour le prochain qui ouvre ce dossier : il découperait des lots sur une promesse
> que le dépôt contredit déjà.
>
> **Le critère qui le remplace :** *le run local rend le même TRAVAIL — même fil,
> mêmes events, même ledger, même pull request — et les écarts qu'il porte sont
> ceux de la liste ci-dessous, nommés, assumés, et dits dans l'interface là où
> l'utilisateur les rencontre.* Un écart qui n'est pas dans cette liste est un
> défaut ; un écart qui y est mais que l'interface tait est un défaut aussi.
>
> | L'écart | Pourquoi il est irréductible |
> | --- | --- |
> | **Le diff en direct tombe** | [`/api/agent-runs/[runId]/diff`](<../app/api/agent-runs/[runId]/diff/route.ts>) lit la **microVM** par RPC pendant que le tour tourne — c'est le seul endroit qui sache ce que l'agent vient d'écrire. Le backend n'a **aucun accès** au disque de l'utilisateur : sur un run local, il ne reste que la forge, donc le travail **poussé**. Pendant le tour, la vue diff montre l'état d'avant ; au premier tour, elle ne montre rien (la branche n'existe pas encore). Ce n'est pas une régression à réparer, c'est une conséquence de la topologie. |
> | **Le type-check peut se taire** | `detectTypeChecker` ([diagnostics.ts](../lib/server/agent/diagnostics.ts)) exige un `./node_modules/.bin/tsc` **exécutable** et rend `null` sinon — sans lever, par conception. Sur un dépôt de l'utilisateur dont les dépendances ne sont pas installées, la porte de livraison ne dit rien plutôt que de dire « ça compile ». Un silence qui ressemble à un feu vert. |
> | **La fin de tour change de forme** | En mode dépôt courant (D2 de l'audit, [current-repo.ts](../lib/server/agent/current-repo.ts)), on ne touche ni à l'index, ni au HEAD, ni à l'arbre de l'utilisateur : le commit se fabrique dans un index jetable, s'accroche à `refs/minddy/run/<id>/work` et part par sha. **Aucune branche locale n'est créée**, `git add -A` n'existe plus, et un fichier que l'humain édite en même temps que l'agent se dit au fil au lieu de se trancher. Même PR à l'arrivée, chemin différent. |
> | **La pull request devient un geste** | Décision D2bis-B, prise le 2026-08-15 en voyant le premier vrai tour local : **le tour ne commite rien et ne pousse rien**, son livrable est l'arbre de travail. Il poussait une branche à chaque fin de tour — par sha, depuis un index jetable, donc introuvable dans le `git branch` de l'utilisateur. Ouvrir une pull request reste possible et reste `create_pr` ; ce n'est simplement plus la fin d'un tour. |
> | **Le confinement n'existe plus** | §4.4 ci-dessous, et l'audit §2 le chiffre : sur trente commandes visant un dossier hors dépôt, **vingt ne publient qu'une permission `bash`**, que `command-guard` — qui ne vise que git — laisse passer. Les approbations d'opencode sont un **anti-accident**, pas une frontière. Une carte « l'agent veut sortir du dossier » branchée sur `external_directory` seul enseignerait une garantie fausse. |
>
> Deux paragraphes de ce §4 ont été écrits **avant** ces décisions et ne décrivent
> plus le produit : **§4.3** (le worktree dédié — renversé par D2 : le défaut est
> le dépôt courant, le worktree devient une option) et **§4.5** (le repli cloud en
> cours de conversation — annulé par D1 : l'environnement se choisit avant le
> premier tour et ne change plus). Ils sont conservés pour le raisonnement qu'ils
> portent ; la décision qui fait foi est celle de
> [l'audit §12](audits/agent-local-2026-08-14.md).

### 4.1 Verrou 1 — prouver quel run on est

Aujourd'hui la VM ne porte **aucun** jeton : le firewall de Vercel Sandbox forwarde
ses requêtes en y ajoutant un OIDC signé par la plateforme, dont le claim
`sandbox_name` vaut `agent-<run.id>`. Le `runId` n'est donc jamais lu dans le corps
— il est *dérivé* — et une VM ne peut rien prétendre d'autre que son propre run.
Sur un Mac, il n'y a pas de firewall pour signer quoi que ce soit.

**Décision : un jeton de run, porté par le client, et une deuxième voie d'admission
dans la seule route qui en dépend.** La séparation faite en MIN-223 nous sert
exactement là : `handleControlPlaneRequest` prend déjà `runId` **en paramètre
d'entrée** ; c'est
[app/api/agent-vm/[...path]/route.ts](<../app/api/agent-vm/[...path]/route.ts>)
qui le dérive du claim, et c'est le seul fichier à toucher. Un jeton opaque, tiré
au lancement, stocké sur la ligne `agent_runs` (haché), à durée de vie du tour,
envoyé en `authorization` — et `handleControlPlaneRequest` ne voit aucune
différence.

**Ce qu'on perd, et qui doit être écrit** : un jeton sur un disque est volable, un
OIDC de plateforme ne l'est pas. Le dégât reste borné à *ce run-là*, pendant *ce
tour-là* — mais l'invariant « la machine qui exécute ne porte aucun secret » cesse
d'être vrai, et il ne faut pas prétendre le contraire ailleurs dans le code.

### 4.2 Verrou 2 — la clé du modèle

Même problème, une marche plus haut. Aujourd'hui la boucle envoie un **placeholder**
dans `authorization` et c'est le firewall qui pose la vraie clé après la sortie de
la VM ([network-policy.ts](../lib/server/agent/network-policy.ts)) ; le proxy local
d'opencode ([vm/llm-proxy.ts](../lib/server/agent/vm/llm-proxy.ts)) relaie sans rien
détenir. Sur un Mac, une vraie clé devra bien exister quelque part.

**Décision : la clé par run à plafond dur, celle de
[run-key.ts](../lib/server/agent/run-key.ts) — elle est déjà écrite.** Une clé
OpenRouter émise pour ce run, avec `limit` en dollars et `expires_at`, tenue par le
fournisseur et non par notre code. Ce que la machine détient n'est alors pas *notre*
clé mais un droit de dépenser le budget de ce run, que l'utilisateur possède déjà.
C'est exactement la doctrine que `run-key.ts` énonce pour la VM, appliquée à une
machine où l'hypothèse de compromission est *plus* forte.

**Conséquence à ne pas manquer** : `run-key.ts` **dégrade volontairement** quand
`OPENROUTER_PROVISIONING_KEY` est absent — il retombe sur la clé plateforme, sans
plafond. Cette dégradation est raisonnable dans une microVM jetable ; sur la machine
d'un utilisateur elle est inacceptable. **Sur le chemin local, l'absence de mint
doit refuser le run**, pas le déplafonner. C'est une ligne de code et c'est le
genre de ligne qu'on n'écrit pas si personne ne l'a dite.

L'alternative — relayer toutes les complétions par notre backend, qui poserait la
clé — garde l'invariant intact mais nous met un proxy en flux tendu sur la totalité
du trafic d'un run, avec sa latence, sa facture et une durée de fonction à
surveiller. On ne la prend pas ; on la note comme repli si le mint devenait
indisponible.

### 4.3 Verrou 3 — quel dépôt, et où

Trois formes possibles, et le choix n'est pas cosmétique.

- **Dans ta copie de travail.** Non. L'agent y écrirait pendant que tu y travailles,
  sur ta branche, dans ton index.
- **Un clone frais dans le dossier de l'app.** Sûr, mais ça jette précisément ce
  pour quoi on est venu : ta chaîne d'outils, tes caches, ton `node_modules`.
- **Un `git worktree` géré par minddy** (`~/Library/Application Support/minddy/…`).
  Mêmes objets git, branche à part, index à part : l'agent ne peut pas te marcher
  dessus, et la machine reste la tienne. **C'est celle-là.**

Deux conséquences que le worktree ne résout pas, et qu'il faut traiter :

1. **`node_modules` n'est pas partagé** entre worktrees. Le premier tour paie une
   installation — comme la microVM aujourd'hui, donc pas une régression, mais pas
   le gain qu'on imagine. Le gain réel est au *deuxième* tour : le worktree, lui,
   survit.
2. **Les fichiers non versionnés sont absents** — `.env`, `.env.local`. Or « le
   dev server démarre et les tests voient les vraies variables » est un des
   arguments du local. Il faut donc un réglage **explicite et par projet** : la
   liste des fichiers ignorés à recopier dans le worktree. Explicite, parce que
   recopier des secrets dans un répertoire où un modèle exécute du shell est une
   décision, pas un défaut.

Le tour se termine par un push et une pull request, avec un token de forge frais
demandé au plan de contrôle (`/repo-auth`) : **c'est le travail rendu qui est le
même** — même fil, mêmes events, même PR. Le CHEMIN, lui, n'est pas le même, et
c'est le critère réécrit en tête de §4 qui le dit : pas de diff en direct pendant
le tour, un type-check qui peut se taire, et une fin de tour qui, en mode dépôt
courant, ne passe plus par l'index ni par une branche locale.

### 4.4 Ce qu'on perd : le confinement

Il faut l'écrire en toutes lettres, parce que tout le raisonnement de sécurité de
l'agent repose dessus. Aujourd'hui, la doctrine assumée est *« la microVM est
compromise par hypothèse »* : le modèle y exécute du shell arbitraire, et c'est
sans conséquence parce que la VM est jetable, sans secret, et qu'elle meurt à la
fin du tour. **Sur ton Mac, aucune de ces trois phrases n'est vraie.** Le modèle a
accès à tes clés SSH, tes jetons, tes autres dépôts, ton trousseau.

Ce n'est pas rédhibitoire — c'est ce que tu acceptes déjà en lançant un agent de
code en local — mais ça ne se laisse pas sous-entendre :

- **opt-in explicite, par projet**, avec un écran qui dit ce que ça autorise, et
  jamais un défaut ;
- [command-guard.ts](../lib/server/agent/command-guard.ts) et
  [repo-path.ts](../lib/server/agent/repo-path.ts) continuent de s'appliquer, mais
  il faut cesser de les décrire comme « du confort » : sur le chemin local, ce sont
  les seuls garde-fous qui restent ;
- **la politique réseau ne s'applique plus du tout.** Elle est une propriété du
  firewall Vercel, pas du harness.

Une piste de durcissement, à explorer plus tard et pas en v1 : lancer le process
sous un profil *seatbelt* macOS (`sandbox-exec`) restreignant l'écriture au
worktree. C'est ce que font Chrome et les agents de code sérieux ; l'API est
formellement dépréciée mais bien vivante.

### 4.5 Comment un run arrive sur ta machine

> **Le lanceur existe depuis MIN-293, et sa forme n'est pas celle décrite plus
> bas.** Ce paragraphe reste pour son raisonnement ; ce qui a été construit tient
> en un invariant et trois surfaces.
>
> **L'invariant : le serveur possède tout ce qui concerne le RUN, la machine
> possède tout ce qui concerne le DISQUE.** Le serveur ne connaît aucun chemin de
> cet ordinateur — un chemin de home ne veut rien dire ailleurs, et le ranger côté
> base le publierait, faux, à tous les membres du projet. La machine, elle, ne
> fabrique aucun champ de run. Le contrat qui les relie est un `VmJob` **amputé de
> son `layout`**, c'est-à-dire du seul champ qui parle de disque
> ([lib/desktop/local-turn.ts](../lib/desktop/local-turn.ts)).
>
> **Et une règle qui en découle, plus simple que n'importe quel arbitrage : la
> machine ne parle qu'à l'origine qui lui a donné son travail.** Le manifeste du
> harness, ses octets, l'affectation et le plan de contrôle viennent tous de
> l'origine du canal actif, ou d'aucune. C'est ce qui empêche une coquille en
> preview de jouer un tour avec le harness de production — le contrat typé
> divergerait en silence — et c'est aussi ce qui fait marcher le développement
> contre `localhost`.
>
> | Surface | Ce qu'elle fait |
> | --- | --- |
> | `GET /api/desktop/harness` | le manifeste : empreinte, taille, version de protocole, version d'opencode. Demandé à **chaque** tour, deux cents octets. |
> | `GET /api/desktop/harness/bundle` | les octets, quand l'empreinte a changé. Un fichier par empreinte sous `userData/harness/`. |
> | `POST /api/desktop/local-turn` | le pull du clone (MIN-371) : sélectionner parmi ses projets attachés, admettre, claim, préparer, monter le bail, rendre l'affectation. L'ancien appel par identifiant reste compatible. |
>
> Depuis MIN-371, le clone appelle cette surface en arrière-plan avec sa session
> et les seuls identifiants de ses projets attachés. Il relit la liste à chaque
> passage, ne transmet aucun chemin et joue l'affectation avec le lanceur déjà en
> place. Le renderer n'est plus dans la boucle : un téléphone peut envoyer le
> message suivant, le run repasse en file et le clone le réclame.
>
> Trois différences avec ce qui suit, et chacune vient d'une décision prise
> depuis : **le repli cloud n'existe pas en cours de conversation** (D1 :
> l'environnement se choisit avant le premier tour) ; **la présence n'est pas un
> heartbeat** mais un pull avec bail, une machine qui ne réclame plus n'étant plus
> là (§5) ; et **le drain ne prend jamais un run local** — sans quoi l'utilisateur
> demande sa machine, obtient le cloud, et rien ne le lui dit.

Le lanceur est le seul morceau réellement neuf.

- L'app de bureau **annonce sa présence** (un heartbeat par utilisateur, sur le
  pont temps réel déjà en place), en disant quels projets elle a en local.
- Au lancement, [launch.ts](../lib/server/agent/launch.ts) regarde une préférence
  de projet (« exécuter sur ma machine ») **et** une présence vivante. Si les deux
  sont là, il ne crée pas de sandbox : il laisse le run en attente et le diffuse
  sur son topic.
- L'app le prend, écrit `job.json`, et lance le bundle.
- **Pas de présence dans les quelques secondes → repli sur le cloud**, et le fil
  le dit. Un run qui reste en attente parce qu'un Mac est en veille est un run
  perdu ; un run qui bascule dans le cloud en le disant est un run.

Deux détails qui ont l'air petits :

**Le bundle se télécharge par tour, il ne s'embarque pas dans l'app.** Le contrat
entre le harness et le plan de contrôle est typé et il bouge
([protocol.ts](../lib/server/agent/vm/protocol.ts)) : une app installée il y a deux
mois ne doit pas jouer un tour avec un harness de deux mois. Comme la fonction
l'écrit dans la VM, l'app le récupère depuis le déploiement — c'est ce qui garde la
coquille mince (§1) et le contrat vérifié par le compilateur.

**Electron embarque Node**, donc rien à installer côté utilisateur pour ça
(`utilityProcess.fork`, ou un fork avec `ELECTRON_RUN_AS_NODE`). Reste à vérifier
que le Node d'Electron correspond à la cible `node24` du bundle esbuild. Le binaire
opencode, lui, doit être installé et épinglé sur la machine — la version est déjà
une constante partagée
([opencode-version.ts](../lib/server/agent/vm/opencode-version.ts)), écrite pour
avoir exactement ce genre de deuxième lecteur.

---

## 5. Distribuer sur macOS

> **Construit en MIN-292.** Tout ce que ce paragraphe décrit est câblé :
> [desktop/electron-builder.yml](../desktop/electron-builder.yml) porte
> l'identité du bundle, le hardened runtime et la notarisation ;
> [desktop/src/updater.ts](../desktop/src/updater.ts) les mises à jour ;
> [scripts/publish-desktop.mjs](../scripts/publish-desktop.mjs) la publication du
> flux ; `/download` la page. Ne restent que les gestes qui demandent un compte
> Apple, et ils ont leur marche à marche :
> **[docs/desktop-signing.md](desktop-signing.md)**.
>
> Une chose que ce cadrage n'avait pas dite, et qui compte : **l'IDENTITÉ de
> l'app arrive ici et nulle part avant**. Tant qu'on lançait depuis le dépôt,
> macOS lisait l'`Info.plist` d'`Electron.app` — icône Electron au dock,
> « Electron » dans la barre de menus, et un `minddy://` qui n'atteignait
> personne parce que LaunchServices inscrivait Electron.app. C'est le bundle qui
> parle, pas le code.

Rien d'ici n'est optionnel : hors App Store, macOS refuse de lancer une app non
notarisée, et le message qu'il affiche fait fuir.

- **Apple Developer Program : 99 $/an.** Certificat *Developer ID Application*,
  *hardened runtime* activé, signature, puis notarisation (`notarytool`) et
  agrafage du ticket. C'est mécanique une fois branché, et c'est un secret de plus
  en CI.
- **Mises à jour** : `electron-updater`, avec un flux servi depuis un stockage
  quelconque (un blob suffit). Squirrel.Mac **exige** une app signée : la signature
  n'est pas seulement une formalité de premier lancement, c'est ce qui permet à
  l'app de se mettre à jour ensuite.
- **Poids** : de l'ordre de 100 Mo, Chromium compris — pour afficher un site que
  Safari affiche déjà. C'est le prix du §4, pas celui du §2.
- **Entretien** : une majeure Electron toutes les 8 semaines, trois majeures
  supportées — soit environ six mois avant qu'une version cesse de recevoir des
  correctifs de sécurité. Un binaire qui embarque Chromium et vit chez des gens ne
  se laisse pas geler.
- **Pas d'App Store.** Apple rejette les enveloppes web fines, et l'App Sandbox
  interdirait précisément le §4. Distribution directe, depuis un `.dmg` lié à la
  landing.

---

## 6. Ce que ce cadrage met hors périmètre

- **Tout mode hors-ligne et toute donnée locale.** Le ticket le dit et c'est la
  bonne décision : le service worker n'a délibérément aucun handler `fetch`
  ([public/sw.js](../public/sw.js)), et lui en donner un ferait de nous les
  responsables de ce qui s'affiche.
- **Windows et Linux.** À rouvrir quand un utilisateur le demande, pas avant.
- **APNS.** Voir §3.
- **L'App Store.** Voir §5.

---

## 7. Ce que ce cadrage n'a pas fait

Quatre choses sont écrites au conditionnel parce qu'elles n'ont pas été mesurées.
Aucune ne remet en cause la direction ; toutes doivent tomber avant le lot
correspondant.

1. ~~**Ce qui casse dans une vraie fenêtre.**~~ **Mesuré (MIN-290), et la réponse
   est : rien.** Une coquille jetable sur Electron 43.4.0 a chargé
   `https://www.minddy.app` en `sandbox: true` / `contextIsolation: true`,
   connectée par mot de passe. Marchent tels quels : ⌘K et ⌘P (le menu par
   défaut porte 19 accélérateurs, aucun ne touche ⌘K, ⌘P ni ⌘;) ; le
   presse-papier dans les deux sens, permissions déjà accordées ; le collage
   d'une image du presse-papier système dans tiptap, téléversée et insérée ; le
   dépôt d'un vrai fichier sur l'éditeur (`Input.dispatchDragEvent`), téléversé
   et inséré au point du lâcher ; `new Notification()` depuis le renderer, sans
   demande de permission ; la session, qui persiste dans la partition.
   **Le realtime survit à l'arrière-plan** : fenêtre cachée 7 minutes, la
   WebSocket Supabase reste ouverte et le battement garde son rythme (~2/min),
   avec `backgroundThrottling` à `true` comme à `false` — inutile de le couper.
   Ce qu'il reste à faire, et c'est du travail, pas un risque : **un menu
   applicatif à nous**, parce que le menu par défaut donne ⌘W à « fermer la
   fenêtre » et ⌘R à « recharger », deux gestes qu'une app ne doit pas offrir
   sur une SPA authentifiée.
   Deux réserves honnêtes : sept minutes ne sont pas une nuit, et le clavier a
   été injecté par Chromium sur une partie des essais — l'arbitrage du menu
   natif, lui, a été lu dans le menu plutôt que frappé.
2. **Le gain réel du local.** Personne n'a chiffré ce que le tour gagne à tourner
   sur un Mac plutôt que dans `iad1`. Le dossier ne repose pas dessus (il repose
   sur *« l'agent voit ta machine »*), mais il ne faut pas resservir un chiffre
   qu'on n'a pas.
3. ~~**Le Node d'Electron contre la cible du bundle.**~~ **Mesuré (MIN-290) :**
   Electron 43.4.0 embarque **Node 24.18.1** — la cible `node24` du bundle,
   trait pour trait.
4. **L'installation d'opencode sur une machine sans npm.** Aujourd'hui la VM fait
   `npm i opencode-ai` en ~10,6 s ; sur une machine d'utilisateur, il faut décider
   si on dépend de npm ou si on télécharge la release épinglée.
