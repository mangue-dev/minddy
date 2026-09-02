import { cn } from "mangue-ui";
import { UserAvatar } from "@/components/user-avatar";
import { parseForgeLogin } from "@/lib/repo-providers";

/** A forge account avatar, with the softer square silhouette used for bots. */
export function ForgeUserAvatar({
  user,
  forceBot = false,
  className,
}: {
  user: { login: string; avatar_url: string | null } | null | undefined;
  forceBot?: boolean;
  className?: string;
}) {
  const bot = forceBot || parseForgeLogin(user?.login ?? "").isBot;
  return (
    <UserAvatar
      url={user?.avatar_url}
      seed={user?.login ?? "?"}
      shape={bot ? "rounded" : "circle"}
      className={cn(className)}
    />
  );
}
