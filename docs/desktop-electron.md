# Une app de bureau pour minddy — cadrage

> **Date** : 2026-08-13 · **Ticket** : MIN-285 · **Statut** : exploration, aucun
> code Electron écrit.
>
> **Quatre décisions prises avant d'écrire**, et ce document ne les rouvre pas :
> le livrable de MIN-285 est ce texte, pas un prototype ; **l'agent qui agit sur
> le dépôt local est le sujet**, le wrapper n'en est que le véhicule ; les
> notifications se contentent de l'app ouverte ; macOS est la seule cible.
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

**Le push est une régression, pas un gain.** Electron n'est pas bâti sur Chromium
mais sur *Chromium Content*, un sous-ensemble qui **n'embarque ni l'API Push ni le
service de push**. `PushManager` n'existe pas dans un renderer Electron ; le
`pushManager.subscribe()` de [lib/push/client.ts](../lib/push/client.ts) y échouera.
Or minddy a déjà le vrai push web depuis MIN-183 — service worker, VAPID, émetteur
serveur — et il sonne **même quand l'app est fermée**, dans Chrome comme dans
Safari. Emballer la web app dans Electron ne l'améliore pas : ça le supprime. Les
seuls remplaçants sont l'APNS d'Apple (`pushNotifications`, **macOS uniquement**,
compte Apple Developer + entitlement + app signée + un second émetteur côté
serveur, à côté de l'émetteur VAPID qu'on garderait pour le web) ou un bricolage
FCM non officiel. On ne fait ni l'un ni l'autre : décision 3.

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
| Notifications **app fermée** | **oui** (Web Push, déjà livré) | non |
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

**Le seul vrai piège est l'authentification.** minddy propose Google et GitHub
([login-form.tsx](../components/auth/login-form.tsx)), et **Google refuse
délibérément OAuth depuis un navigateur embarqué** : l'écran « this browser or app
may not be secure ». Falsifier l'user agent pour passer est fragile et contraire à
leur politique. Le chemin correct est le même que celui de toutes les apps de
bureau :

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

Ce qui reste à vérifier dans une vraie fenêtre, et qu'aucune lecture de code ne
tranche : la palette ⌘K (elle capture des raccourcis que le menu natif capture
aussi), le presse-papier, le collage d'images dans l'éditeur tiptap, le glisser-
déposer de fichiers, et le comportement du realtime quand la fenêtre passe en
arrière-plan.

---

## 3. Les notifications, sans Web Push

**Décision : rien de neuf côté serveur.** L'app est déjà abonnée en temps réel à
tous les projets de l'utilisateur (le pont de MIN-89) ; le renderer transforme ce
qu'il reçoit en `new Notification()`, que le main process rend native, et pose le
compteur de non-lus sur le dock (`app.dock.setBadge`). Zéro infrastructure, zéro
table, zéro clé.

**Ce qu'on perd, et il faut le dire au lieu de l'habiller** : app quittée, plus
rien. C'est acceptable pour une app de bureau qu'on laisse ouverte, et c'est
d'autant plus acceptable que **le web, lui, garde le vrai push** : quelqu'un qui
veut être prévenu à coup sûr garde l'onglet ou la PWA, qui sonneront. La page de
téléchargement doit le dire en une phrase, pas le taire.

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
trois verrous.** Le reste — la boucle, les tools, le ledger, le fil, la PR — ne
bouge pas d'une ligne, et c'est ce qui rend le chantier raisonnable : *le produit
est identique, seule la machine change*.

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

Le reste ne change pas : le tour se termine par un push et une pull request, avec
un token de forge frais demandé au plan de contrôle (`/repo-auth`). **Le produit
est le même** — même fil, mêmes events, même PR. C'est le critère de bascule.

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

1. **Ce qui casse dans une vraie fenêtre.** Palette ⌘K, presse-papier, collage
   d'images, glisser-déposer, realtime en arrière-plan, écran de connexion. Une
   coquille de quatre-vingts lignes, lancée en local et non signée, répond en une
   après-midi — et c'est la première chose à faire.
2. **Le gain réel du local.** Personne n'a chiffré ce que le tour gagne à tourner
   sur un Mac plutôt que dans `iad1`. Le dossier ne repose pas dessus (il repose
   sur *« l'agent voit ta machine »*), mais il ne faut pas resservir un chiffre
   qu'on n'a pas.
3. **Le Node d'Electron contre la cible du bundle.** Un `node -e` dans la version
   d'Electron retenue, comparé à `node24`.
4. **L'installation d'opencode sur une machine sans npm.** Aujourd'hui la VM fait
   `npm i opencode-ai` en ~10,6 s ; sur une machine d'utilisateur, il faut décider
   si on dépend de npm ou si on télécharge la release épinglée.
