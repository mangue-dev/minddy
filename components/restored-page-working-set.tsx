import { Suspense } from "react";
import { headers } from "next/headers";
import { authorizeUserClient } from "@/lib/server/api-auth";
import { createServerSupabase } from "@/lib/supabase-server";
import { startRestoredPageWorkingSet } from "@/lib/server/restored-page-working-set";
import { withSupabaseAbortSignal } from "@/lib/server/supabase-fetch";
import type { RestoredPageBootstrapRecord } from "@/lib/restored-page-bootstrap-types";
import { RestoredPageBootstrapRecordView } from "./restored-page-bootstrap-record";

async function CompletedRecord({ read }: { read: Promise<RestoredPageBootstrapRecord | null> }) {
  const record = await read;
  return record ? <RestoredPageBootstrapRecordView record={record} /> : null;
}

/** Initial-document work must not multiply across SPA navigation or prefetch. */
export async function RestoredPageWorkingSet() {
  const requestHeaders = await headers();
  if (requestHeaders.get("sec-fetch-dest") !== "document" || requestHeaders.get("sec-fetch-mode") !== "navigate" ||
      ["purpose", "sec-purpose"].some((name) => /\bprefetch\b/i.test(requestHeaders.get(name) ?? ""))) return null;
  try {
    const workingSet = await withSupabaseAbortSignal(AbortSignal.timeout(10_000), async () => {
      const auth = await authorizeUserClient(await createServerSupabase());
      return auth.ok ? startRestoredPageWorkingSet(auth) : null;
    });
    return workingSet?.records.map((read, index) => <Suspense key={index} fallback={null}>
      <CompletedRecord read={read} />
    </Suspense>) ?? null;
  } catch {
    console.error("[restored-page-bootstrap] unavailable");
    return null;
  }
}
