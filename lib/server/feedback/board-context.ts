import "server-only";

import { cache } from "react";
import { getBoardByToken } from "./boards";

/**
 * Resolution of the public board by token, memorized by request (React `cache`).
 * Shared between the layout of the segment `/f/[token]` (injection of the accent,
 * MIN-59) and the page itself: only one DB read per rendered.
 */
export const getBoardContext = cache(getBoardByToken);
