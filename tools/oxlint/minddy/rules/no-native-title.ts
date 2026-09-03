import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const DOM_PROP_COMPONENTS = new Set([
  "Badge",
  "Button",
  "IconButton",
  "Link",
]);

function receivesDomTitle(name: ESTree.JSXElementName): boolean {
  if (name.type !== "JSXIdentifier") return false;
  if (name.name === "iframe") return false;
  return name.name[0] === name.name[0]?.toLowerCase() || DOM_PROP_COMPONENTS.has(name.name);
}

/** Require the shared app tooltip instead of the browser's delayed `title` UI. */
export const noNativeTitleRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow native title tooltips on DOM elements and DOM-prop UI primitives.",
    },
    messages: {
      nativeTitle:
        "Use the app Tooltip/AppTooltip components instead of a browser-native `title` tooltip.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "title") return;
        if (node.parent.type !== "JSXOpeningElement") return;
        if (!receivesDomTitle(node.parent.name)) return;
        context.report({ node, messageId: "nativeTitle" });
      },
    };
  },
});
