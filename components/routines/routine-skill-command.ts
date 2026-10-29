import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterSlashItems, renderSlashMenu, type PageSlashItem } from "@/components/pages/page-slash-command";
import {
  SUGGESTION_CHIP_CLASS,
  SUGGESTION_CHIP_EMPTY_CLASS,
  suggestionPlaceholder,
} from "@/components/editor/suggestion-chip";

/**
 * "$" in a routine's instruction: the shared "/" menu, listing the
 * repository's skills instead of blocks. `items` is read at each "$": the
 * skills can arrive after the editor is built.
 */
export const RoutineSkillCommand = Extension.create<{
  items: () => PageSlashItem[];
  /** The muted “Type to search” after an empty “$”. */
  placeholder?: () => string;
}>({
  name: "routineSkillCommand",

  addOptions() {
    return { items: () => [] };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("routineSkillCommand");
    return [
      Suggestion<PageSlashItem>({
        editor: this.editor as never,
        // Its own key: the "/" menu and the "@" mentions live on the same editor.
        pluginKey,
        char: "$",
        allowSpaces: false,
        decorationClass: SUGGESTION_CHIP_CLASS,
        decorationEmptyClass: SUGGESTION_CHIP_EMPTY_CLASS,
        items: ({ query }) => filterSlashItems(this.options.items(), query),
        command: ({ editor, range, props }) => {
          if (!props.block) props.run(editor as unknown as Editor, range as Range);
        },
        render: () => renderSlashMenu(pluginKey),
      }),
      suggestionPlaceholder(pluginKey, "routineSkillCommand", () => this.options.placeholder?.()),
    ];
  },
});
