/** MCP server factory — wraps the tool registry in the SDK McpServer. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Container } from "../di/container";
import { makeToolRegistry } from "./registry";

/** Build an McpServer exposing every registry tool, auth via extra.authInfo.extra.user_id. */
export function makeMcpServer(container: Container): McpServer {
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
        if (!user_id) {
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
          const result = await def.handler({ user_id }, (args || {}) as Record<string, any>);
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
