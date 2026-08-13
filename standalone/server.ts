/**
 * Standalone server — extraction proof.
 * The same buildContainer()/buildApp() used inside Next.js can boot on a raw
 * port with zero changes to the embedded server. Run with: npm run standalone
 */
import { createServer } from "http";
import { buildContainer } from "../src/server/di/container";
import { buildApp } from "../src/server/http/app";

async function main() {
  const container = await buildContainer();
  const app = buildApp(container);
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    app(
      new Request(url, {
        method: req.method,
        headers: req.headers as any,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : (req as any),
      })
    )
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      })
      .catch((err) => {
        console.error(err);
        res.writeHead(500);
        res.end("internal error");
      });
  });

  server.listen(port, () => {
    console.log(`[fi-plan-next] standalone server on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
