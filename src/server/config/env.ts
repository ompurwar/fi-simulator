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
  /** INDstocks trading API token (read-only use) — from indstocks.com/app/api-trading/access-tokens */
  INDSTOCKS_API_TOKEN: z.string().optional(),
  MCP_ENABLED: z.enum(["true", "false"]).default("true"),
  /** Comma-separated extra origins allowed to call /api/mcp from browsers (DNS-rebinding protection); server clients send no Origin and are always allowed. */
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Anthropic-format endpoint; works with any compatible gateway, e.g. DeepSeek: https://api.deepseek.com/anthropic */
  AI_BASE_URL: z.string().default("https://api.anthropic.com"),
  /** Anthropic-format model name; DeepSeek maps claude-* names or accepts deepseek-v4-flash/-pro directly */
  AI_MODEL: z.string().default("claude-3-5-sonnet-latest"),
  /** Google Gemini API configuration */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_BASE_URL: z.string().default("https://generativelanguage.googleapis.com"),
  FIPLAN_API_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
