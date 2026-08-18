/**
 * The authentication round of the desktop app, seen from the window (MIN-345).
 *
 * The app pulls a nonce when IT starts a round, slides it into the
 * `redirectTo`, and only processes a deep link that brings it back. Without
 * that, `minddy://auth?code=…` is an open door: macOS delivers to the app everything
 * that carries our schema, including what we have never issued, and the window
 * connected to the account of which had sent the link.
 *
 * ## Why `localStorage` and not the main process
 *
 * Because it is the RENDERER which needs the answer, and only it: the
 * PKCE checker of supabase-js lives in this same storage, in this same
 * window. A nonce guarded on the main side should come back down the bridge to be
 * compared, without protecting anything more — the nonce is not a secret against a remote attacker, it is proof that the turn has left here.
 *
 * It survives a reload of the window, which is necessary: the tour
 * OAuth is done in the system browser and may take a minute.
 */

const STORAGE_KEY = "minddy.desktop.auth-turn";

/** Beyond that, the round is considered abandoned: a link that calls for it is no longer the answer to the one we expected. */
const TURN_TTL_MS = 15 * 60 * 1000;

interface StoredTurn {
  nonce: string;
  startedAt: number;
}

function read(): StoredTurn | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { nonce, startedAt } = parsed as { nonce?: unknown; startedAt?: unknown };
    if (typeof nonce !== "string" || typeof startedAt !== "number") return null;
    return { nonce, startedAt };
  } catch {
    return null;
  }
}

/** Starts a turn and returns its nonce, to be placed in the `redirectTo`. */
export function beginDesktopAuthTurn(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ nonce, startedAt: Date.now() } satisfies StoredTurn)
    );
  } catch {
    // Storage unavailable: the tour will leave without a nonce, and the return will ask
    // a confirmation by hand. Degraded, never opened.
    return nonce;
  }
  return nonce;
}

/**
 * Does this link respond to the turn the app is waiting for? Consumes the turn in all
 * cases where there was one: a nonce is only worth one response.
 */
export function consumeDesktopAuthTurn(turn: string | undefined): boolean {
  const stored = read();
  clearDesktopAuthTurn();
  if (!stored || !turn) return false;
  if (Date.now() - stored.startedAt > TURN_TTL_MS) return false;
  return stored.nonce === turn;
}

export function clearDesktopAuthTurn(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: at worst an expired nonce is lying around, and it is no longer worth anything.
  }
}
