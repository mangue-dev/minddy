import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";

import { noObjectParametersRule } from "./rules/no-object-parameters.ts";
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-object-parameters", noObjectParametersRule, {
  valid: [
    "interface Input { id: string }\nfunction read(input: Input): string { return input.id; }",
    `
      type Input = object;
      function owner(): void {
        type Input = { id: string };
        function read(input: Input): void {}
      }
    `,
  ],
  invalid: [
    {
      code: "function read(input: object): void {}",
      errors: [{ messageId: "objectParameter" }],
    },
    {
      code: `
        function owner(): void {
          type Input = object;
          function read(input: Input): void {}
        }
      `,
      errors: [{ messageId: "objectParameter" }],
    },
    {
      code: `
        type Input = { id: string };
        function owner(): void {
          type Input = object;
          function read(input: Input): void {}
        }
      `,
      errors: [{ messageId: "objectParameter" }],
    },
    {
      code: `
        namespace Api {
          export type Input = object;
          export function read(input: Input): void {}
        }
      `,
      errors: [{ messageId: "objectParameter" }],
    },
  ],
});

tester.run("no-unknown-type-aliases", noUnknownTypeAliasesRule, {
  valid: ["type Payload = string | number;"],
  invalid: [
    {
      code: "type Payload = unknown;",
      errors: [{ messageId: "unknownAlias" }],
    },
    {
      code: "type Payload = string | unknown;",
      errors: [{ messageId: "unknownAlias" }],
    },
    {
      code: "type UnknownValue = unknown; type Payload = string | UnknownValue;",
      errors: [{ messageId: "unknownAlias" }, { messageId: "unknownAlias" }],
    },
  ],
});
