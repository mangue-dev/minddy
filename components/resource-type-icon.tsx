import {
  Braces,
  FileArchive,
  FileAudio,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  ImageIcon,
  Paperclip,
  Presentation,
} from "lucide-react";
import { cn } from "mangue-ui";

/** Colored file-kind icon shared by attachment pills and page file blocks. */
export function ResourceTypeIcon({
  mime,
  name,
  className,
}: {
  mime: string;
  name: string;
  className?: string;
}) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const type = (() => {
    if (
      mime.startsWith("image/") ||
      ["avif", "gif", "heic", "jpeg", "jpg", "png", "svg", "webp"].includes(
        extension,
      )
    ) {
      return { Icon: ImageIcon, color: "text-fuchsia-500 dark:text-fuchsia-400" };
    }
    if (mime === "application/pdf" || extension === "pdf") {
      return { Icon: FileText, color: "text-red-500 dark:text-red-400" };
    }
    if (
      mime === "text/csv" ||
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      ["csv", "numbers", "ods", "xls", "xlsx"].includes(extension)
    ) {
      return {
        Icon: FileSpreadsheet,
        color: "text-emerald-600 dark:text-emerald-400",
      };
    }
    if (
      mime.startsWith("audio/") ||
      ["aac", "flac", "m4a", "mp3", "ogg", "wav"].includes(extension)
    ) {
      return { Icon: FileAudio, color: "text-pink-500 dark:text-pink-400" };
    }
    if (
      mime.startsWith("video/") ||
      ["avi", "mkv", "mov", "mp4", "webm"].includes(extension)
    ) {
      return { Icon: FileVideo, color: "text-violet-500 dark:text-violet-400" };
    }
    if (
      mime.includes("zip") ||
      ["7z", "gz", "rar", "tar", "zip"].includes(extension)
    ) {
      return { Icon: FileArchive, color: "text-amber-600 dark:text-amber-400" };
    }
    if (extension === "json") {
      return { Icon: Braces, color: "text-amber-500 dark:text-amber-400" };
    }
    if (
      mime.includes("javascript") ||
      ["css", "go", "html", "js", "jsx", "py", "rs", "sql", "ts", "tsx", "vue"].includes(
        extension,
      )
    ) {
      return { Icon: FileCode2, color: "text-sky-600 dark:text-sky-400" };
    }
    if (
      mime.includes("presentation") ||
      ["key", "odp", "ppt", "pptx"].includes(extension)
    ) {
      return { Icon: Presentation, color: "text-orange-600 dark:text-orange-400" };
    }
    if (
      mime.includes("word") ||
      ["doc", "docx", "odt", "rtf"].includes(extension)
    ) {
      return { Icon: FileType2, color: "text-blue-600 dark:text-blue-400" };
    }
    if (mime.startsWith("text/") || ["log", "md", "txt"].includes(extension)) {
      return { Icon: FileText, color: "text-sky-600 dark:text-sky-400" };
    }
    return { Icon: Paperclip, color: "text-muted-foreground" };
  })();

  return (
    <type.Icon className={cn("shrink-0", type.color, className)} aria-hidden />
  );
}
