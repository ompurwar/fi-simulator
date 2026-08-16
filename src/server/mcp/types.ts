/** MCP module shared types — the contract every tool definition and surface consumes. */

export interface ToolContext {
  user_id: string;
}

export type ToolError = { code: string; message: string; details?: unknown };

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: ToolError };

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, any>; // zod raw shape
  handler(ctx: ToolContext, args: Record<string, any>): Promise<ToolResult>;
}

export type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
