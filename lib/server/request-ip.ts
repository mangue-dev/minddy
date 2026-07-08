import "server-only";

/** IP du client pour le rate limiting des endpoints publics (OAuth register/
    token). Vercel pose x-forwarded-for (1ʳᵉ valeur = client) ; fallback
    "unknown" — mieux vaut un bucket partagé que pas de limite du tout. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}
