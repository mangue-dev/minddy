"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { FileUp } from "lucide-react";

/**
 * La zone de dépôt du CSV, et le lien vers le gabarit — le seul geste de
 * l'étape « d'où l'on part ».
 *
 * Sortie du panneau des réglages quand le wizard d'import est né : les deux
 * surfaces déposent le même fichier, et un dropzone qui diverge est un dropzone
 * dont l'une des deux versions n'accepte plus le glisser-déposer.
 *
 * Les libellés gardent le namespace i18n `Settings` où ils sont nés.
 */
export function CsvDropzone({
  onFile,
  className,
  /** Plus haute dans le wizard, où elle a la place — et où elle est le geste. */
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
          // Redéposer le MÊME fichier après un retour en arrière doit relancer
          // la lecture : sans ce vidage, `change` ne part pas une seconde fois.
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
