"use client";

import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { SettingsPageSkeleton } from "@/components/route-skeletons";

export default function AdminPage() {
  // <Suspense> required: the shell reads the current tab via useSearchParams. THE
  // fold mounts the skeleton to secondary sidebar, and not nothing at all: a
  // empty page would fold the gutter and unfold the primary sidebar, to
  // reopen everything one image later.
  return (
    <Suspense fallback={<SettingsPageSkeleton rows={4} />}>
      <AdminDashboard />
    </Suspense>
  );
}
