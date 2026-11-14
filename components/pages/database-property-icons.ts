import { CheckIcon, ClockIcon as Clock, FilterHorizontalIcon as ListFilter, HashIcon as Hash, HistoryIcon as History, TagsIcon as Tags, TypeIcon as Type, UserEdit01Icon as UserEdit, UserGroupIcon as Users, UserIcon as User } from "@hugeicons/core-free-icons";
import { DATE_ICON } from "@/components/feature-icons";
import type { DatabasePropertyType } from "@/lib/page-databases";

export const PROPERTY_ICONS = {
  text: Type,
  number: Hash,
  select: ListFilter,
  multi_select: Tags,
  created_at: Clock,
  updated_at: History,
  created_by: User,
  updated_by: UserEdit,
  date: DATE_ICON,
  people: Users,
  checkbox: CheckIcon,
} satisfies Record<DatabasePropertyType, unknown>;
