import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry } from "@/server/mcp/registry";

let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] OpenAPI build container failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

/**
 * GET /api/gemini/openapi.json
 * Generates an OpenAPI 3.0 specification for all fi-plan tools.
 * Enables Google Gemini Custom Extensions, Vertex AI, and third-party agent frameworks.
 */
export async function GET(req: NextRequest) {
  const container = await getContainer();
  const registry = makeToolRegistry(container);

  const baseUrl = container.env.CLIENT_APPLICATION.replace(/\/$/, "");

  const paths: Record<string, any> = {
    "/api/gemini/execute": {
      post: {
        summary: "Execute any Fi-Plan financial planning tool",
        description: "Executes the specified tool with arguments for the authenticated user.",
        operationId: "executeTool",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    description: "The name of the tool to execute",
                    enum: registry.map((t) => t.name),
                  },
                  args: {
                    type: "object",
                    description: "Input parameters for the tool",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful tool execution",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    name: { type: "string" },
                    response: { type: "object" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized (invalid or missing API token)",
          },
        },
      },
    },
  };

  const schemas: Record<string, any> = {};

  for (const tool of registry) {
    let schema: any = { type: "object", properties: {} };
    try {
      schema = toJsonSchemaCompat(z.object(tool.inputSchema));
    } catch {
      // fallback
    }
    schemas[tool.name] = {
      description: tool.description,
      ...schema,
    };
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Fi-Plan Google Gemini Tools API",
      version: "1.0.0",
      description: "API for Google Gemini and Vertex AI agents to inspect, manage, and simulate financial plans, cashflows, loans, tax rules, and net worth.",
    },
    servers: [
      {
        url: baseUrl,
        description: "Fi-Plan Server",
      },
    ],
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "fp_*",
          description: "Fi-Plan API token (fp_*) or OAuth access token (fp_oa_*)",
        },
      },
      schemas,
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
