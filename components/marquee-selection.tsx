"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  type RefObject,
} from "react";

/**
 * Lasso de sélection sur le fond des boards, « comme sur le bureau » : on appuie
 * sur le fond, on glisse, et tout ticket touché par le rectangle entre dans la
 * sélection — celle-là même que la pilule d'actions groupées consomme (MIN-75).
 *
 * Quatre choses méritent d'être dites, parce qu'elles ne se devinent pas :
 *
 * - **Tout se calcule en coordonnées écran.** Chaque colonne défile de son côté
 *   et le board défile horizontalement : raisonner en coordonnées de contenu
 *   voudrait dire suivre trois origines à la fois. `getBoundingClientRect` les
 *   ramène toutes à la même. Corollaire heureux : une carte poussée hors de sa
 *   colonne par le défilement n'est pas attrapée, parce qu'on ne prend que ce que
 *   le rectangle MONTRE — `visibleRect` recoupe la carte avec ce qui la rogne.
 *
 * - **Le rectangle ne passe pas par React.** Il est écrit directement dans le
 *   style de l'élément d'`overlayRef`. Un `setState` par image rerendrait toutes
 *   les cartes du board soixante fois par seconde pour déplacer un cadre. Le seul
 *   rendu qu'on déclenche, c'est le changement de sélection — et encore, filtré :
 *   `emit` compare avant d'appeler.
 *
 * - **Le défilement automatique déplace l'ancre.** Quand un bord fait défiler, le
 *   contenu glisse sous un point de départ qui, lui, est fixe à l'écran : on le
 *   décale d'autant, sinon le lasso se décroche de la carte d'où il est parti.
 *   Seule la colonne où le geste a commencé compte — faire défiler une AUTRE
 *   colonne doit bien faire passer ses cartes sous un rectangle immobile.
 *
 * - **Souris uniquement.** Au doigt, le même geste est le défilement du board,
 *   exactement comme pour le glisser-déposer des cartes (MouseSensor).
 */

/** Ce que le lasso attrape : toute carte qui porte son id. */
const ITEM_SELECTOR = "[data-issue-id]";

/** Ce qui n'est pas du fond : une carte, un bouton, un lien, un champ. */
const IGNORE_SELECTOR = `${ITEM_SELECTOR}, button, a, input, textarea, select, [role="button"], [contenteditable="true"]`;

/** En deçà, le geste reste un clic (qui, lui, referme la sélection). */
const START_DISTANCE = 5;

/** Largeur de la bande de bord qui déclenche le défilement automatique. */
const EDGE = 56;

/** Vitesse du défilement automatique au ras du bord, en pixels par image. */
const MAX_SPEED = 24;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  return right <= left || bottom <= top ? null : { left, top, right, bottom };
}

/** Les ancêtres qui rognent la carte, du plus proche jusqu'au board inclus. */
function clippingAncestors(el: HTMLElement, root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      out.push(node);
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return out;
}

/**
 * La part de la carte réellement visible. `null` si le défilement de sa colonne
 * l'a entièrement escamotée : on ne sélectionne pas ce qu'on ne voit pas.
 *
 * Les ancêtres rogneurs sont mis en cache pour la durée du geste — les retrouver
 * demande un `getComputedStyle` par niveau, et on repasse sur chaque carte à
 * chaque image.
 */
function visibleRect(
  el: HTMLElement,
  root: HTMLElement,
  cache: Map<HTMLElement, HTMLElement[]>
): Box | null {
  let box: Box | null = rectOf(el);
  let clippers = cache.get(el);
  if (!clippers) {
    clippers = clippingAncestors(el, root);
    cache.set(el, clippers);
  }
  for (const clipper of clippers) {
    box = intersect(box, rectOf(clipper));
    if (!box) return null;
  }
  return box;
}

/** Plus on s'enfonce dans la bande, plus ça va vite ; au-delà, ça plafonne. */
function rampSpeed(depth: number): number {
  return Math.max(2, Math.min(MAX_SPEED, (depth / EDGE) * MAX_SPEED));
}

/** Vitesse de défilement pour un pointeur à `pos` entre deux bords. */
function edgeVelocity(pos: number, min: number, max: number): number {
  // Sous deux bandes de haut, les deux bords se marchent dessus : on renonce.
  if (max - min < EDGE * 2) return 0;
  if (pos < min + EDGE) return -rampSpeed(min + EDGE - pos);
  if (pos > max - EDGE) return rampSpeed(pos - (max - EDGE));
  return 0;
}

