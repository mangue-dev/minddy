import { SettingsPageSkeleton } from "@/components/route-skeletons";

// Same template as the settings: a rail in the secondary sidebar, a
// column of cards on the right. This is the assembly of the REAL bar by the
// skeleton that keeps the primary sidebar to the rail during loading.
export default function AdminLoading() {
  return <SettingsPageSkeleton rows={4} />;
}
