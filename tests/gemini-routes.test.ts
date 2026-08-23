import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { buildContainer } from "@/server/di/container";
import { NextRequest } from "next/server";

let mongo: MongoMemoryServer;
let getTools: any;
let postExecute: any;
let getOpenApi: any;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.DB_URL = mongo.getUri();
  process.env.DB_NAME = "fi_plan_test_gemini";
  process.env.COOKIE_SECRET = "test-cookie-secret";
  process.env.CLIENT_APPLICATION = "http://localhost:3000";

  const toolsModule = await import("../app/api/gemini/tools/route");
  const executeModule = await import("../app/api/gemini/execute/route");
  const openApiModule = await import("../app/api/gemini/openapi.json/route");

  getTools = toolsModule.GET;
  postExecute = executeModule.POST;
  getOpenApi = openApiModule.GET;
});

afterAll(async () => {
  if (mongo) await mongo.stop();
});

describe("Google Gemini HTTP Endpoints", () => {
  let container: Awaited<ReturnType<typeof buildContainer>>;
  let user_id: string;
  let token: string;

  beforeAll(async () => {
    container = await buildContainer();
    const session = await container.app.Signup({
      email: `gemini-${Date.now()}@test.com`,
      password: "secret123",
      first_name: "Gemini",
      last_name: "Tester",
    });
    user_id = session.user_id;
    const created = await container.app.CreateApiToken({ user_id, name: "gemini-agent" });
    token = created.api_token;
  });

  describe("GET /api/gemini/tools", () => {
    it("returns all tools in Gemini functionDeclarations format", async () => {
      const res = await getTools(new NextRequest("http://localhost:3000/api/gemini/tools"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.tools).toBeDefined();
      expect(Array.isArray(json.tools[0].functionDeclarations)).toBe(true);

      const names = json.tools[0].functionDeclarations.map((d: any) => d.name);
      expect(names).toContain("list_plans");
      expect(names).toContain("create_plan");
      expect(names).toContain("networth_status");

      // Verify parameter schema format
      const listPlans = json.tools[0].functionDeclarations.find((d: any) => d.name === "list_plans");
      expect(listPlans.parameters.type).toBe("OBJECT");
    });
  });

  describe("POST /api/gemini/execute", () => {
    it("rejects missing Authorization header with 401", async () => {
      const res = await postExecute(
        new NextRequest("http://localhost:3000/api/gemini/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "list_plans", args: {} }),
        })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects invalid Bearer token with 401", async () => {
      const res = await postExecute(
        new NextRequest("http://localhost:3000/api/gemini/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer fp_invalidtoken123",
          },
          body: JSON.stringify({ name: "list_plans", args: {} }),
        })
      );
      expect(res.status).toBe(401);
    });

    it("executes a tool using direct { name, args } payload with valid token", async () => {
      const res = await postExecute(
        new NextRequest("http://localhost:3000/api/gemini/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: "list_plans", args: {} }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.name).toBe("list_plans");
      expect(Array.isArray(json.response)).toBe(true);
    });

    it("executes a tool using Gemini { functionCall: { name, args } } payload", async () => {
      const res = await postExecute(
        new NextRequest("http://localhost:3000/api/gemini/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            functionCall: {
              name: "create_plan",
              args: { title: "Gemini Retirement Plan", monthly_income: 150000, monthly_expense: 50000 },
            },
          }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.name).toBe("create_plan");
      expect(json.functionResponse.response.title).toBe("Gemini Retirement Plan");
    });

    it("returns 404 for unknown tool name", async () => {
      const res = await postExecute(
        new NextRequest("http://localhost:3000/api/gemini/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: "non_existent_tool", args: {} }),
        })
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("UNKNOWN_TOOL");
    });
  });

  describe("GET /api/gemini/openapi.json", () => {
    it("returns a valid OpenAPI 3.0 specification", async () => {
      const res = await getOpenApi(new NextRequest("http://localhost:3000/api/gemini/openapi.json"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.openapi).toBe("3.0.3");
      expect(json.info.title).toContain("Gemini");
      expect(json.paths["/api/gemini/execute"]).toBeDefined();
      expect(json.components.securitySchemes.BearerAuth).toBeDefined();
      expect(json.components.schemas.list_plans).toBeDefined();
    });
  });
});
