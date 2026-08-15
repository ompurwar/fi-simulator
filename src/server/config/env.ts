import { z } from "zod";

/**
 * Typed, validated environment. This is the single place env vars are read,
 * so the server core never touches process.env directly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production", "dev", "quality", "prod"]).default("development"),
  DB_URL: z.string().default("mongodb://localhost:27017"),
  DB_NAME: z.string().default("findependence"),
  CLIENT_APPLICATION: z.string().default("http://localhost"),
  DEFAULT_PLAN_DURATION: z.coerce.number().default(600),
  SESSION_TIMEOUT: z.coerce.number().default(24),
  PW_RESET_SESSION_LENGTH: z.coerce.number().default(30),
  COOKIE_SECRET: z.string().default("dev-cookie-secret"),
  COOKIE_SEC: z.string().default("dev-cookie-sec"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  PASSPORT_CALLBACK_URL: z.string().default("http://localhost:3000/api/oauth/google/callback"),
  MJ_APIKEY_PUBLIC: z.string().optional(),
  MJ_APIKEY_PRIVATE: z.string().optional(),
  SUPPORT_MAIL: z.string().optional(),
  MAILER_NAME: z.string().optional(),
  INDMONEY_MCP_URL: z.string().default("https://mcp.indmoney.com/mcp"),
  MCP_ENABLED: z.enum(["true", "false"]).default("true"),
  AI_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  FIPLAN_API_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
