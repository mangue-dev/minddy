"use client";

/**
 * La trace de l'app de bureau (MIN-307) — **éteinte par défaut**.
 *
 * Les à-coups ressentis dans la coquille ne se reproduisent pas à la demande :
 * le temps d'ouvrir DevTools et d'appuyer sur Enregistrer, c'est passé. Une
 * session de profilage ne les trouvera donc jamais. Il faut l'inverse — une
 * instrumentation qui tourne en permanence, garde une trace TOURNANTE des
 * dernières {@link TRACE_WINDOW_MS}, et se fige sur commande. Le geste devient
 * « je viens de le voir, dump ».
 *
 * **Allumage** : `localStorage.setItem("minddy.trace", "1")`, puis rechargement.
 * **Vidage** : ⌥⇧T copie la fenêtre courante dans le presse-papier (la
 * permission `clipboard-sanitized-write` est déjà accordée par la coquille).
 * Rien à redéployer, rien qui tourne chez les autres.
 *
 * ## Ce que la sonde capte, et pourquoi chaque source est là
 *
 * - **`longtask`** — les frames perdues, mesurées plutôt que ressenties.
 * - **`event`** avec `durationThreshold: 16` — un `pointerdown` dont le
 *   `processingStart` arrive 100 ms après le geste dit une frame perdue AVANT
 *   la logique ; un `pointerdown` qui n'apparaît **jamais** dit que macOS l'a
 *   avalé (région de glissement).
 * - **les surfaces flottantes**, et c'est le point délicat : on observe
 *   `data-state` avec **`attributeOldValue`**, pas seulement `childList`. La
 *   `Presence` de Radix garde le nœud MONTÉ pendant les ~100 ms de son animation
 *   de sortie : une fermeture suivie d'une réouverture dans cette fenêtre ne
 *   produit ni insertion ni suppression. Un observateur `childList` seul serait
 *   resté muet toute la journée sur exactement le défaut cherché. Les deux sont
 *   complémentaires, pas substituables.
 * - **`visibilitychange`** avec la durée d'absence — c'est la condition de
 *   déclenchement des vagues d'invalidation (lib/realtime-resume.ts).
 * - **deux points d'appel d'une ligne**, posés à la main : en tête de `catchUp`
 *   (lib/realtime-provider.tsx) et aux deux bouts du pont des boutons de fenêtre
 *   (lib/use-window-buttons.ts).
 *
 * ## Comment lire un dump
 *
 * - `open→closed→open` sur le même `slot` à moins de 100 ms = une bascule
 *   d'état, pas un démontage.
 * - `popper −` puis `popper +` **sans** ligne `state` entre les deux = un
 *   démontage réel.
 * - une ligne `catchUp` suivie d'un `longtask` = la vague d'invalidation, et le
 *   champ `cache` dit combien de requêtes ont été parcourues.
 */

import { getDesktopBridge } from "./bridge";

/** La clé qui allume la trace. Absente ou différente de "1" → rien ne tourne. */
export const TRACE_FLAG = "minddy.trace";

/** Ce que le tampon tournant garde. Au-delà, les plus vieilles lignes sortent. */
export const TRACE_WINDOW_MS = 90_000;

/** Garde-fou mémoire : une rafale de mutations ne doit pas gonfler sans fin. */
export const TRACE_MAX_ENTRIES = 4_000;

export interface TraceEntry {
  /** Millisecondes depuis le chargement du document (`performance.now()`). */
  t: number;
  kind: string;
  detail?: Record<string, unknown>;
}

export interface TraceRing {
  push(entry: TraceEntry): void;
  /** Les lignes encore dans la fenêtre, les plus anciennes d'abord. */
  entries(now: number): TraceEntry[];
  /** Le dump lisible, horodaté en secondes relatives à la ligne la plus ancienne. */
  format(now: number): string;
}

/**
 * Le tampon tournant, PUR — deux bornes, la durée et le nombre.
 *
 * Séparé de l'installation des sondes pour être testable : vitest tourne sur
 * node nu, sans `PerformanceObserver` ni DOM.
 */
export function createTraceRing(
  windowMs: number = TRACE_WINDOW_MS,
  maxEntries: number = TRACE_MAX_ENTRIES
): TraceRing {
  let buffer: TraceEntry[] = [];

  const prune = (now: number) => {
    const floor = now - windowMs;
    let first = 0;
    while (first < buffer.length && buffer[first].t < floor) first += 1;
    if (first > 0) buffer = buffer.slice(first);
    if (buffer.length > maxEntries) {
      buffer = buffer.slice(buffer.length - maxEntries);
    }
  };

  return {
    push(entry) {
      buffer.push(entry);
      prune(entry.t);
    },
    entries(now) {
      prune(now);
      return buffer.slice();
    },
    format(now) {
      const rows = this.entries(now);
      if (rows.length === 0) return "(trace vide)";
      const origin = rows[0].t;
      return rows
        .map((row) => {
          const at = ((row.t - origin) / 1000).toFixed(3).padStart(8, " ");
          const detail = row.detail
            ? " " +
              Object.entries(row.detail)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" ")
            : "";
          return `${at}s ${row.kind}${detail}`;
        })
        .join("\n");
    },
  };
}

