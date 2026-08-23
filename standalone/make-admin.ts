/**
 * make:admin — promote a user to the admin role (required to call admin-gated
 * MCP tools like upsert_tax_rules / update_presets).
 *
 * Usage (needs DB_URL, DB_NAME in env):
 *   npm run make:admin -- --email me@example.com
 */
import { buildContainer } from "../src/server/di/container";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
  };
  const email = flag("email") || args[0];

  if (!email) {
    console.error("usage: npm run make:admin -- --email <you@example.com>");
    process.exit(1);
  }

  const container = await buildContainer();
  const [user] = await container.user_list.FindByEmail(email);
  if (!user) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }

  const { success } = await container.user_list.Update({
    _id: user._id.toString(),
    role: "admin",
  });
  if (!success) {
    console.error(`failed to promote ${email}`);
    process.exit(1);
  }
  console.log(`promoted to admin: ${email} (${user._id.toString()})`);
}

main().catch((err) => {
  console.error(`[make:admin] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
