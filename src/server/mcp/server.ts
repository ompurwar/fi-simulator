/** MCP server factory — wraps the tool registry in the SDK McpServer. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Container } from "../di/container";
import { makeToolRegistry } from "./registry";
import type { ToolContext } from "./types";

export interface McpServerOptions {
  /**
   * Static auth for transports with no middleware channel (stdio): the tool
   * handlers fall back to this context when extra.authInfo is absent.
   */
  staticAuth?: () => Promise<ToolContext | null>;
}

/** Build an McpServer exposing every registry tool, auth via extra.authInfo.extra.user_id. */
export function makeMcpServer(container: Container, options: McpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "fi-plan-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  for (const def of makeToolRegistry(container)) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: def.inputSchema },
      async (args: any, extra: any) => {
        const user_id = extra?.authInfo?.extra?.user_id;
        const ctx: ToolContext | null =
          user_id ? { user_id }
          : options.staticAuth ? await options.staticAuth()
          : null;
        if (!ctx) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: { code: "UNAUTHORIZED", message: "missing auth context" },
                }),
              },
            ],
            isError: true,
          };
        }
        try {
          const result = await def.handler(ctx, (args || {}) as Record<string, any>);
          return { content: [{ type: "text", text: JSON.stringify(result) }], isError: !result.ok };
        } catch (e: any) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: { code: "INTERNAL", message: String(e?.message || e) },
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}
