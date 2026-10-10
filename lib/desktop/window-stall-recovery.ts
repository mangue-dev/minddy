export const DESKTOP_LOAD_DEADLINE_MS = 30_000;
export const DESKTOP_HANG_GRACE_MS = 5_000;
export type WindowStall = "loading" | "unresponsive";

interface Options {
  origin: () => string;
  unavailable: () => boolean;
  prompt: (reason: WindowStall, signal: AbortSignal) => Promise<boolean>;
  recover: (reason: WindowStall) => void;
  schedule?: (work: () => void, delay: number) => () => void;
}

/** Offer recovery once per stalled episode; never discard work automatically. */
export function createWindowStallRecovery(options: Options) {
  const schedule = options.schedule ?? ((work, delay) => {
    const timer = setTimeout(work, delay);
    return () => clearTimeout(timer);
  });
  let generation = 0;
  let loading = false;
  let hung = false;
  let loadPrompted = false;
  let hangPrompted = false;
  let cancelLoad: (() => void) | undefined;
  let cancelHang: (() => void) | undefined;
  let prompt: { reason: WindowStall; controller: AbortController } | undefined;
  const abortPrompt = () => { prompt?.controller.abort(); prompt = undefined; };
  const stillStalled = (reason: WindowStall) => reason === "loading" ? loading : hung;
  const offer = (reason: WindowStall) => {
    if (options.unavailable() || prompt || !stillStalled(reason)) return;
    if (reason === "loading") loadPrompted = true;
    else hangPrompted = true;
    const at = generation;
    const controller = new AbortController();
    prompt = { reason, controller };
    void Promise.resolve().then(() => {
      if (controller.signal.aborted || options.unavailable()) return false;
      return options.prompt(reason, controller.signal);
    }).then(recover => {
      if (recover && !controller.signal.aborted && at === generation &&
          !options.unavailable() && stillStalled(reason)) {
        stop();
        options.recover(reason);
      }
    }).catch(() => {
      // A failed native dialog must not kill the main process or reload edits.
    }).finally(() => {
      if (prompt?.controller === controller) prompt = undefined;
      // A hang takes priority if the load dialog was open when it began.
      if (hung && !hangPrompted && !prompt && !options.unavailable()) {
        cancelHang?.();
        cancelHang = schedule(() => offer("unresponsive"), DESKTOP_HANG_GRACE_MS);
      }
    });
  };
  function stop() {
    generation++;
    loading = false; hung = false;
    cancelLoad?.(); cancelHang?.();
    cancelLoad = cancelHang = undefined;
    abortPrompt();
  }
  return {
    navigationStarted(url: string, sameDocument: boolean) {
      if (sameDocument) return;
      stop();
      loadPrompted = hangPrompted = false;
      try { loading = new URL(url).origin === new URL(options.origin()).origin; } catch { loading = false; }
      if (loading && !options.unavailable()) cancelLoad = schedule(() => {
        if (!loadPrompted && !hung) offer("loading");
      }, DESKTOP_LOAD_DEADLINE_MS);
    },
    loadingStopped() {
      loading = false;
      cancelLoad?.(); cancelLoad = undefined;
      if (prompt?.reason === "loading") abortPrompt();
    },
    unresponsive() {
      hung = true;
      if (!hangPrompted && !cancelHang && !options.unavailable()) {
        cancelHang = schedule(() => { cancelHang = undefined; offer("unresponsive"); }, DESKTOP_HANG_GRACE_MS);
      }
    },
    responsive() {
      hung = false; hangPrompted = false;
      cancelHang?.(); cancelHang = undefined;
      if (prompt?.reason === "unresponsive") abortPrompt();
      // A transient hang must not permanently suppress a pending load deadline.
      if (loading && !loadPrompted) {
        cancelLoad?.();
        cancelLoad = schedule(() => offer("loading"), DESKTOP_LOAD_DEADLINE_MS);
      }
    },
    stop,
  };
}
