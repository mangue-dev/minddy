import type { DesktopChannel } from "./channel";

interface Options {
  current: () => DesktopChannel;
  unavailable: () => boolean;
  prepare: (next: DesktopChannel) => Promise<void>;
  apply: (next: DesktopChannel) => void;
}

/** A server selection made during cookie carry must win over the pending switch. */
export function createDesktopChannelSwitch(options: Options) {
  let revision = 0;
  let pending: Promise<void> = Promise.resolve();
  return {
    cancel() { revision++; },
    async select(next: DesktopChannel): Promise<void> {
      const selected = ++revision;
      if (options.unavailable() || next === options.current()) return;
      // Cookie writes are serialized so an obsolete carry cannot overwrite the
      // destination session while a newer selection is preparing it.
      const ready = pending.catch(() => {}).then(async () => {
        if (selected !== revision || options.unavailable()) return;
        await options.prepare(next);
        if (selected !== revision || options.unavailable()) return;
        options.apply(next);
      });
      pending = ready;
      await ready;
    },
  };
}