/** Le tampon vivant, ou `null` quand la trace est éteinte. */
let ring: TraceRing | null = null;

/**
 * Une ligne de trace. **No-op quand la trace est éteinte** — c'est ce qui permet
 * d'en semer aux points chauds sans y penser : un test de nullité par appel.
 */
export function trace(kind: string, detail?: Record<string, unknown>): void {
  if (!ring) return;
  ring.push({ t: performance.now(), kind, detail });
}

/** La trace tourne-t-elle ? (pour éviter de CALCULER un détail coûteux pour rien) */
export function isTracing(): boolean {
  return ring !== null;
}

/** Le dump courant, ou une ligne qui dit que rien ne tourne. */
export function dumpTrace(): string {
  if (!ring) return "(trace éteinte — localStorage.minddy.trace = \"1\" puis recharger)";
  return ring.format(performance.now());
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(TRACE_FLAG) === "1";
  } catch {
    // Navigation privée, quota : la trace n'est pas une raison de casser l'app.
    return false;
  }
}

/**
 * Installe les sondes. Rend son désinstallateur.
 *
 * Ne fait rien hors de l'app de bureau, ni sans le drapeau : les deux gardes,
 * parce que la trace est un outil de la COQUILLE et qu'on ne veut pas d'un
 * observateur de plus dans un navigateur, même éteint.
 */
export function startDesktopTrace(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!getDesktopBridge() || !readFlag()) return () => {};

  ring = createTraceRing();
  const cleanups: (() => void)[] = [];

  trace("trace:start", { ua: navigator.userAgent });

  // `durationThreshold` est une option d'`event` que les types du DOM ne
  // décrivent pas encore ; elle est bien lue par Chromium. D'où l'élargissement
  // ici plutôt qu'un `as any` au point d'appel.
  type ObserveOptions = PerformanceObserverInit & {
    durationThreshold?: number;
  };

  const observe = (type: string, options: ObserveOptions) => {
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEntry & {
            processingStart?: number;
            interactionId?: number;
          };
          trace(type, {
            name: entry.name,
            ms: Math.round(entry.duration),
            ...(timing.processingStart != null
              ? { lag: Math.round(timing.processingStart - entry.startTime) }
              : {}),
          });
        }
      });
      po.observe(options);
      cleanups.push(() => po.disconnect());
    } catch {
      // Type d'entrée non supporté : on se passe de cette source, pas du reste.
    }
  };

  observe("longtask", { type: "longtask", buffered: true });
  observe("event", { type: "event", durationThreshold: 16, buffered: true });

  // Les surfaces flottantes. `attributeOldValue` est ce qui distingue une
  // BASCULE d'état d'un démontage — voir l'en-tête du fichier.
  const surfaces = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as Element;
        trace("state", {
          slot: el.getAttribute("data-slot") ?? el.tagName.toLowerCase(),
          from: record.oldValue ?? "?",
          to: el.getAttribute("data-state") ?? "?",
        });
        continue;
      }
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.hasAttribute("data-radix-popper-content-wrapper")) {
          trace("popper", { op: "+" });
        }
      }
      for (const node of record.removedNodes) {
        if (node instanceof Element && node.hasAttribute("data-radix-popper-content-wrapper")) {
          trace("popper", { op: "−" });
        }
      }
    }
  });
  surfaces.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["data-state"],
  });
  cleanups.push(() => surfaces.disconnect());

  // La reprise : c'est la durée d'absence qui décide du rattrapage des caches.
  let hiddenSince: number | null = null;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenSince = performance.now();
      trace("hidden");
      return;
    }
    const ms = hiddenSince === null ? 0 : Math.round(performance.now() - hiddenSince);
    hiddenSince = null;
    trace("visible", { hiddenMs: ms });
  };
  document.addEventListener("visibilitychange", onVisibility);
  cleanups.push(() =>
    document.removeEventListener("visibilitychange", onVisibility)
  );

  // ⌥⇧T : la fenêtre courante part au presse-papier.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.altKey || !e.shiftKey || e.code !== "KeyT") return;
    e.preventDefault();
    void navigator.clipboard.writeText(dumpTrace());
    trace("trace:dump");
  };
  window.addEventListener("keydown", onKeyDown);
  cleanups.push(() => window.removeEventListener("keydown", onKeyDown));

  return () => {
    for (const off of cleanups) off();
    ring = null;
  };
}
