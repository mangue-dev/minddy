"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { FileUp } from "lucide-react";

/**
 * The CSV drop zone, and the link to the template — the only gesture of
 * the “where we start from” stage.
 *
 * Exit from the settings panel when the import wizard is born: both
 * surfaces drop the same file, and a diverging dropzone is a dropzone
 * one of the two versions no longer accepts drag and drop.
 *
 * The labels keep the i18n namespace `Settings` where they were born.
 */
export function CsvDropzone({
  onFile,
  className,
  /** Higher in the wizard, where it has the place — and where it is the gesture. */
  size = "sm",
}: {
  onFile: (file: File) => void;
  className?: string;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("Settings");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const downloadTemplate = () => {
    const template = [
      "title,description,status,priority,effort,labels,due date,id,parent",
      '"Set up the landing page","First draft in Figma",todo,high,m,"design; marketing",2026-09-30,T-1,',
      '"Write the hero copy",,backlog,medium,s,marketing,,T-2,T-1',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "minddy-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Redepositing the SAME file after backtracking should restart
          // reading: without this dump, `change` does not leave a second time.
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed text-center outline-none transition-colors",
          size === "lg" ? "px-6 py-12" : "px-6 py-10",
          dragOver
            ? "border-ring bg-accent/40"
            : "border-border hover:border-ring/60 focus-visible:border-ring"
        )}
      >
        <FileUp
          className={cn("text-muted-foreground", size === "lg" ? "size-6" : "size-5")}
          aria-hidden
        />
        <p className="text-sm font-medium">{t("importDropTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("importDropHint")}</p>
      </div>
      <button
        type="button"
        onClick={downloadTemplate}
        className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {t("importTemplateLink")}
      </button>
    </div>
  );
}
