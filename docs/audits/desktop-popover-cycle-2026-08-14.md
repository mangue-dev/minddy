# Troisième passe — le popover qui s'ouvre, se referme et s'ouvre

App de bureau minddy (Electron 43 / macOS). Ne traite QUE ce symptôme-là.
Complète `docs/audits/desktop-perf-2026-08-14.md` et `docs/audits/desktop-perf-intermittent-2026-08-14.md`.

**Verdict, en tête : je n'ai pas de chaîne complète.** Ce que cette passe apporte, et qui n'était dans aucune des deux précédentes :

1. **L'horloge n'est pas une constante du dépôt.** Depuis `@radix-ui/react-popover@1.1.19`, la fermeture d'un popover par clic extérieur a été DÉPLACÉE de `pointerdown` à `click` — elle tombe donc au relâchement, pas à l'appui. L'écart mesuré par l'utilisateur, « à peine 100 ms », est sa propre durée d'appui, et c'est la seule horloge du système qui soit à la fois dans la bonne fourchette et **variable**.
2. Ce déplacement crée une **inversion d'ordre** vérifiable, dont le dépôt a une victime nommée : les surfaces dont l'`open` vit dans un état à créneau unique.
3. Un **mécanisme de démontage neuf, avec une vraie détente** — les deux passes précédentes n'avaient trouvé que des fusils chargés sans détente.
4. Le maillon qui manque, nommé : **aucun chemin du dépôt ne repose `open` à vrai dans les 100 ms.** Les deux familles ci-dessous ferment ; aucune ne rouvre toute seule.

---

## 1. La chaîne la moins incomplète

**Le geste.** Un picker de champ est ouvert. On clique la pastille du champ d'à côté sans avoir refermé le premier.

**Maillon 1 — la fermeture extérieure est différée jusqu'au relâchement.**
`@radix-ui/react-popover@1.1.19` passe `deferPointerDownOutside: true` à sa couche de renvoi (`…/react-popover/dist/index.mjs:239`). Sa dépendance épinglée est `@radix-ui/react-dismissable-layer@1.1.15` (`react-popover/package.json:19`), qui implémente l'option ainsi (`…/react-dismissable-layer/dist/index.mjs:260-267`) : bouton gauche → on n'émet plus `pointerDownOutside` à l'appui, on enregistre un écouteur `click` à usage unique sur `document`. **Le popover ne se ferme donc plus qu'au `click`.**

**Maillon 2 — React dispatche AVANT Radix, et c'est vérifiable.**
Next monte l'application sur le document entier : `const appElement = document` (`node_modules/next/dist/client/app-index.js:33`, `hydrateRoot(appElement, …)` :302). Les écouteurs délégués de React sont donc posés sur `document` **à l'hydratation**. Celui de Radix est posé sur `document` **au `pointerdown`**, donc plus tard. À `click`, React passe le premier.

**Maillon 3 — la seconde pastille s'ouvre.**
`PopoverTrigger` compose `onOpenToggle` sur son `onClick` (`react-popover/dist/index.mjs:96`). Dans le dialogue de création, l'ouverture est un créneau UNIQUE : `const [openPicker, setOpenPicker] = useState<ShortcutField | null>(null)` (`components/create-issue-dialog.tsx:158`), lu par sept pickers (`:671-734`). Le toggle appelle donc `onOpenChange(true)` → `setOpenPicker("priority")` (`:683`). **B est ouvert, commité.**

**Maillon 4 — puis le premier se ferme, et il emporte le second.**
L'écouteur `click` de Radix suit. Le garde-fou de `PopoverContentNonModal` ne protège que le déclencheur DU MÊME popover : `const targetIsTrigger = context.triggerRef.current?.contains(target); if (targetIsTrigger) event.preventDefault();` (`react-popover/dist/index.mjs:193-195`). La cible est le déclencheur de B, pas celui de A → pas de `preventDefault` → `onDismiss()` → `onOpenChange(false)` de A → **`setOpenPicker(null)` (`create-issue-dialog.tsx:672`) — B se referme.**

