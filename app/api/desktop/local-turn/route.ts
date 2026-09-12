import { NextResponse } from "next/server";

/**
 * Compatibility tombstone for desktop shells released with the local worker
 * claim loop. No request body, stored preference, device identity, or existing
 * run can reopen desktop-local execution after MIN-519.
 *
 * The response is deliberately actionable: old shells can surface the
 * transition without treating a server sandbox as a portable continuation of
 * a local checkpoint or checkout. Local files are never touched by this route.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "localExecutionRetired",
      code: "localExecutionRetired",
      transition: {
        action: "start_server_conversation",
        localFilesPreserved: true,
        checkpointPortable: false,
      },
    },
    {
      status: 410,
      headers: { "cache-control": "no-store" },
    },
  );
}
