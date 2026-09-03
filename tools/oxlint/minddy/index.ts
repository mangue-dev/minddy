import { eslintCompatPlugin } from "@oxlint/plugins";
import { noNativeTitleRule } from "./rules/no-native-title.ts";

const minddyPlugin = eslintCompatPlugin({
  meta: { name: "minddy" },
  rules: {
    "no-native-title": noNativeTitleRule,
  },
});

export default minddyPlugin;
