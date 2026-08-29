"use client";

import { useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { useTheme } from "mangue-ui/components/theme-provider";
import { Button, cn } from "mangue-ui";
import {
  FileArchive,
  FileText,
  MessageCircle,
  Moon,
  Plus,
  Send,
  Sun,
} from "lucide-react";
import {
  ResourcePills,
  type ResourceLike,
} from "@/components/resources";
import { Markdown } from "@/components/markdown";
import { PageEditor } from "@/components/pages/page-editor";
import { ContextPill } from "@/components/assistant/context-pill";
import {
  AdaptiveContextRow,
  ScrollableContextRow,
  type AdaptiveContextItem,
} from "@/components/assistant/adaptive-context-row";
import type { AssistantContextChip } from "@/lib/assistant-context";
import type { PendingResource } from "@/lib/use-attachment-uploads";

const IMAGE: ResourceLike = {
  id: "image",
  kind: "file",
  storage_path: "image",
  file_name: "dashboard-retina-capture.webp",
  mime_type: "image/webp",
  size_bytes: 1_842_176,
};

const PDF: ResourceLike = {
  id: "pdf",
  kind: "file",
  storage_path: "pdf",
  file_name: "product-brief.pdf",
  mime_type: "application/pdf",
  size_bytes: 428_032,
};

const TEXT: ResourceLike = {
  id: "text",
  kind: "file",
  storage_path: "text",
  file_name: "release-notes.txt",
  mime_type: "text/plain",
  size_bytes: 8_924,
};

const AUDIO: ResourceLike = {
  id: "audio",
  kind: "file",
  storage_path: "audio",
  file_name: "customer-interview.wav",
  mime_type: "audio/wav",
  size_bytes: 1_204_224,
};

const VIDEO: ResourceLike = {
  id: "video",
  kind: "file",
  storage_path: "video",
  file_name: "interaction-recording.mp4",
  mime_type: "video/mp4",
  size_bytes: 6_703_104,
};

const ARCHIVE: ResourceLike = {
  id: "archive",
  kind: "file",
  storage_path: "archive",
  file_name: "export-and-supporting-files.zip",
  mime_type: "application/zip",
  size_bytes: 12_845_056,
};

const CODE: ResourceLike = {
  id: "code",
  kind: "file",
  storage_path: "text",
  file_name: "attachment-preview.tsx",
  mime_type: "text/typescript",
  size_bytes: 14_336,
};

const JSON_FILE: ResourceLike = {
  id: "json",
  kind: "file",
  storage_path: "text",
  file_name: "sample-response.json",
  mime_type: "application/json",
  size_bytes: 4_096,
};

const SPREADSHEET: ResourceLike = {
  id: "spreadsheet",
  kind: "file",
  storage_path: "archive",
  file_name: "research-results.xlsx",
  mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size_bytes: 882_688,
};

const LINK: ResourceLike = {
  id: "link",
  kind: "link",
  file_name: "Minddy design reference",
  url: "https://minddy.app",
  icon_data_url: "/logo.svg",
};

const PAGE: ResourceLike = {
  id: "page",
  kind: "page",
  file_name: "Attachment redesign notes",
  page_id: "attachment-redesign-notes",
  page: {
    id: "attachment-redesign-notes",
    title: "Attachment redesign notes",
    icon: "🎨",
  },
  project_id: "debug-project",
};

const UNAVAILABLE_PAGE: ResourceLike = {
  id: "page-unavailable",
  kind: "page",
  file_name: "Archived research notes",
  page_id: "archived-research-notes",
  page: null,
  project_id: "debug-project",
};

const LONG_NAME: ResourceLike = {
  id: "long-name",
  kind: "file",
  storage_path: "image",
  file_name:
    "mobile-navigation-redesign-final-final-reviewed-on-a-very-narrow-screen.webp",
  mime_type: "image/webp",
  size_bytes: 2_548_736,
};

const UPLOADING: PendingResource = {
  localId: "uploading-demo",
  status: "uploading",
  kind: "file",
  file_name: "new-homepage-capture.png",
  storage_path: "",
  mime_type: "image/png",
  size_bytes: 3_412_992,
};

const BASE_RESOURCES = [IMAGE, PDF, ARCHIVE, LINK, PAGE];
const PREVIEW_RESOURCES = [IMAGE, PDF, TEXT, AUDIO, VIDEO];
const CONTEXT_RESOURCES = [IMAGE, PDF, ARCHIVE, CODE, JSON_FILE, SPREADSHEET];

const DEBUG_CONTEXT: AssistantContextChip[] = [
  {
    key: "issue",
    kind: "issue",
    label: "MIN-418",
    tooltip: "MIN-418 · Redesign attachment previews",
  },
  {
    key: "page",
    kind: "page",
    label: "Attachment research",
    tooltip: "Page · Attachment research",
  },
];

const PAGE_DOCUMENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Page attachments are independent blocks with their own layout and interactions.",
        },
      ],
    },
    {
      type: "image",
      attrs: {
        src: "/attachments-debug/assets/image",
        alt: "Dashboard capture inside a page",
        width: 65,
        uploadId: null,
      },
    },
    {
      type: "pageFile",
      attrs: {
        src: "/attachments-debug/assets/archive",
        name: "export-and-supporting-files.zip",
        size: 12_845_056,
        mime: "application/zip",
        uploadId: null,
      },
    },
  ],
};

