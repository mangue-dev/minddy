"use client";

import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { SettingsPageSkeleton } from "@/components/route-skeletons";

export default function AdminPage() {
  // <Suspense> requis : le shell lit l'onglet courant via useSearchParams. Le
  // repli monte le squelette à sidebar secondaire, et non rien du tout : une
  // page vide replierait la gouttière et déplierait la sidebar primaire, pour
  // tout rouvrir une image plus tard.
  return (
    <Suspense fallback={<SettingsPageSkeleton rows={4} />}>
      <AdminDashboard />
    </Suspense>
  );
}
