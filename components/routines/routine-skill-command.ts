import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterSlashItems, renderSlashMenu, type PageSlashItem } from "@/components/pages/page-slash-command";

/**
 * "$" in a routine's instruction: the shared "/" menu, listing the
 * repository's skills instead of blocks. `items` is read at each "$": the
 * skills can arrive after the editor is built.
 */
export const RoutineSkillCommand = Extension.create<{ items: () => PageSlashItem[] }>({
  name: "routineSkillCommand",

  addOptions() {
    return { items: () => [] };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<PageSlashItem>({
        editor: this.editor as never,
        // Its own key: the "/" menu and the "@" mentions live on the same editor.
        pluginKey: new PluginKey("routineSkillCommand"),
        char: "$",
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(this.options.items(), query),
        command: ({ editor, range, props }) => {
          if (!props.block) props.run(editor as unknown as Editor, range as Range);
        },
        render: renderSlashMenu,
      }),
    ];
  },
});
