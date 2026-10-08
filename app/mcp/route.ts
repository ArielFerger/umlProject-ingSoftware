import { z } from "zod";
import { diagramInput } from "@/lib/diagrams";
import { createDiagram, getDiagram, listDiagrams, ownerFrom, saveDiagram, StoreError } from "@/lib/store";

const properties = {
  name: { type: "string" }, type: { type: "string", enum: ["class", "sequence", "state", "activity", "usecase", "component", "er"] },
  project: { type: "string" }, source: { type: "string", description: "Complete Mermaid source for the diagram." },
  theme: { type: "string", enum: ["studio", "neutral", "dark"] }, notes: { type: "string" },
};
const tools = [
  { name: "list_diagrams", description: "List the user's saved UML diagrams with their IDs and revisions.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "get_diagram", description: "Read a UML diagram and its complete editable Mermaid source. Read before editing.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, annotations: { readOnlyHint: true } },
  { name: "create_diagram", description: "Create a UML diagram in the user's workspace.", inputSchema: { type: "object", properties, required: ["name", "type", "project", "source"] } },
  { name: "update_diagram", description: "Update a diagram requested by the user. Read it first, preserve its fields, and supply its current revision to avoid overwriting newer edits. Mermaid source is the canonical diagram representation.", inputSchema: { type: "object", properties: { ...properties, id: { type: "string" }, revision: { type: "integer" } }, required: ["id", "revision", "name", "type", "project", "source"] } },
];

export async function POST(request: Request) {
  let id: unknown = null;
  try {
    const message = await request.json() as { id?: unknown; method: string; params?: { name?: string; arguments?: unknown; protocolVersion?: string } };
    id = message.id ?? null;
    if (message.method.startsWith("notifications/")) return new Response(null, { status: 202 });
    const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
    if (message.method === "initialize") return reply({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "UML Studio", version: "1.0.0" } });
    if (message.method === "ping") return reply({});
    if (message.method === "tools/list") return reply({ tools });
    if (message.method !== "tools/call") return Response.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    const owner = ownerFrom(request);
    let result: unknown;
    const args = message.params?.arguments;
    switch (message.params?.name) {
      case "list_diagrams": result = await listDiagrams(owner); break;
      case "get_diagram": result = await getDiagram(owner, z.object({ id: z.string().min(1) }).parse(args).id); break;
      case "create_diagram": result = await createDiagram(owner, diagramInput.parse(args)); break;
      case "update_diagram": {
        const data = diagramInput.extend({ id: z.string().min(1), revision: z.number().int().positive() }).parse(args);
        result = await saveDiagram(owner, data.id, data, data.revision); break;
      }
      default: throw new StoreError("Unknown tool", 400);
    }
    return reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
  } catch (error) {
    const status = error instanceof StoreError ? error.status : 400;
    const text = error instanceof Error ? error.message : "Invalid request";
    if (status === 401 || status === 403) return Response.json({ error: text }, { status });
    return Response.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });
  }
}
export function GET() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
