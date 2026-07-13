import "server-only";

import { cache } from "react";
import { getBoardByToken } from "./boards";

/**
 * Résolution du board public par token, mémoïsée par requête (React `cache`).
 * Partagée entre le layout du segment `/f/[token]` (injection de l'accent,
 * MIN-59) et la page elle-même : une seule lecture DB par rendu.
 */
export const getBoardContext = cache(getBoardByToken);
