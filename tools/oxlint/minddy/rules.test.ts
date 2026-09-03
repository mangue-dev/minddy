import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import { noNativeTitleRule } from "./rules/no-native-title.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-native-title", noNativeTitleRule, {
  valid: [
    '<Tooltip><TooltipTrigger asChild><button /></TooltipTrigger></Tooltip>',
    '<iframe title="Document preview" />',
    '<Dialog title="Delete issue" />',
  ],
  invalid: [
    {
      code: '<button title="Delete" />',
      errors: [{ messageId: "nativeTitle" }],
    },
    {
      code: '<Button title="Delete" />',
      errors: [{ messageId: "nativeTitle" }],
    },
    {
      code: '<Link href="/" title="Home" />',
      errors: [{ messageId: "nativeTitle" }],
    },
  ],
});
