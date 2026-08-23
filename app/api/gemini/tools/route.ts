import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { buildContainer } from "@/server/di/container";
import { makeToolRegistry } from "@/server/mcp/registry";
import { convertJsonSchemaToGeminiSchema } from "@/server/ai/geminiProvider";

let containerPromise: Promise<Awaited<ReturnType<typeof buildContainer>>> | null = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = buildContainer().catch((err) => {
      console.error("[fi-plan] Gemini tools build container failed:", err);
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

/**
 * GET /api/gemini/tools
 * Exports all fi-plan MCP tools as Google Gemini functionDeclarations.
 * Direct consumption for Google AI Studio, Vertex AI, and Gemini SDKs.
 */
export async function GET(req: NextRequest) {
  const container = await getContainer();
  const registry = makeToolRegistry(container);

  const functionDeclarations = registry.map((tool) => {
    let jsonSchema: any = {};
    try {
      jsonSchema = toJsonSchemaCompat(z.object(tool.inputSchema));
    } catch {
      jsonSchema = { type: "object", properties: {} };
    }
    return {
      name: tool.name,
      description: tool.description || "",
      parameters: convertJsonSchemaToGeminiSchema(jsonSchema),
    };
  });

  return NextResponse.json({
    tools: [
      {
        functionDeclarations,
      },
    ],
    functionDeclarations,
  });
}
