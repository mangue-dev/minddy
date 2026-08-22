import { ListDetailSkeleton } from "@/components/route-skeletons";

// Routines open as a list in the secondary sidebar with the selected routine
// beside it — same template as /agents.
export default function RoutinesLoading() {
  return <ListDetailSkeleton />;
}
