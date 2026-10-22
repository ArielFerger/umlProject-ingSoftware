import { z } from "zod";
import { getBinding } from "@/db";
import { ownerFrom, StoreError } from "@/lib/store";
import { heartbeat, leave } from "@/lib/presence";
const input = z.object({ id: z.string().min(1).max(300), session: z.string().uuid(), selection: z.string().max(120).default(""), leave: z.boolean().optional() });
export async function POST(request: Request) {
  try {
    const user = ownerFrom(request), data = input.parse(await request.json());
    if (data.leave) { await leave(getBinding(), user, data.id, data.session); return Response.json({ ok: true }); }
    let name = request.headers.get("oai-authenticated-user-full-name") || "Participante";
    try { name = decodeURIComponent(name); } catch { /* Plain text display name. */ }
    return Response.json(await heartbeat(getBinding(), user, name, data.id, data.session, data.selection), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: "Datos de presencia inválidos." }, { status: 400 });
    console.error("Board presence", error);
    return Response.json({ error: "No se pudo actualizar quién está conectado." }, { status: 503 });
  }
}
