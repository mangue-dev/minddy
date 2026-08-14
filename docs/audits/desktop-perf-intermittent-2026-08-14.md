# Deuxième passe — pourquoi le défaut est RARE

App de bureau minddy (Electron 43 / macOS). Complète, sans la remplacer, `docs/audits/desktop-perf-2026-08-14.md`.

---

## 1. Ce que le témoignage a tranché

**« Honnêtement au ressenti les deux sont tout autant fluides » élimine tout coût permanent.** Un impôt payé à chaque frame — un vecteur de régions annotées reconstruit à chaque layout, un `Recalculate Style` sur tout le document à chaque ouverture de menu, un board non mémoïsé — se ressent en continu, et se ressent *plus* là où il est plus lourd. Si le régime permanent est le même dans Chrome et dans la coquille, alors ce qui les sépare n'est pas un coefficient, c'est un **événement**. La thèse centrale de la première passe — le creusement `no-drag` global de `app/globals.css:1710-1731` comme cause principale — est donc **écartée**. Ce qui reste vrai dans ce premier rapport ne bouge pas d'un mot : les règles existent, leur périmètre est bien celui décrit, C1 (20 dropdowns Radix en `modal` écrivant `pointer-events:none` sur `<body>`), C5, C6, C7, P2, P4 et P6 sont des défauts réels et leurs correctifs restent bons. Ils ne sont simplement pas la réponse à *cette* question-ci. Le §5 de ce rapport (la manip DevTools, l'A/B `data-desktop-app`, le budget de 8,3 ms sur ProMotion) reste la meilleure page du document et sert de socle au §3 ci-dessous.

**« Assez rare pour ne pas arriver quand on le cherche » impose trois choses à toute explication.** D'abord une **condition nommée** qui n'est vraie que parfois : un seuil franchi, deux tâches qui courent l'une contre l'autre, un état de fenêtre, une accumulation dans un process qui vit des jours. Ensuite l'**inversion du geste de recherche** : chercher, c'est cliquer lentement, bouger la souris, revenir vite — trois gestes qui consomment ou désarment précisément les mécanismes candidats. Enfin, un mécanisme qui se déclenche **à chaque ouverture de menu est disqualifié d'office**, aussi coûteux soit-il, puisqu'il se reproduirait à la demande. Et deux symptômes distincts, qu'il faut refuser de mélanger : « le rail qui se ferme plus lentement » est une **animation à cadence dégradée** (des frames perdues) ; « un popover qui s'ouvre, se referme et s'ouvre en à peine 100 ms » n'est **pas un problème de rendu** — c'est un démontage/remontage ou une bascule d'état, donc un événement de **logique**. Les mélanger serait la faute la plus coûteuse de ce document ; le §2 les sépare, et le §3 donne l'instrument qui les distingue en une ligne de journal.

Une note de méthode, qui pèse sur la lecture du test A/B : dans l'usage quotidien, la fenêtre de la coquille est celle qu'on **quitte et retrouve** vingt fois par jour (⌘W la cache, `desktop/src/main.ts:323-327`), tandis que l'onglet Chrome du test était ouvert côte à côte, visible, quelques minutes. Les mécanismes gouvernés par un cycle caché→visible sont donc structurellement **absents du test comparatif** tout en étant quotidiens à l'usage. C'est exactement le profil « les deux sont aussi fluides, et pourtant l'app native fait des trucs que le navigateur ne fait pas ».

---

## 2. Les mécanismes retenus, par pouvoir explicatif

### A. « Le rail qui se ferme plus lentement »

#### A1 — La reprise après absence lâche jusqu'à 600 parcours du cache react-query en une boucle synchrone, à l'instant précis où la fenêtre revient

**Le mécanisme.** Sur `visibilitychange` → visible, l'effet de reprise appelle `catchUp([...USER_SCOPE_KEYS, ...topicIds.flatMap(projectScopeKeys)])` ([lib/realtime-provider.tsx:749](lib/realtime-provider.tsx)). `catchUp` ([:620-631](lib/realtime-provider.tsx)) est une boucle `for` **synchrone** qui appelle `queryClient.invalidateQueries({ queryKey })` une clé à la fois, sans `refetchType` — donc au défaut `"active"`. Chaque appel fait **deux** balayages complets du cache (`findAll` dans `invalidateQueries`, puis un second dans le `refetchQueries` qu'il enchaîne), pas un. Le compte : 9 clés utilisateur ([:481-491](lib/realtime-provider.tsx)) + 11 clés par projet + 21 préfixes partagés dédoublonnés une fois ([:492-545](lib/realtime-provider.tsx)), plafonné à 25 canaux projet (`MAX_PROJECT_CHANNELS`, [lib/realtime-topics.ts:17](lib/realtime-topics.ts)). Sur un compte à cinq projets : ~85 appels, donc ~170 parcours ; au plafond, ~305 appels et ~610 parcours. Et le cache n'a pas de plafond : `gcTime` vaut 24 h ([lib/query-provider.tsx:45](lib/query-provider.tsx)) et **le document de la coquille n'est jamais rechargé** (pas de `reload` ni de `forceReload` dans le menu, [desktop/src/menu.ts:66-70](desktop/src/menu.ts)), donc N croît toute la journée — un `["comments",id]` et un `["events",id]` par ticket ouvert. Le coût est en O(appels × N), avec N qui monte tout seul.

**La condition qui le rend intermittent.** Un seuil, lu dans le code : `shouldCatchUpOnResume` ([lib/realtime-resume.ts:48-57](lib/realtime-resume.ts)) ne rend `true` que si la socket s'est déclarée tombée, **ou** si l'absence dépasse `RESUME_AFTER_HIDDEN_MS = 15_000` ([:35](lib/realtime-resume.ts)). Un aller-retour de trois secondes — le geste exact de quelqu'un qui essaie de reproduire — ne déclenche **rien**. Il faut être parti plus de quinze secondes *et* interagir dans la seconde qui suit le retour. Le coût, lui, dépend de deux variables qu'on ne voit pas en observant : le nombre de projets du compte, et le nombre de requêtes accumulées depuis le dernier lancement. Le même geste coûte 20 ms le matin et 150 ms le soir.