**Ce qui ferme** : le renvoi différé de A, qui écrit dans le créneau partagé que B venait d'occuper.
**Ce qui rouvre** : ⚠️ **le second clic de l'utilisateur, et rien d'autre.** C'est le maillon manquant. Les deux mutations tombent dans la même tâche `click` ; le navigateur ne peint pas entre les deux, donc l'apparition de B est probablement **invisible**, et ce que l'utilisateur voit alors n'est pas un clignotement mais « ça ne s'ouvre pas ». Si son témoignage décrit trois états VISIBLES, cette chaîne n'est pas la sienne — et la recette ci-dessous le dit en trente secondes.

**Ce qu'elle échoue** : elle est identique dans Chrome. Le filtre « ça n'existait pas dans le navigateur » n'est pas franchi.

---

## 2. La recette de reproduction

Trois gestes. Le premier donne l'étalon, les deux autres discriminent. Rien à compiler.

### A. L'étalon de signature (10 s) — à faire EN PREMIER

1. Ouvrir n'importe quel picker (pastille de statut d'une carte).
2. Le fermer par `Échap`. **Regarder la sortie** : la surface rétrécit et pâlit sur 100 ms (`duration-100 … data-closed:animate-out`, `node_modules/mangue-ui/src/components/ui/popover.tsx:39`).
3. Comparer de mémoire au clignotement observé.

- **Sortie visible dans le clignotement** → famille FERMETURE : un `open` bascule. → geste B.
- **Effacement sec, sans rétrécissement, puis fondu d'entrée** → famille DÉMONTAGE : le `Popover` racine a été détruit, la `Presence` de Radix avec lui. → geste C.

Cette distinction élimine la moitié du champ en dix secondes, et aucune des deux passes précédentes ne l'avait mise entre les mains de l'utilisateur.

### B. Déclencher la chaîne du §1 (20 s)

1. `⌘N` — dialogue « Nouveau ticket ».
2. Cliquer la pastille **Statut** : la liste s'ouvre.
3. **Sans rien refermer**, cliquer la pastille **Priorité** juste à côté.

- **Si la chaîne est la bonne** : rien ne reste ouvert. Il faut re-cliquer Priorité pour l'avoir.
- **Sinon** : la liste des statuts se ferme, celle des priorités reste ouverte. Comportement normal, chaîne écartée.

4. **Le geste qui prouve l'horloge** : refaire l'étape 3 en **maintenant le bouton enfoncé une demi-seconde** avant de relâcher sur la pastille Priorité. Si la liste des statuts ne disparaît qu'au **relâchement**, `deferPointerDownOutside` est actif et l'horloge du défaut est la durée d'appui — pas une constante du code. C'est le seul essai du rapport qui mesure quelque chose sans instrument.

### C. Déclencher le démontage (§3, chaîne A)

1. Sur un board, lancer un agent sur un ticket : le halo animé apparaît sur sa carte.
2. Ouvrir un picker de champ **sur cette carte-là** (clic sur la pastille de statut, ou `S` en survol).
3. Ne rien toucher, et attendre que le halo s'éteigne (fin du run, ou un sondage en échec — il tombe toutes les 4 s).

- **Si la chaîne est la bonne** : au moment exact où le halo s'éteint, le picker **s'efface d'un coup**, sans animation de sortie.
- **Sinon** : le picker reste ouvert pendant que le halo s'éteint.

### D. La sonde à laisser tourner (le défaut ne vient pas quand on l'appelle)

Quitter l'app (`⌘Q`), la relancer depuis le Terminal — le verrou d'instance unique fait qu'un drapeau ajouté à une app déjà ouverte ne sert à rien :

```
/Applications/Minddy.app/Contents/MacOS/Minddy --remote-debugging-port=9222
```

puis `http://localhost:9222` dans Chrome, et dans la console du renderer :

