import { diagramInput } from "@/lib/diagrams";
import { createDiagram, deleteDiagram, getDiagram, getHistory, listDiagrams, listVersions, ownerFrom, saveDiagram, StoreError } from "@/lib/store";
import { z } from "zod";

const updateInput = diagramInput.extend({ id: z.string().min(1).max(300), revision: z.number().int().positive() });
const createInput = diagramInput.extend({ projectOwner: z.string().min(1).max(300).optional() });
const deleteInput = z.object({ id: z.string().min(1).max(300), revision: z.number().int().positive() });

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Revisa el nombre y los datos del diagrama.", details: error.flatten() }, { status: 400 });
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Diagram storage", error);
  return Response.json({ error: "No pudimos acceder al almacenamiento. Tu editor conserva los cambios; reintenta en unos segundos." }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const owner = ownerFrom(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id && url.searchParams.has("versions")) return Response.json(await listVersions(owner), { headers: { "Cache-Control": "no-store" } });
    const result = id ? (url.searchParams.has("history") ? await getHistory(owner, id) : await getDiagram(owner, id)) : await listDiagrams(owner);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const data = createInput.parse(await request.json());
    return Response.json(await createDiagram(ownerFrom(request), data, data.projectOwner), { status: 201 });
  }
  catch (e) { return errorResponse(e); }
}
export async function PUT(request: Request) {
  try {
    const owner = ownerFrom(request);
    const data = updateInput.parse(await request.json());
    return Response.json(await saveDiagram(owner, data.id, data, data.revision));
  } catch (e) { return errorResponse(e); }
}
export async function DELETE(request: Request) {
  try {
    const owner = ownerFrom(request);
    const data = deleteInput.parse(await request.json());
    await deleteDiagram(owner, data.id, data.revision);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
