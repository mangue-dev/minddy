/**
 * La trace du MAIN process (MIN-307) — **éteinte par défaut**.
 *
 * Le pendant de lib/desktop/trace.ts, côté coquille. Elle existe parce que la
 * page ne peut pas voir ce qui se passe ici : elle ignore quand la fenêtre est
 * cachée plutôt que fermée, quand macOS l'endort, et ce que `applyWindowButtons`
 * a réellement posé sur elle. Or c'est exactement là que vivent les événements
 * qui séparent la coquille du navigateur.
 *
 * **Allumage** : `MINDDY_TRACE=1` dans l'environnement du process. Les lignes
 * partent sur la sortie standard — en développement `npm --prefix desktop run
 * dev`, en binaire signé les journaux du système.
 *
 * Ce qui est instrumenté, et pourquoi :
 *
 * - `applyWindowButtons` / `publishWindowButtons` — les deux moitiés du pont vu
 *   d'ici. Une demande de la page sans publication en retour, ou l'inverse, se
 *   lit en une ligne ;
 * - `did-start-loading` — la remise à zéro qui suit un chargement plein, celle
 *   qui laissait les feux absents (MIN-304) ;
 * - `show` / `hide` / `blur` — ⌘W et le feu rouge CACHENT la fenêtre au lieu de
 *   la détruire, donc le même document vit des dizaines de cycles par jour ;
 * - `powerMonitor` sur `suspend` / `resume` / `lock-screen` — la cause la plus
 *   fréquente des coupures de socket, et la page n'en sait rien : elle ne voit
 *   que le `visibilitychange` qui suit, quand il suit.
 */

/** La trace tourne-t-elle ? Lu une fois, au chargement du module. */
export const TRACING = process.env.MINDDY_TRACE === "1";

/**
 * Une ligne de trace. **No-op quand la trace est éteinte** — c'est ce qui permet
 * d'en semer aux points chauds sans y penser.
 *
 * Le détail est passé en objet et non formaté par l'appelant : un `trace()`
 * éteint ne doit rien coûter, pas même une concaténation.
 */
export function trace(kind: string, detail?: Record<string, unknown>): void {
  if (!TRACING) return;
  const at = (process.uptime() * 1000).toFixed(0).padStart(8, " ");
  const tail = detail
    ? " " +
      Object.entries(detail)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ")
    : "";
  console.log(`[minddy:trace] ${at}ms ${kind}${tail}`);
}