```js
window.__log = []; const t0 = performance.now();
const log = (s) => { const l = `${(performance.now()-t0).toFixed(0)} ${s}`; window.__log.push(l); console.log(l); };
// famille FERMETURE : data-state bascule, le nœud NE quitte PAS le DOM
new MutationObserver(rs => { for (const r of rs) { const el = r.target;
  if (!(el instanceof Element)) continue;
  const slot = el.getAttribute("data-slot");
  if (!slot || !slot.endsWith("-content")) continue;
  log(`state ${slot} ${r.oldValue}→${el.getAttribute("data-state")}`);
}}).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["data-state"] });
// famille DÉMONTAGE : le popper disparaît sans jamais écrire "closed"
new MutationObserver(rs => { for (const r of rs) {
  for (const n of r.removedNodes) if (n.nodeType === 1 && n.matches?.("[data-radix-popper-content-wrapper]")) log("popper −");
  for (const n of r.addedNodes)   if (n.nodeType === 1 && n.matches?.("[data-radix-popper-content-wrapper]")) log("popper +");
}}).observe(document.body, { childList: true });
```

Au clignotement : `copy(window.__log.slice(-40).join("\n"))`.
`open→closed→open` sur le même `data-slot`, à moins de 100 ms d'intervalle = famille FERMETURE. `popper −` puis `popper +` **sans** ligne `state` = famille DÉMONTAGE.

⚠️ **Correction d'instrument, load-bearing.** L'observateur de la passe 2 (`§3.1 (c)`) écoute `childList` seul. Or la `Presence` de Radix garde le nœud MONTÉ pendant les 100 ms d'animation de sortie : une fermeture suivie d'une réouverture dans cette fenêtre ne produit **aucun** `surface−`/`surface+`. Il serait resté muet toute la journée sur exactement le défaut cherché. Les deux observateurs sont complémentaires, pas substituables — et `attributeOldValue` est obligatoire, sinon deux transitions livrées dans le même lot se lisent toutes deux à leur valeur finale.

---

## 3. Les autres chaînes retenues

**A. `AgentBeam` sans `keepMounted` sur la carte de ticket — le seul démontage du dépôt qui ait une VRAIE détente.**
`components/agent-beam.tsx:51` change le TYPE de sa racine : `if (!active && !keepMounted) return <>{children}</>;` puis `return <BorderBeam …>{children}</BorderBeam>` (`:52-62`). React démonte et remonte. Neuf sites d'appel sur dix passent `keepMounted` — `assistant-fab.tsx:85` (avec le commentaire `:82-84` : « sinon son animation d'entrée rejouerait à chaque bascule »), `chat-input.tsx:790`, `scratchpad-editor.tsx:550`. **Le dixième ne le passe pas, et c'est celui qui enveloppe le plus gros sous-arbre de l'app** : `components/issue-card.tsx:1427`, qui contient `IssueCardBody` (`:640`) et ses six pickers (`:172, :212, :259, :372, :435, :494`). La doc du prop documente le bug (`agent-beam.tsx:41-46`), et le site d'appel l'ignore.
Détente : `agentActive` (`issue-card.tsx:950`) → `useContext(AgentActivityContext).working.has(id)` (`agent-activity-context.tsx:105-107`), alimenté par un sondage à 4 s / 15 s (`:67-74`) **dont le `queryFn` avale les erreurs** : `if (!res.ok) return { workingIssueIds: [], … }` (`:49-50`). Une réponse en échec est stockée comme un succès à listes vides → tous les halos s'éteignent → toutes les cartes concernées remontent → le sondage suivant rétablit → elles remontent encore.
Ferme : oui, sec, sans animation de sortie. **Rouvre : non** — `usePickerShell` (`components/search-select.tsx:151-158`) vit DANS `IssueCardBody`.
Repro : geste C.