function ignorePageChanges() {}

function demoFileHref(
  resource: ResourceLike,
  disposition: "preview" | "download",
): string {
  const asset = encodeURIComponent(resource.storage_path || "archive");
  const query = disposition === "download" ? "?download=1" : "";
  return `/attachments-debug/assets/${asset}${query}`;
}

function GallerySection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-10 first:border-t-0">
      <div className="mb-6 max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Surface({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">{note}</span>
      </div>
      {children}
    </article>
  );
}

function RemovablePills({
  initial = BASE_RESOURCES,
  pending,
  radius = "full",
  className,
  pillClassName,
}: {
  initial?: ResourceLike[];
  pending?: PendingResource[];
  radius?: "full" | "md";
  className?: string;
  pillClassName?: string;
}) {
  const [resources, setResources] = useState(initial);
  const [uploads, setUploads] = useState(pending ?? []);

  return (
    <ResourcePills
      resources={resources}
      pending={uploads}
      radius={radius}
      className={className}
      pillClassName={pillClassName}
      fileHref={demoFileHref}
      onRemove={(resource) =>
        setResources((current) => current.filter((item) => item.id !== resource.id))
      }
      onRemovePending={(localId) =>
        setUploads((current) => current.filter((item) => item.localId !== localId))
      }
    />
  );
}

function ThemeControl() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}

function DebugAdaptiveContext({
  align = "start",
  mode = "popover",
}: {
  align?: "start" | "end";
  mode?: "popover" | "scroll";
}) {
  const items: AdaptiveContextItem[] = [
    ...DEBUG_CONTEXT.map((chip) => ({
      key: `context:${chip.key}`,
      render: () => <ContextPill chip={chip} radius="md" className="shadow-none" />,
    })),
    ...CONTEXT_RESOURCES.map((resource) => ({
      key: `resource:${resource.id}`,
      render: () => (
        <ResourcePills
          resources={[resource]}
          className="flex-nowrap"
          pillClassName="shadow-none"
          fileHref={demoFileHref}
        />
      ),
    })),
  ];
  return mode === "scroll" ? (
    <ScrollableContextRow items={items} className="w-full" />
  ) : (
    <AdaptiveContextRow items={items} align={align} className="w-full" />
  );
}

