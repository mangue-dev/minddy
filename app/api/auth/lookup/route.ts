import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { isValidEmail, parseAccountStatus, type AccountStatus } from "@/lib/auth-entry";

/**
 * Whether an address holds an account, for the single sign-in and sign-up
 * screen (MIN-907): it then asks for the password, or for a new one.
 *
 * This tells anyone whether an address is registered, as the sign-in screens
 * of most products do; the limits below keep it from being used to sweep a
 * list of addresses. Per client and per address, before any database work.
 */
export async function POST(request: NextRequest) {
  const refusedClient = rateLimitRefusal(`ip:${getClientIp(request)}`, "auth-lookup", {
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (refusedClient) return refusedClient;

  let email: unknown;
  try {
    email = ((await request.json()) as { email?: unknown }).email;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof email !== "string" || email.length > 320 || !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();

  const refusedAddress = rateLimitRefusal(`email:${normalized}`, "auth-lookup", {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (refusedAddress) return refusedAddress;

  const { data, error } = await getServiceClient().rpc("auth_account_status", { p_email: normalized });
  if (error) {
    console.error("[auth/lookup] status read failed:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  const status: AccountStatus | null = parseAccountStatus(data);
  if (!status) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  return NextResponse.json(
    { status },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
