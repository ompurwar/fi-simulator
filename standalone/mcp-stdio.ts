/**
 * Standalone MCP server over stdio — for local agents (Claude Code / Claude
 * Desktop `mcp add`). Run with: npm run mcp:stdio
 *
 * Auth: single-user mode — the raw API token comes from FIPLAN_API_TOKEN env;
 * the container is built the same way as inside Next.js (needs DB_URL etc).
 */
import { buildContainer } from "../src/server/di/container";
import { makeMcpServer, resolveApiToken } from "../src/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  const container = await buildContainer();

  const token = process.env.FIPLAN_API_TOKEN;
  let staticAuth;
  if (token) {
    try {
      const ctx = await resolveApiToken(container, token);
      staticAuth = () => Promise.resolve(ctx);
    } catch (err) {
      console.error(`[fi-plan] invalid FIPLAN_API_TOKEN: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  const server = makeMcpServer(container, { staticAuth });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[fi-plan] MCP stdio server ready${staticAuth ? " (authenticated)" : " (unauthenticated — set FIPLAN_API_TOKEN)"}`
  );
}

main().catch((err) => {
  console.error("[fi-plan] MCP stdio server failed:", err);
  process.exit(1);
});
