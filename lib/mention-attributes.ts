import type { MentionOption } from "@/components/mention-suggest";
import { memberLabel, type ScannedMention } from "@/lib/mention-scan";

/** Stable id of the pseudo-entity Numo in mention lists and editor nodes. */
export const NUMO_MENTION_ID = "__numo__";

/** Editor-node attributes for an option selected from a mention menu. */
export function mentionAttrsFromOption(option: MentionOption) {
  return {
    mentionType: option.type,
    mentionId: option.id,
    mentionLabel: option.label,
    seed: option.avatarSeed ?? null,
    color: option.color ?? null,
    icon: option.iconUrl ?? option.icon ?? null,
  };
}

/** Editor-node attributes reconstructed from a mention found in plain text. */
export function mentionAttrsFromScanned(mention: ScannedMention) {
  switch (mention.type) {
    case "member":
      return {
        mentionType: "member",
        mentionId: mention.member.user_id,
        mentionLabel: memberLabel(mention.member),
        seed: mention.member.avatar_seed ?? null,
        color: null,
        icon: null,
      };
    case "issue":
      return {
        mentionType: "issue",
        mentionId: mention.issue.id,
        mentionLabel: mention.issue.identifier,
        seed: null,
        color: null,
        icon: null,
      };
    case "page":
      return {
        mentionType: "page",
        mentionId: mention.page.id,
        mentionLabel: mention.page.title,
        seed: null,
        color: null,
        icon: mention.page.icon,
      };
    case "project":
      return {
        mentionType: "project",
        mentionId: mention.project.id,
        mentionLabel: mention.project.name,
        seed: mention.project.avatarSeed,
        color: null,
        icon: mention.project.iconUrl,
      };
    case "objective":
      return {
        mentionType: "objective",
        mentionId: mention.objective.id,
        mentionLabel: mention.objective.name,
        seed: null,
        color: mention.objective.color,
        icon: null,
      };
    default:
      return {
        mentionType: "numo",
        mentionId: NUMO_MENTION_ID,
        mentionLabel: "Numo",
        seed: null,
        color: null,
        icon: null,
      };
  }
}
