import { CheckIcon, ClockIcon as Clock, FilterHorizontalIcon as ListFilter, HashIcon as Hash, TagsIcon as Tags, TypeIcon as Type, UserGroupIcon as Users } from "@hugeicons/core-free-icons";
import { DATE_ICON } from "@/components/feature-icons";

export const PROPERTY_ICONS = {
  text: Type,
  number: Hash,
  select: ListFilter,
  multi_select: Tags,
  created_at: Clock,
  date: DATE_ICON,
  people: Users,
  checkbox: CheckIcon,
};
