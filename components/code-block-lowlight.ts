import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { AnyExtension, NodeViewRenderer } from "@tiptap/core";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);
export type CodeBlockLowlight = ReturnType<typeof createLowlight>;

export interface CodeBlockLabels {
  copy: string;
  copied: string;
  language: string;
}

/* The register is also mounted headless, so it cannot use next-intl directly.
   Browser surfaces provide their catalog strings before creating an editor. */
const labels: CodeBlockLabels = {
  copy: "Copy",
  copied: "Copied",
  language: "Code language",
};

export function setCodeBlockLabels(next: CodeBlockLabels): void {
  labels.copy = next.copy;
  labels.copied = next.copied;
  labels.language = next.language;
}

export function createHighlightedCodeBlock(
  highlightLowlight: CodeBlockLowlight,
  nodeView?: NodeViewRenderer,
): AnyExtension {
  return CodeBlockLowlight.configure({
    lowlight: highlightLowlight,
    defaultLanguage: "plaintext",
  }).extend({
    renderHTML({ node, HTMLAttributes }) {
      const language = node.attrs.language as string | null | undefined;
      return [
        "pre",
        { ...HTMLAttributes, "data-language": language || undefined },
        ["code", { class: language ? `language-${language}` : undefined }, 0],
      ];
    },
    addNodeView() {
      return nodeView ?? codeBlockNodeView;
    },
  });
}

export function withCodeBlockNodeView(
  nodeView: NodeViewRenderer,
  highlightLowlight: CodeBlockLowlight = lowlight,
): AnyExtension {
  return createHighlightedCodeBlock(highlightLowlight, nodeView);
}

/**
 * The TipTap code block, WITH syntax highlighting — the editor-side twin of
 * <CodeBlock> (components/code-block.tsx, Shiki on read-only Markdown surfaces).
 * Same node name (`codeBlock`) and same `language` attribute as the stock
 * extension, so markdown storage and round-trips are unchanged; only the
 * rendering gains hljs token classes.
 *
 * The static HTML representation also mirrors the language on a
 * `data-language` attribute of the `<pre>`; the live node view uses the same
 * value for its header badge while the content is being retyped.
 */
export const HighlightedCodeBlock = createHighlightedCodeBlock(lowlight);

/**
 * Adds the small piece of chrome that a DOM-only TipTap node view can provide:
 * a language label and a copy button. The code element remains the
 * `contentDOM`, so ProseMirror and lowlight keep ownership of the editable
 * text and its syntax decorations.
 */
const codeBlockNodeView: NodeViewRenderer = ({
  node,
  HTMLAttributes,
  editor,
  view,
  getPos,
}) => {
  const dom = document.createElement("div");
  dom.className = "code-block-node-view";

  const header = document.createElement("div");
  header.className = "code-block-node-header";

  const languageInput = document.createElement("input");
  languageInput.type = "text";
  languageInput.autocomplete = "off";
  languageInput.spellcheck = false;
  languageInput.className = "code-block-node-language";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "code-block-node-copy";

  const pre = document.createElement("pre");
  Object.entries(HTMLAttributes).forEach(([name, value]) => {
    if (value != null) pre.setAttribute(name, String(value));
  });

  const code = document.createElement("code");
  pre.append(code);
  header.append(languageInput, copyButton);
  dom.append(header, pre);

  let currentNode = node;
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  const copyIcon = (copied: boolean) => {
    copyButton.innerHTML = copied
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyButton.dataset.copied = copied ? "true" : "false";
  };

  const updateLanguage = () => {
    const language =
      typeof currentNode.attrs.language === "string"
        ? currentNode.attrs.language
        : "";
    if (languageInput.value !== language) languageInput.value = language;
    languageInput.setAttribute("aria-label", labels.language);
    languageInput.title = labels.language;
    languageInput.readOnly = !editor.isEditable;
    copyButton.setAttribute("aria-label", labels.copy);
    copyButton.title = labels.copy;
    copyIcon(false);
    if (language) {
      code.className = `language-${language}`;
    } else {
      code.removeAttribute("class");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      copyButton.setAttribute("aria-label", labels.copied);
      copyButton.title = labels.copied;
      copyIcon(true);
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyButton.setAttribute("aria-label", labels.copy);
        copyButton.title = labels.copy;
        copyIcon(false);
      }, 2000);
    } catch {
      // Clipboard access can be unavailable in a non-secure or restricted context.
    }
  };

  const updateLanguageAttribute = () => {
    if (!editor.isEditable) return;
    const position = getPos();
    if (position == null) return;
    const language = languageInput.value.trim().toLowerCase();
    const currentLanguage =
      typeof currentNode.attrs.language === "string"
        ? currentNode.attrs.language
        : "";
    if (language === currentLanguage) return;
    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, {
        ...currentNode.attrs,
        language: language || null,
      }),
    );
  };

  copyButton.addEventListener("mousedown", (event) => event.preventDefault());
  copyButton.addEventListener("click", () => void copy());
  languageInput.addEventListener("input", updateLanguageAttribute);
  updateLanguage();

  return {
    dom,
    contentDOM: code,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false;
      currentNode = nextNode;
      updateLanguage();
      return true;
    },
    stopEvent: (event) =>
      copyButton.contains(event.target as Node) ||
      languageInput.contains(event.target as Node),
    ignoreMutation: (mutation) => !code.contains(mutation.target as Node),
    destroy: () => clearTimeout(copyResetTimer),
  };
};
