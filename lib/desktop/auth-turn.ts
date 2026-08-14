/**
 * Le tour d'authentification de l'app de bureau, vu de la fenêtre (MIN-345).
 *
 * L'app tire un nonce quand ELLE démarre un tour, le glisse dans le
 * `redirectTo`, et ne traite au retour qu'un deep link qui le rapporte. Sans
 * ça, `minddy://auth?code=…` est une porte ouverte : macOS livre à l'app tout
 * ce qui porte notre schéma, y compris ce qu'on n'a jamais émis, et la fenêtre
 * se connectait au compte de qui avait envoyé le lien.
 *
 * ## Pourquoi `localStorage` et pas le main process
 *
 * Parce que c'est le RENDERER qui a besoin de la réponse, et lui seul : le
 * vérificateur PKCE de supabase-js vit dans ce même stockage, dans cette même
 * fenêtre. Un nonce gardé côté main devrait redescendre par le pont pour être
 * comparé, sans rien protéger de plus — le nonce n'est pas un secret contre un
 * attaquant distant, c'est une preuve que le tour est parti d'ici.
 *
 * Il survit à un rechargement de la fenêtre, ce qui est nécessaire : le tour
 * OAuth se fait dans le navigateur système et peut prendre une minute.
 */

const STORAGE_KEY = "minddy.desktop.auth-turn";

/** Au-delà, le tour est considéré abandonné : un lien qui s'en réclame n'est
    plus la réponse à celui qu'on attendait. */
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

/** Démarre un tour et rend son nonce, à poser dans le `redirectTo`. */
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
    // Stockage indisponible : le tour partira sans nonce, et le retour demandera
    // une confirmation à la main. Dégradé, jamais ouvert.
    return nonce;
  }
  return nonce;
}

/**
 * Ce lien répond-il au tour que l'app attend ? Consomme le tour dans tous les
 * cas où il y en avait un : un nonce ne vaut qu'une réponse.
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
    // Rien à faire : au pire un nonce périmé traîne, et il ne vaut plus rien.
  }
}