export function AttachmentsDebugGallery() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">Attachment debug gallery</h1>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Temporary
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Public route · fake data · no writes</p>
          </div>
          <ThemeControl />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <GallerySection
          eyebrow="Shared component"
          title="Resource types and states"
          description="These are the current production pills. Open previewable files, hover to reveal remove actions, and compare unsupported downloads with links and pages."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Surface title="Complete resource set" note="Default · removable">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <RemovablePills pending={[UPLOADING]} />
              </div>
            </Surface>
            <Surface title="Edge cases" note="Long name · unavailable page">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <ResourcePills
                  resources={[LONG_NAME, UNAVAILABLE_PAGE]}
                  fileHref={demoFileHref}
                />
              </div>
            </Surface>
          </div>
        </GallerySection>

        <GallerySection
          eyebrow="Product contexts"
          title="Current surrounding layouts"
          description="The attachment component stays the same, but width, radius, density, background, and available actions change around it."
        >
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <Surface title="Issue property panel" note="Narrow · 360 px">
              <div className="w-full max-w-[360px] rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="mb-2 flex h-8 items-center justify-between">
                  <span className="text-xs text-muted-foreground">Resources</span>
                  <Button type="button" variant="ghost" size="icon-sm" className="rounded-full">
                    <Plus className="size-4" />
                    <span className="sr-only">Add a resource</span>
                  </Button>
                </div>
                <RemovablePills initial={[IMAGE, PDF, LINK, PAGE]} />
              </div>
            </Surface>

            <Surface title="Create dialog" note="Wide · 672 px">
              <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
                <RemovablePills initial={[IMAGE, LINK]} className="mb-3" />
                <p className="text-2xl font-semibold text-foreground">Polish attachment previews</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Review every format before changing the shared component.
                </p>
                <div className="mt-6 flex justify-end">
                  <Button size="sm">Create issue</Button>
                </div>
              </div>
            </Surface>

            <Surface title="Comment timeline" note="Content column · 768 px max">
              <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    CG
                  </span>
                  <span className="text-sm font-medium">Clement</span>
                  <span className="text-xs text-muted-foreground">Just now</span>
                </div>
                <p className="my-3 text-sm leading-6">
                  The image and product brief show the two cases we need to compare.
                </p>
                <RemovablePills initial={[IMAGE, PDF]} />
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <MessageCircle className="size-3.5" />
                  Reply
                </div>
              </div>
            </Surface>

            <Surface title="Numo or agent composer" note="Nested radius · 800 px max">
              <div className="w-full max-w-[800px] rounded-2xl border border-border bg-card shadow-sm">
                <div className="px-2.5 pt-2.5">
                  <DebugAdaptiveContext mode="scroll" />
                </div>
                <p className="min-h-16 px-4 pb-2 pt-3 text-sm text-muted-foreground">
                  Ask Numo to compare these references…
                </p>
                <div className="flex justify-end px-2.5 pb-2.5">
                  <Button type="button" size="icon-sm" className="rounded-full">
                    <Send className="size-4" />
                    <span className="sr-only">Send message</span>
                  </Button>
                </div>
              </div>
            </Surface>

            <Surface title="Sent user message" note="Shared pill · 85% max">
              <div className="flex min-h-36 items-start justify-end rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex w-[85%] max-w-md flex-col items-end gap-1">
                  <DebugAdaptiveContext align="end" />
                  <div className="rounded-xl bg-foreground px-4 py-2 text-sm leading-relaxed text-background">
                    Compare these files and summarize the differences.
                  </div>
                </div>
              </div>
            </Surface>

            <Surface title="Mobile pressure test" note="Fixed · 320 px">
              <div className="w-[320px] max-w-full rounded-xl border border-border bg-card p-3 shadow-sm">
                <RemovablePills initial={[LONG_NAME, PDF, LINK]} />
              </div>
            </Surface>
          </div>
        </GallerySection>

        <GallerySection
          eyebrow="Viewer"
          title="Preview renderer matrix"
          description="Each pill opens the same full-screen dialog with a different native browser renderer. The archive remains download-only."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PREVIEW_RESOURCES.map((resource) => (
              <div key={resource.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {resource.mime_type}
                </p>
                <ResourcePills resources={[resource]} fileHref={demoFileHref} />
              </div>
            ))}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FileArchive className="size-3.5" />
                Download only
              </div>
              <ResourcePills resources={[ARCHIVE]} fileHref={demoFileHref} />
            </div>
          </div>
        </GallerySection>

        <GallerySection
          eyebrow="Separate system"
          title="Page attachment blocks"
          description="Pages use dedicated image and file node views instead of ResourcePills. Images can be resized and opened full-screen; files use a full-width download row."
        >
          <div className="max-w-3xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <PageEditor
              initialContent={PAGE_DOCUMENT}
              onChange={ignorePageChanges}
              editable={false}
            />
          </div>
        </GallerySection>

        <GallerySection
          eyebrow="Separate system"
          title="Pull request markdown"
          description="PR attachments do not use ResourcePills. Images render inline at the comment width, while other files remain ordinary links."
        >
          <div className="max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" />
              Pull request comment
            </div>
            <Markdown className="text-sm text-foreground">
              {`Here is the current image attachment:\n\n![Dashboard capture](/attachments-debug/assets/image)\n\n[Download the supporting archive](/attachments-debug/assets/archive?download=1)`}
            </Markdown>
          </div>
        </GallerySection>
      </div>
    </main>
  );
}
