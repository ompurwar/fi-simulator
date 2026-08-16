/** Tool registry — the single source of tool definitions consumed by MCP and the in-app assistant. */

import type { Container } from "../di/container";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";
import { makePlanTools } from "./tools/plans";
import { makeEngineTools } from "./tools/engine";
import { makeCashflowTools } from "./tools/cashflows";
import { makeChangeTools } from "./tools/changes";
import { makeLoanTools } from "./tools/loans";
import { makeNetWorthTools } from "./tools/networth";
import { makeIndStocksTools } from "./tools/indstocks";
import { makeShareTools } from "./tools/share";

/** Build the ordered registry: identity/plans, engine, cashflows, changes, loans, networth, indstocks, share. */
export function makeToolRegistry(container: Container): ToolDefinition[] {
  return [
    ...makePlanTools(container),
    ...makeEngineTools(container),
    ...makeCashflowTools(container),
    ...makeChangeTools(container),
    ...makeLoanTools(container),
    ...makeNetWorthTools(container),
    ...makeIndStocksTools(container),
    ...makeShareTools(container),
  ];
}

/** Invoke a registry tool by name, wrapping any thrown error into an envelope. */
export async function callRegistryTool(
  registry: ToolDefinition[],
  ctx: ToolContext,
  name: string,
  args: Record<string, any>
): Promise<ToolResult> {
  const definition = registry.find((tool) => tool.name === name);
  if (!definition) {
    return { ok: false, error: { code: "UNKNOWN_TOOL", message: `unknown tool: ${name}` } };
  }
  try {
    return await definition.handler(ctx, args);
  } catch (e: any) {
    return { ok: false, error: { code: "TOOL_ERROR", message: String(e?.message || e) } };
  }
}
