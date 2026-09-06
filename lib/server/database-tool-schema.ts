import "server-only";

import { z } from "zod";
import { DATABASE_PROPERTY_TYPES } from "@/lib/page-databases";

/** Shared model contract for MCP, Numo chat, and the coding agent. */
export function databaseToolDescription(readTool: string): string {
  return DESCRIPTION.replaceAll("get_page", readTool);
}

const DESCRIPTION = "Update a database schema or one entry property. Read get_page first. For schema, send the FULL schema preserving existing properties/options and its database_revision as revision; option ids are stable UUIDs, names are unique per property, colors are #RRGGBB. Removing a property or option clears its entry values. For value, use the entry page_id and exact previous value as expected (null when empty). Number values must be finite JSON numbers, select is one option id, multi_select an array of option ids, people an array of project member ids, date YYYY-MM-DD, checkbox boolean, text string; null clears. created_at is read-only metadata. To change a column type, use operation=convert with the database page_id, propertyId, targetType, revision, optional new name, and preview=true. Inspect totalCount and incompatibleCount; then apply the SAME settings with preview=false and the returned token. Set confirmLoss=true only after the user authorizes clearing incompatible values. Never change a type through schema. A stale edit is refused: reread and reapply, never overwrite blindly.";

const value = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const columnName = z.string().min(1).max(80);
export const DATABASE_TOOL_SCHEMA = z.object({
  page_id: z.string().uuid(),
  operation: z.enum(["schema", "value", "convert"]),
  revision: z.number().int().nonnegative().optional(),
  titleName: columnName.nullable().optional(),
  schema: z.array(z.object({
    id: z.string().uuid(),
    name: columnName,
    type: z.enum(DATABASE_PROPERTY_TYPES),
    options: z.array(z.object({
      id: z.string().uuid(),
      name: columnName,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })).max(100).optional(),
  })).max(30).optional(),
  propertyId: z.string().uuid().optional(),
  value: value.optional(),
  expected: value.optional(),
  targetType: z.enum(DATABASE_PROPERTY_TYPES).optional(),
  preview: z.boolean().optional(),
  token: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  confirmLoss: z.boolean().optional(),
  name: columnName.optional(),
});

const jsonSchema = z.toJSONSchema(DATABASE_TOOL_SCHEMA);
export const DATABASE_TOOL_PARAMETERS: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: jsonSchema.properties ?? {},
  required: jsonSchema.required ?? [],
};
