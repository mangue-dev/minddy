"use client";

import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default function AdminPage() {
  // <Suspense> requis : le shell lit l'onglet courant via useSearchParams.
  return (
    <Suspense fallback={null}>
      <AdminDashboard />
    </Suspense>
  );
}
