import { DocPageSkeleton } from "@/components/route-skeletons";

// The inbox is a narrow (max-w-3xl) list of notifications.
export default function InboxLoading() {
  return <DocPageSkeleton width="3xl" rows={6} rowClassName="h-16" />;
}