/** La colonne (ou autre boîte défilante) sous ce point, à l'intérieur du board. */
function scrollableAt(
  x: number,
  y: number,
  root: HTMLElement
): HTMLElement | null {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof HTMLElement) || !root.contains(hit)) return null;
  let node: HTMLElement | null = hit;
  while (node) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    if (node === root) return null;
    node = node.parentElement;
  }
  return null;
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export interface MarqueeSelection<T extends HTMLElement> {
  /** À fusionner avec les autres refs du conteneur défilant du board. */
  ref: RefCallback<T>;
  /** À poser sur ce même conteneur. */
  onPointerDown: (event: ReactPointerEvent<T>) => void;
  /** À passer à <MarqueeOverlay/>, rendu n'importe où dans l'arbre. */
  overlayRef: RefObject<HTMLDivElement | null>;
}

export function useMarqueeSelection<T extends HTMLElement = HTMLElement>({
  selected,
  onChange,
}: {
  /** La sélection courante — sert de base à un geste additif (⇧ ou ⌘). */
  selected: Set<string>;
  /** Reçoit la sélection complète, jamais un delta. */
  onChange: (next: Set<string>) => void;
}): MarqueeSelection<T> {
  const containerRef = useRef<T | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Un geste en cours ne doit pas survivre au board (changement de vue, de
  // projet) — listeners coupés, et le corps rendu à sa sélection de texte.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      document.body.style.userSelect = "";
    },
    []
  );

  const ref = useCallback<RefCallback<T>>((el) => {
    containerRef.current = el;
  }, []);

  const onPointerDown = (event: ReactPointerEvent<T>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(IGNORE_SELECTOR)) return;
    // Une barre de défilement classique (Windows, Linux) est dans le cadre mais
    // n'est pas du fond : sans ça, l'attraper lancerait un lasso au lieu de faire
    // défiler le board. Sous macOS elle flotte et ces deux marges valent zéro.
    const bounds = container.getBoundingClientRect();
    if (
      event.clientX > bounds.right - (container.offsetWidth - container.clientWidth) ||
      event.clientY > bounds.bottom - (container.offsetHeight - container.clientHeight)
    ) {
      return;
    }
    // Coupe net la sélection de texte et le glisser d'image du navigateur.
    event.preventDefault();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const baseline = new Set(selected);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const clippers = new Map<HTMLElement, HTMLElement[]>();
    const anchorScroller = scrollableAt(
      event.clientX,
      event.clientY,
      container
    );
    /** La boîte défilante sous le pointeur, tenue à jour par `pointermove`. */
    let pointerScroller: HTMLElement | null = anchorScroller;
    let anchorX = event.clientX;
    let anchorY = event.clientY;
    let pointerX = anchorX;
    let pointerY = anchorY;
    let started = false;
    let dirty = false;
    let frame: number | null = null;
    let emitted = new Set(selected);

    const emit = (next: Set<string>) => {
      if (sameIds(next, emitted)) return;
      emitted = next;
      onChangeRef.current(next);
    };

    const apply = () => {
      const containerBox = rectOf(container);
      // Le lasso ne déborde pas du board : on ne sélectionne que ce qu'il montre.
      const box = intersect(
        {
          left: Math.min(anchorX, pointerX),
          right: Math.max(anchorX, pointerX),
          top: Math.min(anchorY, pointerY),
          bottom: Math.max(anchorY, pointerY),
        },
        containerBox
      );

      // ⚠ **LIRE AVANT D'ÉCRIRE** (MIN-320). Les styles de l'overlay étaient
      // posés en premier, puis venaient les N `getBoundingClientRect()` des
      // cartes : l'ordre exactement inverse de celui qui évite un reflow. Les
      // mesures d'abord, l'écriture ensuite — un seul layout par image.
      const touched = new Set<string>();
      if (box) {
        for (const el of container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
          const id = el.dataset.issueId;
          if (!id) continue;
          const rect = visibleRect(el, container, clippers);
          if (rect && overlaps(rect, box)) touched.add(id);
        }
      }

      const overlay = overlayRef.current;
      if (overlay) {
        if (box) {
          overlay.style.display = "block";
          overlay.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
          overlay.style.width = `${box.right - box.left}px`;
          overlay.style.height = `${box.bottom - box.top}px`;
        } else {
          overlay.style.display = "none";
        }
      }

      emit(additive ? new Set([...baseline, ...touched]) : touched);
    };

    /**
     * Le défilement automatique aux bords, en LISANT PUIS ÉCRIVANT (MIN-320).
     *
     * La version d'avant alternait : lecture de rect → écriture de `scrollLeft`
     * → relecture → `document.elementFromPoint` (qui force une mise à jour de
     * style ET de layout, puisqu'une écriture vient de les invalider) → remontée
     * des ancêtres avec `getComputedStyle().overflowY` et lectures de
     * `scrollHeight`/`clientHeight` par niveau → écriture de `scrollTop`. Deux à
     * trois layouts forcés par image, pointeur immobile compris, pendant tout le
     * geste.
     *
     * Ce qui reste ici est une phase de lecture puis une phase d'écriture. La
     * résolution du scroller sous le pointeur, elle, a quitté la boucle : elle
     * ne peut changer qu'au mouvement du pointeur, donc elle vit dans son
     * gestionnaire (`pointerScroller`).
     */
    const autoScroll = () => {
      const containerBox = rectOf(container);
      const dx = edgeVelocity(pointerX, containerBox.left, containerBox.right);

      // Le curseur est peut-être sorti du board : on continue alors de faire
      // défiler la colonne d'où l'on est parti, ce qui est l'intention.
      const scroller = pointerScroller ?? anchorScroller;
      const scrollerBox = scroller ? rectOf(scroller) : null;
      const dy = scrollerBox
        ? edgeVelocity(pointerY, scrollerBox.top, scrollerBox.bottom)
        : 0;

      if (dx === 0 && dy === 0) return;

      if (dx !== 0) {
        const before = container.scrollLeft;
        container.scrollLeft = before + dx;
        const applied = container.scrollLeft - before;
        if (applied !== 0) {
          anchorX -= applied;
          dirty = true;
        }
      }
      if (dy !== 0 && scroller) {
        const before = scroller.scrollTop;
        scroller.scrollTop = before + dy;
        const applied = scroller.scrollTop - before;
        if (applied !== 0) {
          if (scroller === anchorScroller) anchorY -= applied;
          dirty = true;
        }
      }
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      autoScroll();
      if (!dirty) return;
      dirty = false;
      apply();
    };

    const finish = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      document.body.style.userSelect = "";
      const overlay = overlayRef.current;
      if (overlay) overlay.style.display = "none";
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };

    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        pointerX = e.clientX;
        pointerY = e.clientY;
        // La boîte défilante sous le pointeur est résolue ICI et pas dans la
        // boucle (MIN-320) : elle ne peut changer qu'au mouvement du pointeur,
        // et sa résolution coûte un `elementFromPoint` plus une remontée
        // d'ancêtres en `getComputedStyle` — c'est-à-dire un layout forcé, qui
        // tombait sinon à chaque image, y compris pointeur immobile.
        pointerScroller = scrollableAt(pointerX, pointerY, container);
        if (!started) {
          if (Math.hypot(pointerX - anchorX, pointerY - anchorY) < START_DISTANCE) {
            return;
          }
          started = true;
          document.body.style.userSelect = "none";
          loop();
        }
        dirty = true;
      },
      { signal }
    );

    const stop = () => {
      const dragged = started;
      finish();
      // Un clic net sur le fond, sans glisser : on referme la sélection — c'était
      // jusqu'ici la croix de la pilule, à l'autre bout de l'écran.
      if (!dragged && !additive && baseline.size > 0) {
        onChangeRef.current(new Set());
      }
    };
    window.addEventListener("pointerup", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
    // Relâchement hors de la fenêtre, ⌘-tab au milieu du geste : on ne verra
    // jamais le `pointerup`. On garde la sélection acquise, on lâche le reste.
    window.addEventListener("blur", finish, { signal });

    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        finish();
        emit(baseline);
      },
      { signal }
    );

    // Molette pendant le geste : les cartes bougent, le rectangle non — il faut
    // refaire le calcul. `capture` parce qu'un défilement de colonne ne remonte pas.
    window.addEventListener(
      "scroll",
      () => {
        dirty = true;
      },
      { signal, capture: true, passive: true }
    );
  };

  return { ref, onPointerDown, overlayRef };
}

/**
 * Le rectangle lui-même. Masqué et positionné à la main par le hook (cf. son
 * en-tête) : ce composant ne rend qu'une fois et ne réagit à rien.
 */
export function MarqueeOverlay({
  overlayRef,
}: {
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 hidden rounded-[3px] border border-primary/70 bg-primary/15"
    />
  );
}
