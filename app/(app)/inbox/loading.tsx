import { DocPageSkeleton } from "@/components/route-skeletons";

// L'inbox est une liste étroite (max-w-3xl) de notifications.
export default function InboxLoading() {
  return <DocPageSkeleton width="3xl" rows={6} rowClassName="h-16" />;
}