**B. Les commutateurs de type de racine à `tooltip` — fusils chargés, sans détente (confirmé).**
`components/search-menu.tsx:169-178` (`if (!tooltip) return popover; return <Tooltip>{popover}…`), `components/date-time-picker.tsx:508-517`, plus `SidebarRow` (`app-sidebar.tsx:303`, relevé passe 2) et `FooterRow` (`app-sidebar.tsx:555`, manqué par la passe 2). Ceux de `search-menu` et `date-time-picker` sont les seuls dont l'état d'ouverture survive au-dessus (`usePickerShell` vit dans `SearchSelect`, PARENT de `SearchMenu`) : ils fermeraient ET rouvriraient. Mais aucun appelant du dépôt ne fait varier `tooltip` à l'exécution. À corriger par hygiène, pas comme cause.
Repro : aucune sans fabriquer la détente. Ne pas en faire une piste.

**C. `AnimatePresence mode="wait"` sur la nav de la barre (`app-sidebar.tsx:902-913`, `transitions.fade` = 150 ms) — relevé par la passe 3, non rouvert ici.**
Ferme (150 ms de trou où aucune des deux navs n'existe), ne rouvre rien. C'est la constante du dépôt la plus proche du témoignage après `duration-100`, et la seule qui décrive un TROU. Si ce qui clignote est dans la BARRE et pas un popover, c'est là qu'il faut regarder en premier.
Repro : depuis l'accueil, survoler une ligne de nav pour armer son infobulle, puis aller sur un projet par `⌘K`. La nav s'absente 150 ms et l'infobulle ne revient pas.

---

## 4. Les correctifs

### Bons de toute façon (structure stable, état hissé)

```tsx
// components/issue-card.tsx:1427 — le seul AgentBeam du dépôt sans keepMounted.
- <AgentBeam active={agentActive} className="rounded-xl shadow-sm">
+ <AgentBeam active={agentActive} keepMounted className="rounded-xl shadow-sm">
```

```ts
// components/agent/agent-activity-context.tsx:49-50 — une erreur n'est pas
// « aucun agent ne travaille ». La faire remonter : react-query garde alors
// les données précédentes au lieu de vider tous les halos.
- if (!res.ok) return { workingIssueIds: [], sessionIssueIds: [], pullRequests: {} };
+ if (!res.ok) throw new Error(`agent-activity ${res.status}`);
```

```tsx
// components/search-menu.tsx:169-178 — un seul arbre, un seul type de racine.
- if (!tooltip) return popover;
- return (<Tooltip>{popover}<TooltipContent …>…</TooltipContent></Tooltip>);
+ return (
+   <Tooltip open={tooltip ? undefined : false}>
+     {popover}
+     {tooltip && <TooltipContent className="flex items-center gap-1.5">{tooltip}{shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}</TooltipContent>}
+   </Tooltip>
+ );
```
Même geste sur `components/date-time-picker.tsx:508-517` et sur `FooterRow` (`app-sidebar.tsx:555-563`), avec la forme que la passe 2 prescrit déjà pour `SidebarRow` (`:303`) — un seul motif à apprendre dans le dépôt. Ne rien faire sur `components/issue-field-shortcuts.tsx:242-257` : les deux branches ne coexistent jamais (`if (!state) return null`, `:229`).

### Qui ne se justifient que si la chaîne du §1 est démontrée

Le créneau unique `openPicker` (`create-issue-dialog.tsx:158`) doit refuser d'être remis à `null` par un popover qui n'est plus celui qui est ouvert :

```tsx
// Un onOpenChange(false) qui arrive APRÈS qu'un autre picker a pris le créneau
// est un écho, pas une demande. C'est l'ordre React → Radix qui le produit.
const setPickerOpen = (field: ShortcutField) => (o: boolean) =>
  setOpenPicker((cur) => (o ? field : cur === field ? null : cur));
…
onOpenChange={setPickerOpen("status")}   // :672, et les six autres
```

Le geste général vaut pour tout créneau unique du dépôt : **une fermeture ne ferme que ce qu'elle nomme.**

---

## 5. Ce qui a été éliminé, et pourquoi

| Écarté | Raison, en une ligne |
| --- | --- |
| Une frame perdue, un tearing, un artefact de peinture | 100 ms = 12 images à 120 Hz. C'est un cycle d'état, pas une image. |
| **La bande de glissement de la fenêtre** (`app/globals.css:1681-1694`, `app/layout.tsx:167`) mangeant les clics d'un popover | Le contenu Radix porte `tabindex="-1"` (`@radix-ui/react-focus-scope/dist/index.mjs:127`), il matche donc `[tabindex]` du creusement global (`app/globals.css:1711-1732`) : sa surface entière est `no-drag`. |
| Une touche dupliquée par la coquille | `desktop/src/main.ts` n'a ni `globalShortcut`, ni `before-input-event`, ni `sendInputEvent` ; `lib/desktop/bridge.ts` n'expose que quatre membres, aucun d'entrée. |
| Un refetch au retour de fenêtre poussant `agentActive` | `refetchOnWindowFocus: false` globalement (`lib/query-provider.tsx:134`) ; et `["agent-active-issues"]` n'est ni dans `USER_SCOPE_KEYS` (`lib/realtime-provider.tsx:481-491`) ni dans `projectScopeKeys` (`:492-512`) — le rattrapage ne le touche pas. Seul le `refetchInterval` repart à la visibilité. |
| `TOOLTIP_DELAY_MS = 600`, `skipDelayDuration = 300`, `RAIL_CLOSE_DELAY_MS = 150`, `INVALIDATE_COALESCE_MS = 200`, `transitions.shell = 320 ms`, `DISCARD_DELAY_MS = 60`, `CLOSE_DELAY_MS = 140` (landing) | Hors fenêtre, ou hors périmètre. Relevés et écartés par la passe 3, contre-vérifiés ici. Aucune ne vaut 100. |
| `duration-100` comme CAUSE | C'est l'horloge de l'animation, pas un mécanisme : elle explique la forme et la durée, jamais ce qui repose `open`. |
| Le double `rAF` et l'aller-retour IPC de `use-window-buttons` | 8 à 10 ms, deux ordres de grandeur sous la cible ; et le rendu qu'ils provoquent ne descend dans aucun porteur de surface flottante. |
| `ActionsPopover` (`lib/command-palette/components/ActionsPopover.tsx:247`, le seul `setTimeout(…, 100)` client) | Cycle complet mais déclencheur inexistant : `setPosition(null)` n'est écrit que lorsque `isOpen` tombe. Défaut réel (délai en dur comme garde), pas le symptôme. |

---

## Ce qui manque pour savoir

Une seule chose, et elle se nomme précisément : **un chemin qui écrive `open = true` sans geste de l'utilisateur, dans les 100 ms qui suivent une fermeture.** Je l'ai cherché dans les trois seules sources possibles — `onOpenToggle` de Radix (exige un `click` réel sur le déclencheur), les écouteurs `keydown` (`components/create-issue-dialog.tsx:302-311`, `components/issue-field-shortcuts.tsx:150-154`, tous gardés par un test de cible `INPUT`), et les entrées du menu contextuel (`openField`, `issue-field-shortcuts.tsx:176-180`). Aucune ne part sans un événement d'entrée.

Il reste donc deux possibilités, et **c'est la sonde §2.D qui tranche entre elles** — pas une lecture de plus :

- soit le popover ne se REFERME jamais et c'est un **remontage** qui rejoue l'animation d'entrée : la sonde imprime `popper −` / `popper +` sans aucune ligne `state`, et il faut alors chercher quel nœud a été démonté au-dessus (la famille B, aujourd'hui sans détente, aurait donc acquis la sienne) ;
- soit le cycle est réel et le `true` vient d'un événement d'entrée que je n'ai pas su modéliser : la sonde imprime `open→closed→open`, et la ligne qui précède le `closed` nomme la surface, ce qui suffit à remonter au porteur.

Sans cette trace, la passe suivante repartirait comme celle-ci : à lire du code juste, un fichier à la fois.