import { z } from "zod";

export const mcpConnectionId = z.uuid();
export const mcpEndpoint = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      ![...url.searchParams.keys()].some((key) =>
        /token|secret|password|api.?key|authorization/i.test(key),
      )
    );
  });
const token = z
  .string()
  .trim()
  .max(4096)
  .regex(/^[A-Za-z0-9._~+/-]*=*$/);
export const mcpConnectionInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: mcpEndpoint,
    token: token.optional(),
    transport: z.enum(["http", "sse"]).optional(),
    auth_mode: z.enum(["none", "bearer", "oauth"]).optional(),
    oauth_client_id: z.string().trim().max(1024).optional(),
    oauth_client_secret: z.string().trim().max(4096).optional(),
    headers: z
      .record(
        z.string().regex(/^[A-Za-z0-9-]+$/),
        z
          .string()
          .max(4096)
          .regex(/^[^\r\n]*$/),
      )
      .refine(
        (headers) =>
          Object.keys(headers).length <= 16 &&
          Object.keys(headers).every(
            (key) =>
              !/^(host|cookie|authorization|proxy-authorization|content-length|content-type|accept|connection|transfer-encoding|mcp-.*)$/i.test(
                key,
              ),
          ),
      )
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export const mcpConnectionPatch = mcpConnectionInput
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export interface McpConnection {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  has_token: boolean;
  has_headers: boolean;
  transport: "http" | "sse";
  auth_mode: "none" | "bearer" | "oauth";
  oauth_connected: boolean;
  created_at: string;
}
