import { ListDetailSkeleton } from "@/components/route-skeletons";

export default function TrashLoading() {
  return <ListDetailSkeleton rows={7} rowClassName="h-10" cards={3} />;
}