**Pourquoi la coquille change l'issue.** Le chemin n'est pas absent de Chrome — changer d'onglet bascule `visibilityState` de la même façon. Ce que la coquille change est la **fréquence**, et elle la change structurellement : ⌘W et le feu rouge **cachent** la fenêtre au lieu de la détruire ([desktop/src/main.ts:323-327](desktop/src/main.ts), [desktop/src/menu.ts:84-91](desktop/src/menu.ts)), `app.on("activate")` la ramène ([:560-564](desktop/src/main.ts)), et l'app ne quitte jamais sur darwin ([:570-572](desktop/src/main.ts)). Le cycle visible→caché→visible se rejoue donc des dizaines de fois par jour **sur le même document, avec le même cache**, là où un ⌘W dans Chrome détruit l'onglet et où le rechargement suivant repart d'un snapshot borné. Une fenêtre unique est en outre cachée par périodes *longues* (on va dans l'éditeur, dans le terminal) : le seuil de 15 s est franchi presque à chaque fois.

**Le correctif.** Pas celui qu'on croit. Restreindre à `type: "active"` casserait le marquage des requêtes inactives, qui est exactement ce que le commentaire [:614-618](lib/realtime-provider.tsx) décrit et ce qui fait qu'une surface rouverte après l'absence redemande la vérité (avec `staleTime: 5 * 60_000`, [lib/query-provider.tsx:132](lib/query-provider.tsx), elle serait resservie périmée pendant cinq minutes). Borner aux projets à l'écran est pire : les autres alimentent `GLOBAL_BOARD_KEY`, `HOME_SUMMARY_KEY` et `TRIAGE_COUNTS_KEY`, lus par la sidebar sur toutes les pages. Le geste juste est **un seul parcours** :

```ts
// lib/realtime-provider.tsx:620 — même couverture (actives ET inactives),
// un findAll au lieu de plusieurs centaines.
const catchUp = useCallback((keys: QueryKey[]) => {
  const wanted = new Set(keys.map((k) => JSON.stringify(k)));
  void queryClient.invalidateQueries({
    predicate: (q) => {
      // Une clé matche si l'un de ses préfixes est demandé.
      for (let n = q.queryKey.length; n > 0; n--) {
        if (wanted.has(JSON.stringify(q.queryKey.slice(0, n)))) return true;
      }
      return false;
    },
  });
}, [queryClient]);
```

#### A2 — Après une coupure de socket, le rattrapage est rejoué UNE FOIS PAR CANAL, et `wakeRealtime` provoque lui-même la coupure trois secondes après A1

**Le mécanisme.** Dans `openScope`, le callback de `channel.subscribe` marque `dropped = true` sur `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` et rejoue `catchUp(scopeKeys)` à la re-souscription ([lib/realtime-provider.tsx:664-677](lib/realtime-provider.tsx)). Or `dropped` est une variable de **fermeture par canal** ([:644](lib/realtime-provider.tsx)) tandis que le `seen` qui dédoublonne vit **à l'intérieur** de `catchUp` ([:622](lib/realtime-provider.tsx)) : il est neuf à chaque appel. Une coupure ferme *tous* les canaux d'un coup — une seule WebSocket porte les 26 topics, et phoenix propage l'erreur à chacun (`onConnClose` → `triggerChanError`, `@supabase/phoenix/assets/js/phoenix/socket.js:547-579`, remonté en `CHANNEL_ERROR` par `@supabase/realtime-js/dist/main/RealtimeChannel.js:157`). À la reconnexion, chaque canal rappelle `catchUp(32)` : 137 invalidations sur un compte à quatre projets, 809 au plafond, dont la grande majorité rejouent les mêmes 21 préfixes partagés. Et comme les rejoins arrivent au fil des ACK, le travail est **étalé sur plusieurs images consécutives** — c'est-à-dire pile la durée d'une animation de rail (`transitions.shell`, [components/app-sidebar.tsx:795](components/app-sidebar.tsx)).

**La condition qui le rend intermittent — et c'est le point que la première passe ne pouvait pas voir.** Ce n'est pas seulement « une coupure arrive parfois ». C'est que **A1 fabrique A2**. `resume` appelle `wakeRealtime(realtime)` ([:751](lib/realtime-provider.tsx)) qui, sur une socket qui se dit ouverte, envoie un battement puis, `ZOMBIE_PROBE_MS = 3_000` plus tard, un second **destiné à forcer phoenix à conclure la mort et à tout rejoindre** ([lib/realtime-resume.ts:87-103](lib/realtime-resume.ts)). Autrement dit : toute reprise de plus de quinze secondes déclenche A1 à l'instant du retour, **puis A2 trois secondes après**, si la socket était zombie. Les deux se composent sur un seul geste, et ce geste est celui que la coquille rend quotidien. Le reste du temps — socket vivante, absence courte — rien ne part. La condition est nommée, non commandable, et sa fréquence est une fonction directe du fait que la fenêtre se cache au lieu de mourir. `dropped` est en outre faux à la première souscription : le défaut n'existe pas au lancement de l'app, seulement chez quelqu'un qui la laisse ouverte.

**Le correctif.** Garder le drapeau par canal — il attrape aussi la chute d'**un seul** canal (join refusé, jeton périmé sur un topic privé), qu'un écouteur au niveau socket ne verrait pas. Ne hisser que la **file** : un `catchUpCoalesced(keys)` au niveau du provider, qui empile dans un `Set<string>` et vide en un seul `invalidateQueries({ predicate })` par tour de boucle. C'est le même correctif que A1, et il rend les deux. ⚠ **File séparée de `timers`** ([:586-612](lib/realtime-provider.tsx)) : cette map-là porte le mode dans son identité de coalescence (`${refetch}:${hash}`, [:598](lib/realtime-provider.tsx)) pour qu'un `"none"` n'avale pas un `"active"` en attente ; la partager réintroduirait ce bug exact.

#### A3 — La fenêtre cachée part en purge mémoire, et c'est au retour qu'on le paie

**Le mécanisme.** Les deux gestes « fermer » sont recâblés en `hide()` ([desktop/src/main.ts:323-327](desktop/src/main.ts), [desktop/src/menu.ts:88-90](desktop/src/menu.ts)). Comme c'est la seule fenêtre (`setWindowOpenHandler` refuse toute autre, [:216-223](desktop/src/main.ts)), le process renderer se retrouve sans aucune page visible : Chromium le passe en arrière-plan, avec ce que ça implique de purge de tuiles du compositeur et d'images décodées, et macOS lui rétrograde sa QoS. Au `show()` suivant ([:363](desktop/src/main.ts), [:502](desktop/src/main.ts), [:562](desktop/src/main.ts)), tout est à refaire, et le process n'est **jamais renouvelé**.

**La condition.** Conjonction : la fenêtre doit être restée cachée assez longtemps pour franchir le seuil de purge — minutes, pas secondes — **et** l'utilisateur doit interagir dans la seconde qui suit le retour. Cacher dix secondes et revenir ne coûte rien de visible.

**Honnêteté sur ce constat.** Le mécanisme Chromium invoqué (`MemoryPurgeManager`, rétrogradation de QoS) n'est lisible **nulle part** dans ce dépôt ni dans `node_modules` : c'est une inférence, et rien ne l'a mesuré. Il ne peut par ailleurs expliquer **que** le symptôme (a) : une purge de tuiles se paie en re-rasterisation, elle ne démonte aucun sous-arbre React. Je le garde en troisième position parce qu'il partage sa condition déclenchante avec A1 et A2 — le retour de fenêtre — et que le §3 les instrumente d'un seul coup. **Pas de correctif à l'aveugle ici**, et surtout pas « faire vraiment fermer le feu rouge » : les notifications de bureau sont émises **par le renderer** ([lib/use-desktop-notifications.ts:86-93](lib/use-desktop-notifications.ts)), détruire la fenêtre les supprimerait, sans APNS ni FCM pour rattraper ([:24-26](lib/use-desktop-notifications.ts)). Le commentaire [desktop/src/main.ts:321-322](desktop/src/main.ts) le dit mot pour mot. C'est un choix payé, pas un arbitrage ouvert.

---

### B. « Le popover qui s'ouvre, se referme et s'ouvre »

**Dis-le d'abord franchement : rien dans cette passe n'explique ce symptôme avec certitude.** Les trois mécanismes ci-dessous sont les seuls candidats qui produisent littéralement un événement de logique, et aucun ne couvre le cas complet. C'est précisément pourquoi le §3 est le vrai livrable de ce document.

#### B1 — La carte des régions `-webkit-app-region` est une géométrie expédiée au process navigateur, et pendant les 300 ms d'animation du rail elle est périmée

**Le mécanisme.** Trois règles se superposent dans les 60 px du haut : la bande fixe ([app/globals.css:1684-1693](app/globals.css)), l'en-tête du shell ([:1739-1740](app/globals.css)) et la ligne de marque ([:1778-1782](app/globals.css)) en `drag`, creusés par la règle globale `no-drag` ([:1710-1731](app/globals.css)). Ces creusements sont **géométriques** : Blink les recollecte en fin de layout et envoie le vecteur de rectangles au process navigateur, qui seul arbitre si un `mousedown` appartient à la fenêtre ou à la page. Or ce qui occupe la bande **bouge** : la `motion.aside` anime sa largeur 56 ↔ 256 px ([components/app-sidebar.tsx:810-815](components/app-sidebar.tsx)) et tout le contenu glisse avec elle ; la marque se translate de `100cqw - 100%` ([app/globals.css:1785-1786](app/globals.css)). Quand une décision d'arbitrage arrive sur une carte d'une image de retard, un appui qui visait un contrôle est consommé par macOS comme prise de fenêtre : **le renderer ne reçoit ni `pointerdown` ni `click`**, donc le `DismissableLayer` de Radix ne ferme pas ce qu'il devrait fermer et le déclencheur ne s'ouvre pas ; à l'inverse un appui que la carte périmée croit `no-drag` arrive à la page pendant que la fenêtre commence à se déplacer.

**La condition qui le rend intermittent.** La carte n'est fausse que **pendant qu'elle change** : les ~300 ms d'animation du rail, ou l'image où la marque commence son glissement. Hors de ces fenêtres — l'immense majorité du temps — elle est exacte. Il faut donc cliquer dans les 60 px du haut dans les quelques centaines de millisecondes qui suivent un frôlement du rail. C'est un geste courant (on frôle la barre en montant vers l'en-tête) mais **jamais celui qu'on refait quand on cherche** : chercher, c'est cliquer lentement, et lentement la carte a eu le temps d'arriver.

**Pourquoi natif seulement.** `-webkit-app-region` n'a de sens que pour une fenêtre sans cadre, et les quatre blocs sont préfixés `html[data-desktop-app]` ([:1684](app/globals.css), [:1710](app/globals.css), [:1739](app/globals.css), [:1778](app/globals.css)). L'attribut n'est posé que par [components/desktop-chrome.tsx:24-26](components/desktop-chrome.tsx), et uniquement si `getDesktopBridge()` est non nul. Dans Chrome il n'y a **aucune** carte, aucun arbitrage, aucun retard possible.

**Le correctif — et pourquoi il n'est pas à faire à l'aveugle.** Retirer les deux prises `drag` posées sur des rectangles **animés** ([:1739-1740](app/globals.css) et le `-webkit-app-region: drag` de [:1782](app/globals.css), en gardant `container-type: inline-size` qui porte le glissement) : la bande fixe couvre déjà exactement les mêmes 60 px avec un rectangle qui ne bouge jamais. Ça, c'est sûr. Alléger le creusement global, en revanche, défait l'invariant que le commentaire [:1699-1709](app/globals.css) décrit comme la raison d'être de la règle — « rien d'interactif dans les 60 px ne devient une poignée de fenêtre ». Voir le §4.

#### B2 — `SidebarRow` change le TYPE de son élément racine avec `collapsed` : chaque bascule du rail détruit et recrée les lignes

**Le mécanisme.** `row` est un `MotionLink` ([components/app-sidebar.tsx:273-286](components/app-sidebar.tsx)) ou un `motion.button` ([:288-300](components/app-sidebar.tsx)), et il est **enveloppé** dans `<Tooltip><TooltipTrigger asChild>…` seulement `if (collapsed || item.shortcut)` ([:303-322](components/app-sidebar.tsx)). Pour toute ligne **sans** `shortcut` — les entrées de projet, les sections — le type de l'élément rendu à cette position passe donc de `MotionLink` à `Tooltip` et retour à chaque bascule du rail. React ne réconcilie pas deux types différents : il démonte le sous-arbre et en monte un neuf. **Le nœud DOM est remplacé, et le focus qu'il portait retombe sur `<body>`.**

**La condition, et sa limite.** Il faut que le rail bascule alors qu'une ligne sans raccourci porte le focus ou une surface. Le cas réel et vérifiable : on **clique** une entrée de projet — `onFocusCapture` ne pose `focusWithin` que sur `:focus-visible` ([:826-839](components/app-sidebar.tsx)), donc la ligne a le focus mais la barre ne le retient pas ; le pointeur part, 150 ms plus tard `hovered` tombe ([:750](components/app-sidebar.tsx)), `collapsed` bascule ([:753](components/app-sidebar.tsx)) et la ligne focalisée est remplacée. La tabulation repart du haut du document.

**Ce qu'il faut lui retirer.** Le scénario d'oscillation double (le remontage provoquant un `focusout` qui rebascule `collapsed`) **n'est pas atteignable** : tant que `focusWithin` est vrai, `collapsed` est faux ([:753](components/app-sidebar.tsx)), donc le remontage ne peut pas survenir avec le focus retenu ; et quand il survient, `setFocusWithin(false)` est un no-op. Et ce mécanisme **n'est pas natif seulement** : il se produit identiquement dans un navigateur. Ce que la coquille ajoute est un troisième pilote de `collapsed` (`useHoldWindowButtons("rail", wide && collapsed)`, [:780](components/app-sidebar.tsx)) et un rendu supplémentaire de toute la barre une macrotâche plus tard, quand l'IPC répond. Il est ici parce qu'il est **le seul mécanisme vérifié du dépôt qui produise littéralement montage→démontage→montage d'une surface**, et parce que son correctif est gratuit.

**Le correctif.** Rendre le `<Tooltip>` inconditionnellement et ne faire varier que son ouverture :

```tsx
// components/app-sidebar.tsx:303 — structure stable : le nœud de la ligne
// n'est plus jamais remplacé, et le focus clavier survit au dépliage.
row = (
  <Tooltip
    delayDuration={TOOLTIP_DELAY_MS}
    disableHoverableContent
    open={collapsed || item.shortcut ? undefined : false}
  >
    <TooltipTrigger asChild>{row}</TooltipTrigger>
    <TooltipContent side="right" className="flex items-center gap-2">…</TooltipContent>
  </Tooltip>
);
```

Et durcir `onBlurCapture` ([:840-848](components/app-sidebar.tsx)) : `if (e.relatedTarget === null) return;` — une perte de focus qui ne désigne aucune nouvelle cible n'est pas une sortie de la barre, c'est aussi ce que produit la désactivation de la fenêtre par la barre de menus macOS.

#### B3 — `settling` est dégelé par n'importe quel message du pont, pas par la réponse qu'il attend

**Le mécanisme.** `settling` est le drapeau « la fermeture du dialogue est encore digérée par le main process » ([lib/use-window-buttons.ts:281-289](lib/use-window-buttons.ts)), posé pendant le rendu ([:302-305](lib/use-window-buttons.ts)) et effacé en un seul endroit : le gestionnaire d'abonnement, qui fait `setVisible(next); setSettling(false); setStarted(true)` sur **tout** message `minddy:window-buttons-state` ([:319-323](lib/use-window-buttons.ts)), sans vérifier que c'est bien la réponse au relâchement qu'on attend. Or le canal porte **cinq producteurs**, tous asynchrones : la réponse à toute demande ([desktop/src/main.ts:84](desktop/src/main.ts)), la rediffusion du cache sur `minddy:window-buttons-ready` ([:359](desktop/src/main.ts) → [:88-91](desktop/src/main.ts), un `webContents.send` qui arrose **tous** les `ipcRenderer.on` du document, donc les voisins du nouvel abonné), `did-start-navigation` ([:303-307](desktop/src/main.ts)) et les quatre événements plein écran ([:313-320](desktop/src/main.ts)). Un message de trop, arrivé au mauvais moment, dégèle la mise en page un aller-retour trop tôt : `reserved` retombe sur `visible` ([lib/use-window-buttons.ts:348](lib/use-window-buttons.ts)), la place se referme, et l'effet [:310-312](lib/use-window-buttons.ts) empoisonne au passage la valeur gelée.

**Ce que ce constat ne peut PAS expliquer, et il faut le dire.** Un popover n'entre **pas** dans `MODAL_SELECTOR` ([:136-144](lib/use-window-buttons.ts)), et c'est délibéré : le commentaire [:132-134](lib/use-window-buttons.ts) écarte explicitement `role="dialog"` sans `aria-modal` « et les boutons clignoteraient à chaque menu ouvert ». Un popover ne fait jamais basculer `modal`, donc ne peut pas déclencher ce mécanisme. Il n'explique que le sursaut de la **ligne de marque** — et encore : sur les pages à barre secondaire (celles où le rail existe, donc celles du symptôme (a)), la transition de 320 ms est **désarmée** par `:not([data-rail])` ([app/globals.css:1802-1806](app/globals.css), `data-rail` posé par [components/app-sidebar.tsx:888](components/app-sidebar.tsx)) : la marque se téléporte au lieu de glisser. Et le calage de 68 px de `HeaderWindowButtonsSlot` ([components/desktop-window-buttons.tsx:110-123](components/desktop-window-buttons.tsx)) ne rend **rien du tout** au-dessus de 1200 px, c'est-à-dire jamais sur une fenêtre par défaut de 1280 ([desktop/src/main.ts:228](desktop/src/main.ts)).

**Ce qui reste, et pourquoi je le garde.** Le trou de conception est authentique : un accusé de réception qui n'identifie pas ce qu'il acquitte, dans un protocole à cinq producteurs. Il a une **deuxième victime, non décorative** : `windowButtons.reserved` est lu par `leavesThroughWindowButtons` ([components/app-sidebar.tsx:719-720](components/app-sidebar.tsx)) ; un `pointerleave` qui tombe dans la fenêtre transitoire voit `reserved === false`, la sortie par le coin haut-gauche n'est plus reconnue, et le rail se referme sous un pointeur qui allait cliquer les feux — le défaut que MIN-291 a fermé, ressuscité par intermittence.

**Le correctif.** Un numéro de séquence : un compteur incrémenté à chaque `applyWindowButtons` déclenché par un `minddy:window-buttons`, porté par le message, et `setSettling(false)` **seulement** sur un numéro strictement supérieur à celui de la demande émise par `pushToBridge` ; `setVisible` reste inconditionnel. Et faire de `minddy:window-buttons-ready` une réponse **ciblée** (`event.sender.send(...)` à [desktop/src/main.ts:359](desktop/src/main.ts)) plutôt qu'une diffusion. ⚠ **Ne pas retenir la « variante sans toucher au protocole »** (ne dégeler que sur un message dont la valeur diffère) : elle latche `settling` à `true` dans le cas exact que [lib/use-window-buttons.ts:50-55](lib/use-window-buttons.ts) documente comme réel — rail replié, un dialogue s'ouvre et se ferme, la demande relâchée republie `false`, valeur identique, jamais de dégel. On échangerait une course rare contre un état latché déterministe.

---

### C. Trouvé en chemin, n'explique aucun des deux symptômes

**Le document mourant retire les boutons pour le document suivant, qui n'a personne pour les redemander.** `wantsWindowButtons` est une variable du **main** ([desktop/src/main.ts:54](desktop/src/main.ts)) qui survit aux documents ; `holds` est un module de la **page** ([lib/use-window-buttons.ts:29](lib/use-window-buttons.ts)) qui meurt avec elle. `did-start-navigation` remet `wantsWindowButtons = true` et publie ([desktop/src/main.ts:303-307](desktop/src/main.ts)) — mais il tire au **début** de la navigation, donc le message part à l'ancien document, encore vivant. Si une raison y est posée, son `watchContradiction` ([lib/use-window-buttons.ts:110-116](lib/use-window-buttons.ts)) pousse `false` pendant l'aller-retour réseau, et le nouveau document démarre `holds` vide sans jamais rien pousser (`useHoldWindowButtons` sort sur `if (!active) return`, [:73-84](lib/use-window-buttons.ts)). **Les feux macOS restent absents.** Trois portes d'entrée seulement : le `loadURL` de démarrage (pas d'ancien document), `minddy://open?next=…` ([:122](desktop/src/main.ts)) et `goHome` ([:185](desktop/src/main.ts) et [:213](desktop/src/main.ts)) — il n'y a pas de rechargement clavier ([desktop/src/menu.ts:66-70](desktop/src/menu.ts)). Le geste réparateur n'est d'ailleurs pas celui qu'on croit : `goHome` charge `/home` ([lib/desktop/config.ts:33](lib/desktop/config.ts)), une page sans barre secondaire, donc sans mode rail à déplier — ce qui répare est un cycle de raison, en pratique ouvrir puis fermer la palette ⌘K. **Une fenêtre sans feux est une fenêtre qu'on ne peut plus fermer ni réduire à la souris** : à corriger, même si ce n'est pas la question de cette passe. Le correctif est un `pushToBridge()` inconditionnel dans un effet de montage, posé au **layout racine** ou dans [components/desktop-chrome.tsx](components/desktop-chrome.tsx) (pas dans `DesktopWindowButtons`, monté seulement sous [app/(app)/app-providers.tsx:99](<app/(app)/app-providers.tsx>), donc absent de login, `/f/`, `/p/`, not-found).

**Le guetteur de retour de pointeur reste armé sans limite.** `closeRail(e)` ne referme pas quand le pointeur sort par le coin haut-gauche : il appelle `watchPointerReturn()` et retourne ([components/app-sidebar.tsx:744-748](components/app-sidebar.tsx)), lequel pose un `document.addEventListener("pointermove", onMove, { once: true })` et **rien d'autre** — aucun délai, aucune borne ([:730-742](components/app-sidebar.tsx)), et `openRail` ne le désarme pas ([:696-702](components/app-sidebar.tsx)). Le rail peut donc rester déplié par-dessus la barre secondaire pendant une séquence entièrement au clavier, et se refermer au premier mouvement de souris, des minutes plus tard. Le cas le plus net : sortir du rail déplié par le coin haut-gauche, c'est exactement le trajet pour cliquer le feu rouge — qui **cache** la fenêtre ; elle est donc rangée rail déplié, et rouverte telle quelle. Strictement natif : `leavesThroughWindowButtons` exige `windowButtons.reserved`, qui vaut constamment `false` hors coquille (`settling` reste `true` à vie, `frozen.current` n'est jamais écrit — [lib/use-window-buttons.ts:300](lib/use-window-buttons.ts), [:310-312](lib/use-window-buttons.ts), [:348](lib/use-window-buttons.ts)). Mais l'utilisateur aurait décrit ça « la barre reste ouverte », pas « ça stutter ». Correctif : désarmer dans `openRail`, et brancher le repli de secours sur `window.addEventListener("blur")` et sur `visibilitychange` avec `document.hidden` — **pas** sur un minuteur, qui rouvrirait le bug que MIN-291 a fermé.

---

## 3. Comment le prendre sur le fait

Le défaut ne se reproduit pas à la demande. **Une session de profilage ne le trouvera jamais** : le temps d'ouvrir DevTools et d'appuyer sur Enregistrer, il est passé. Il faut donc une instrumentation qui **tourne en permanence, garde une trace, et se fige sur commande** — le geste de l'utilisateur n'étant plus « reproduire » mais « je viens de le voir, dump ».

### 3.1 Le tampon tournant dans le renderer, vidé au presse-papier par un raccourci

C'est l'instrument principal, et il tranche à lui seul entre les deux symptômes : le journal dira si le popover a été **démonté** (React) ou seulement **fermé** (état), et si une frame longue l'a précédé.

Où le mettre : **`lib/desktop/trace.ts`**, monté depuis [components/desktop-chrome.tsx](components/desktop-chrome.tsx) (le composant qui pose déjà `data-desktop-app`, donc celui qui garantit qu'on n'instrumente pas le web). Comment l'éteindre : il ne s'allume que si `localStorage.getItem("minddy.trace") === "1"`, ce qui se met et se retire depuis la console sans redéployer.

```ts
// lib/desktop/trace.ts — instrument de MIN-29x. Off par défaut.
// Allumer : localStorage.setItem("minddy.trace","1") puis recharger.
// Vider   : ⌥⌘0 — les 90 dernières secondes partent au presse-papier.
export function startDesktopTrace(): () => void {
  if (localStorage.getItem("minddy.trace") !== "1") return () => {};

  const ring: string[] = [];
  const t0 = performance.now();
  const log = (kind: string, detail: Record<string, unknown> = {}) => {
    ring.push(`${(performance.now() - t0).toFixed(1)} ${kind} ${JSON.stringify(detail)}`);
    if (ring.length > 4000) ring.shift();
  };

  // (a) Frames longues. C'est le symptôme (a), mesuré.
  const longtask = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) log("longtask", { ms: Math.round(e.duration) });
  });
  longtask.observe({ type: "longtask", buffered: true });

  // (b) Latence d'entrée. Un pointerdown dont le `processingStart` arrive
  //     100 ms après le geste, c'est une frame perdue AVANT la logique ;
  //     un pointerdown qui n'apparaît JAMAIS, c'est macOS qui l'a avalé (B1).
  const evt = new PerformanceObserver((l) => {
    for (const e of l.getEntries() as PerformanceEventTiming[]) {
      log("event", {
        name: e.name,
        delay: Math.round(e.processingStart - e.startTime),
        dur: Math.round(e.duration),
      });
    }
  });
  evt.observe({ type: "event", durationThreshold: 16 });

  // (c) LA question du symptôme (b) : la surface a-t-elle été DÉMONTÉE ?
  //     Radix portalise ses poppers en enfants directs de <body>.
  const SURF = '[data-radix-popper-content-wrapper],[data-slot$="-content"],[cmdk-root]';
  const surfaces = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes)
        if (n instanceof Element && n.matches?.(SURF)) log("surface+", { id: n.getAttribute("id") });
      for (const n of r.removedNodes)
        if (n instanceof Element && n.matches?.(SURF)) log("surface-", { id: n.getAttribute("id") });
    }
  });
  surfaces.observe(document.body, { childList: true });

  // (d) L'état de fenêtre, et la durée de l'absence — la condition de A1/A3.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = performance.now(); log("hidden"); }
    else log("visible", { awayMs: Math.round(performance.now() - hiddenAt) });
  });
  window.addEventListener("blur", () => log("win-blur"));
  window.addEventListener("focus", () => log("win-focus"));

  // (e) Le pont, côté page : ce qu'on demande et ce qui revient.
  //     À poser DANS pushToBridge et dans l'abonnement de useWindowButtonsSlot
  //     (lib/use-window-buttons.ts:57-63 et :319-323) via window.__minddyTrace.
  (window as any).__minddyTrace = log;

  const dump = (e: KeyboardEvent) => {
    if (!(e.altKey && e.metaKey && e.code === "Digit0")) return;
    const text = ring.join("\n");
    void navigator.clipboard.writeText(text);   // clipboard-sanitized-write
    console.log(text);                          // et dans la console, au cas où
  };
  window.addEventListener("keydown", dump);

  return () => {
    longtask.disconnect(); evt.disconnect(); surfaces.disconnect();
    window.removeEventListener("keydown", dump);
  };
}
```

Deux instrumentations d'une ligne à poser en même temps, sinon la trace ne dit pas grand-chose :

```ts
// lib/realtime-provider.tsx:620, en tête de catchUp
(window as any).__minddyTrace?.("catchUp", { n: keys.length, cache: queryClient.getQueryCache().getAll().length });

// lib/use-window-buttons.ts:59 (émission) et :320 (réception)
(window as any).__minddyTrace?.("bridge>", { visible: holds.size === 0 });
(window as any).__minddyTrace?.("bridge<", { next, settling, modal });
```

**Ce qu'on lit dans le dump.** Le symptôme (b) se lit sur trois lignes consécutives : `surface+` … `surface-` … `surface+` à moins de 200 ms d'écart. Si un `longtask` de plus de 50 ms les sépare, c'est une frame perdue et le symptôme est en fait (a). S'il n'y a **rien** entre les deux, c'est une bascule d'état — et la ligne juste avant dit laquelle (`bridge<`, `catchUp`, `visible`). Le symptôme (a) se lit sur une ligne `catchUp` suivie d'un `longtask` : le champ `cache` dit combien de requêtes ont été parcourues, et sa croissance d'un jour à l'autre est la preuve de A1. Un `event` avec `delay` élevé sans `longtask` en face pointe vers le process navigateur (§3.2). Un `pointerdown` qui manque à l'appel alors qu'on a bien cliqué, c'est B1.

### 3.2 Le journal du pont côté main, avec les horloges des deux process

Le renderer ne voit pas ce que fait le process navigateur. Un `console.log` dans le main sort sur le stdout du terminal qui a lancé la coquille (et dans `Console.app` pour l'app installée) : c'est suffisant, et ça survit à tout.

```ts
// desktop/src/main.ts, en tête de applyWindowButtons (l.59) et de publishWindowButtons (l.88)
const T0 = Date.now();
const trace = (kind: string, d: unknown = {}) =>
  process.env.MINDDY_TRACE && console.log(`[trace] ${Date.now() - T0} ${kind}`, d);
```

À poser sur quatre points, pas plus : `applyWindowButtons` (avec `wantsWindowButtons` et `isFullScreen()`), `publishWindowButtons` (avec la valeur), `did-start-navigation` ([:303](desktop/src/main.ts)), et les trois `show()` ([:363](desktop/src/main.ts), [:502](desktop/src/main.ts), [:562](desktop/src/main.ts)). Ajouter les deux événements de fenêtre que la page ne peut pas connaître et qui disent l'état d'occlusion et de veille :

```ts
window.on("show",  () => trace("win:show",  { visible: window.isVisible() }));
window.on("hide",  () => trace("win:hide"));
window.on("blur",  () => trace("win:blur"));
// La veille et le verrouillage d'écran : la cause la plus fréquente de A2.
powerMonitor.on("suspend",     () => trace("power:suspend"));
powerMonitor.on("resume",      () => trace("power:resume"));
powerMonitor.on("lock-screen", () => trace("power:lock"));
```

**La signature de C (les feux perdus)** : deux lignes `applyWindowButtons` à quelques millisecondes l'une de l'autre juste après `did-start-navigation`, la première à `true`, la seconde à `false` — la seconde est le message du document mort. Sans ce journal on ne peut pas la distinguer d'un oubli de la page.

### 3.3 La démonstration de B3, en trente secondes

Le défaut ne se reproduit pas à la main parce que l'aller-retour IPC vaut 2 à 4 ms au repos. **On élargit la fenêtre de course** : envelopper l'appel `publishWindowButtons(...)` de [desktop/src/main.ts:84](desktop/src/main.ts) dans un `setTimeout(..., 250)`, puis ouvrir et refermer un dialogue rapidement. Si le sursaut devient systématique et disparaît en retirant le `setTimeout`, le mécanisme est démontré. **C'est la démonstration, pas le correctif** — le budget réel à battre est de ~200 ms, pas 100 : `modalOpen` suit la présence du nœud dans le DOM ([lib/use-window-buttons.ts:162-167](lib/use-window-buttons.ts)) et le voile Radix reste monté jusqu'à `animationend` (`duration-100 data-closed:animate-out`, `node_modules/mangue-ui/src/components/ui/dialog.tsx:89`).

### 3.4 L'A/B qui disculpe B1 en une minute

Dans l'inspecteur de la fenêtre Electron (`--remote-debugging-port=9222`, recette au §5 de la première passe), retirer l'attribut `data-desktop-app` de `<html>` : les quatre blocs de [app/globals.css:1684-1810](app/globals.css) tombent d'un coup, la fenêtre devient immobile le temps du test. Refaire alors le geste fautif — frôler le rail d'un bord à l'autre et cliquer immédiatement dans l'en-tête, cent fois — avec le compteur `event` de §3.1 allumé. Si le nombre de `pointerdown` enregistrés rejoint enfin le nombre de clics effectués, B1 est démontré. ⚠ Un seul process lourd à la fois sur ce Mac.

### 3.5 La ligne à mesurer avant de croire A1

Une commande dans la console, deux fois : au lancement de l'app, puis le soir.

```js
queryClient.getQueryCache().getAll().length   // N, le multiplicande
localStorage.getItem("minddy.query-cache")?.length
```

Si N ne bouge pas d'un facteur significatif sur une journée, A1 perd sa moitié « accumulation » et redescend d'un cran.

---

## 4. Le plan

### (a) À faire à l'aveugle — le correctif est bon de toute façon

1. **`catchUp` en un seul parcours** ([lib/realtime-provider.tsx:620-631](lib/realtime-provider.tsx)), via `invalidateQueries({ predicate })`. Couverture identique, actives et inactives comprises. Ferme A1 et prépare A2.
2. **Coalescer les rattrapages par canal** ([:664-677](lib/realtime-provider.tsx)) dans une file au niveau du provider, **séparée** de `timers`. Ferme A2.
3. **Plancher de durée sur `shouldCatchUpOnResume`** ([lib/realtime-resume.ts:55](lib/realtime-resume.ts)) : une socket momentanément déconnectée pendant un backoff ne justifie pas une invalidation de tous les périmètres. Ça ne creuse aucun trou de fraîcheur — un canal tombé puis rejoint rattrape déjà son propre périmètre ([lib/realtime-provider.tsx:664-669](lib/realtime-provider.tsx)) — mais **l'écrire dans le commentaire**, sinon le prochain lecteur le défera.
4. **Numéro de séquence sur le protocole des boutons** ([lib/use-window-buttons.ts:319-323](lib/use-window-buttons.ts)) et **réponse ciblée** à `minddy:window-buttons-ready` ([desktop/src/main.ts:359](desktop/src/main.ts)). Ferme B3 et sa deuxième victime.
5. **`pushToBridge()` inconditionnel au montage**, au niveau du layout racine, plus `appliedButtons = null` dans `did-start-navigation` si l'on fait la déduplication native de C3 (première passe). Ferme C. Vérifiable en une commande : `open 'minddy://open?next=/'` rail replié.
6. **`SidebarRow` : `<Tooltip>` inconditionnel** ([components/app-sidebar.tsx:303](components/app-sidebar.tsx)) + garde `relatedTarget === null` sur `onBlurCapture` ([:840](components/app-sidebar.tsx)). Ferme B2, et corrige au passage une perte de focus clavier après chaque clic dans la barre.
7. **Désarmer `watchPointerReturn` dans `openRail`** et brancher le repli de secours sur `blur` / `visibilitychange`, jamais sur un minuteur ([:696-702](components/app-sidebar.tsx), [:730-742](components/app-sidebar.tsx)).
8. **Les deux prises `drag` posées sur des rectangles animés** ([app/globals.css:1739-1740](app/globals.css) et [:1782](app/globals.css)) : la bande fixe couvre déjà les mêmes 60 px avec un rectangle qui ne bouge jamais. C'est la moitié sûre de B1.
9. **Poser l'instrumentation du §3**, éteinte par défaut. C'est ce qui rend la suite possible.

Chacun est indépendant. Aucun ne demande de mesure préalable. **Aucun n'est garanti fermer le symptôme** — c'est la différence honnête avec la première passe.

### (b) À faire seulement avec une trace

- **Alléger le creusement `no-drag` global** ([app/globals.css:1710-1731](app/globals.css)) — la seconde moitié de B1. Le correctif change un invariant de sécurité du produit que le commentaire [:1699-1709](app/globals.css) décrit noir sur blanc, et qui a été payé par l'audit de MIN-292 sur six écrans. Il faut d'abord que §3.4 ait montré des `pointerdown` manquants.
- **A3, la purge de la fenêtre cachée.** Rien à corriger tant que §3.1 (d) n'a pas montré un `longtask` systématiquement plus gros après une absence longue qu'après une absence courte. Et le seul « correctif » évident — faire vraiment fermer le feu rouge — est hors de question : il tuerait les notifications de bureau.
- **La deuxième pesée de A1** : si §3.5 montre un `N` qui ne croît pas, le geste (a).1 reste bon mais son gain est petit, et la piste se déplace.

---

## 5. Ce qui a été écarté

### Faux — le code dit le contraire

- **« `backgroundThrottling` laisse mourir la socket en arrière-plan. »** [desktop/src/main.ts:272-275](desktop/src/main.ts) consigne une sonde (MIN-290) qui a **mesuré** la WebSocket Supabase survivant sept minutes en arrière-plan avec l'étranglement actif. Écrire l'inverse sans nouvelle mesure, c'est défaire un réglage sur une supposition.
- **« Le rattrapage temps réel fait clignoter des surfaces en basculant des états de chargement. »** `catchUp` invalide des queries qui **ont** leur donnée : en react-query v5, `isPending` reste faux, seul `isFetching` bascule. Et le dépôt **impose** que l'UI de chargement se lise sur `isPending` ([lib/query-loading.test.ts](lib/query-loading.test.ts), qui parcourt `app/`, `components/` et `lib/`). Un grep sur tout le dépôt ne rend que deux usages de `isFetching`, dont un seul en rendu ([components/feedback/feedback-participants-group.tsx:124](components/feedback/feedback-participants-group.tsx)), hors board. Rien ne se démonte par ce chemin. Il reste du travail réseau superflu — un vrai gaspillage, pas le symptôme.
- **« Le gel/dégel des boutons fait clignoter les popovers. »** Un popover est **délibérément** hors de `MODAL_SELECTOR` ([lib/use-window-buttons.ts:132-144](lib/use-window-buttons.ts)) : il ne pose aucune raison et ne fait jamais basculer `modal`.
- **« Le repli du rail déplace l'ancre de toute surface flottante. »** En mode overlay — le seul où le rail existe — `flowWidth` reste constant à `COLLAPSED_WIDTH` ([components/app-sidebar.tsx:793](components/app-sidebar.tsx)) et l'`aside` est `absolute … z-40` ([:854](components/app-sidebar.tsx)) : **rien** hors de la barre ne bouge pendant le repli. Le commentaire [:783-792](components/app-sidebar.tsx) le dit déjà.
- **« La marque part en translation de 320 ms à chaque bascule. »** La règle est `[data-window-buttons-ready]:not([data-rail])` ([app/globals.css:1802-1806](app/globals.css)) et `data-rail` est posé dès que la barre est en mode rail ou en zen ([components/app-sidebar.tsx:888](components/app-sidebar.tsx)) : sur les pages à barre secondaire, la transition est **désarmée**.
- **Tout ce qui repose sur le calage de 68 px de l'en-tête.** `HeaderWindowButtonsSlot` ne rend quelque chose que **sous** 1200 px ([components/desktop-window-buttons.tsx:110-112](components/desktop-window-buttons.tsx), [lib/use-window-buttons.ts:213](lib/use-window-buttons.ts)). La fenêtre par défaut fait 1280 ([desktop/src/main.ts:228](desktop/src/main.ts)). Sur ce poste, ce chemin est mort.
- **« Le rail se refermerait deux fois de suite par perte de focus. »** Tant que `focusWithin` est vrai, `collapsed` est faux ([components/app-sidebar.tsx:753](components/app-sidebar.tsx)) : l'oscillation décrite n'est pas atteignable. Le remontage de B2 est réel, sa boucle ne l'est pas.
- **« Ajouter un `pointerdown` sur `document` pour désarmer le guetteur du rail. »** Les feux sont **natifs** : un clic dessus n'émet aucun `pointerdown` dans la page ([components/app-sidebar.tsx:705-711](components/app-sidebar.tsx) le dit lui-même), et un `pointerdown` ailleurs est toujours précédé d'un `pointermove`. L'écouteur n'ajoute rien.

### Vrai, mais **constant** — donc hors sujet ici

Tous ces défauts existent, tous méritent leur correctif, **aucun** ne peut expliquer un symptôme rare : ils se paient à chaque geste ou à chaque frame, et le témoignage dit que le régime permanent est identique au navigateur.

- **Le creusement `no-drag` global** ([app/globals.css:1710-1731](app/globals.css)) — la thèse principale de la première passe. Un coût proportionnel au nombre d'éléments, payé à chaque layout : il se sentirait tout le temps. Seule sa **fraîcheur** (B1) reste dans la course, et c'est un mécanisme différent.
- **Les 20 dropdowns Radix laissés en `modal`** (C1) : `body{pointer-events:none}` à chaque ouverture *et* fermeture. Se reproduit à 100 %, à la demande.
- **Le board non mémoïsé** (P2), **`updateActiveColumn`** (C5), **les trois contextes non mémoïsés** (C6), **les voiles `backdrop-filter`** (P3), **le masque sur les scrollers** (P7), **la boucle du lasso** (P8), **`spellcheck: true`** (P6). Amplificateurs, pas déclencheurs.
- **`applyWindowButtons` qui repose les boutons sans comparer** (C3, [desktop/src/main.ts:71-78](desktop/src/main.ts)) : coûteux à chaque survol du rail, donc reproductible à volonté. À corriger, mais ce n'est pas ça.

### Vrai, natif, mais trop rare pour ce symptôme

- **L'auto-updater** ([desktop/src/updater.ts:51](desktop/src/updater.ts), `autoDownload = true`, contrôle toutes les six heures) : le contrôle est un GET de YAML, négligeable ; le téléchargement bloquerait bien le process navigateur, mais la coquille bouge « deux fois par an » ([:9-10](desktop/src/updater.ts)). Une fréquence de l'ordre de l'année ne produit pas « assez fréquent pour être gênant à l'usage ».
- **`setBadgeCount`** ([lib/use-desktop-notifications.ts:48-51](lib/use-desktop-notifications.ts)) : un appel AppKit sur le thread UI du process navigateur, mais gardé par `[unreadCount]`, donc uniquement quand le chiffre change réellement.