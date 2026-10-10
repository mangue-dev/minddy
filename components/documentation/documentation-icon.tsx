import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AiAutoRotateIcon, Analytics01Icon, ApiIcon, BookOpen01Icon, BotIcon,
  Calendar01Icon, CheckmarkCircle01Icon, CloudServerIcon, CodeSimpleIcon,
  Compass01Icon, ComputerIcon, DatabaseIcon, Delete02Icon, File02Icon,
  FilterIcon, FlowIcon, Folder01Icon, GitBranchIcon, GitPullRequestIcon,
  InboxIcon, LockIcon, Mail01Icon, MessageMultiple01Icon, PlugIcon,
  Rocket01Icon, ServerStack01Icon, Share01Icon, ShieldCheckIcon,
  Shield01Icon, StickyNote02Icon, Target01Icon, Upload01Icon,
  UserGroupIcon, UserIcon, WorkflowSquare01Icon, Wrench01Icon,
  Layout3ColumnIcon,
} from "@hugeicons/core-free-icons";
import { NumoFace } from "@/components/numo-face";

/** Stable article IDs share the same feature icon across languages and surfaces. */
const articleIcons: Record<string, IconSvgElement> = {
  accounts: UserIcon,
  "ai-settings-and-usage": BotIcon,
  "api-and-webhooks": ApiIcon,
  applications: ComputerIcon,
  "architecture-and-data-flows": Share01Icon,
  "authentication-and-email": Mail01Icon,
  "automation-settings": FlowIcon,
  "backups-and-restoration": DatabaseIcon,
  "choose-an-instance": CloudServerIcon,
  "code-work": GitPullRequestIcon,
  databases: DatabaseIcon,
  "encryption-and-data-boundaries": ShieldCheckIcon,
  feedback: MessageMultiple01Icon,
  "first-project": Rocket01Icon,
  git: GitBranchIcon,
  "glossary-and-data-model": WorkflowSquare01Icon,
  "install-locally": ComputerIcon,
  installation: CheckmarkCircle01Icon,
  "instance-administration": Shield01Icon,
  "instance-configuration": ServerStack01Icon,
  "integration-troubleshooting": PlugIcon,
  issues: Layout3ColumnIcon,
  "minddy-mcp": PlugIcon,
  navigation: Compass01Icon,
  "notifications-and-inbox": InboxIcon,
  objectives: Target01Icon,
  pages: File02Icon,
  "permissions-and-public-links": UserGroupIcon,
  "personal-cycle": AiAutoRotateIcon,
  "personal-statistics": Analytics01Icon,
  projects: Folder01Icon,
  "repository-skills": CodeSimpleIcon,
  "scheduled-routines": Calendar01Icon,
  "self-hosted-diagnostics": Wrench01Icon,
  "storage-and-attachments": Upload01Icon,
  "task-notebook": StickyNote02Icon,
  "transfer-between-instances": Share01Icon,
  "trash-and-recovery": Delete02Icon,
  "update-an-instance": AiAutoRotateIcon,
  views: FilterIcon,
  "workspace-encryption": LockIcon,
};

export function DocumentationIcon({ articleId, className }: { articleId: string | null; className?: string }) {
  // Numo uses the app's own mascot rather than a generic assistant symbol.
  if (articleId === "numo") return <NumoFace className={className} />;
  return <HugeiconsIcon icon={articleIcons[articleId ?? ""] ?? BookOpen01Icon} className={className} aria-hidden />;
}
