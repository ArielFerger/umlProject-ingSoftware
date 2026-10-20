import { z } from "zod";
import { getBinding } from "@/db";
import { ownerFrom, StoreError } from "@/lib/store";
import { listSharing, createInvite, acceptInvite, changeMember, revokeAccess } from "@/lib/board-access";
const id = z.string().min(1).max(300);
const role = z.enum(["view", "edit"]);
function failure(error: unknown) {
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Revisá los datos de acceso." }, { status: 400 });
  console.error("Board sharing", error);
  return Response.json({ error: "No se pudo actualizar el acceso al tablero." }, { status: 503 });
}
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try { return json(await listSharing(getBinding(), ownerFrom(request), id.parse(new URL(request.url).searchParams.get("id")))); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const user = ownerFrom(request), body = z.record(z.unknown()).parse(await request.json());
    if (body.action === "join") {
      const { token } = z.object({ token: z.string().length(64) }).parse(body);
      let name = request.headers.get("oai-authenticated-user-full-name") || "Participante";
      try { name = decodeURIComponent(name); } catch { /* Use the provided name as plain text. */ }
      return json(await acceptInvite(getBinding(), user, name, token));
    }
    const data = z.object({ id, role }).parse(body);
    return json(await createInvite(getBinding(), user, data.id, data.role));
  } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  try {
    const user = ownerFrom(request), data = z.object({ id, member: id, role }).parse(await request.json());
    await changeMember(getBinding(), user, data.id, data.member, data.role); return json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try {
    const user = ownerFrom(request), data = z.object({ id, member: id.optional(), invite: id.optional() }).refine(d => Boolean(d.member) !== Boolean(d.invite)).parse(await request.json());
    await revokeAccess(getBinding(), user, data.id, data); return json({ ok: true });
  } catch (e) { return failure(e); }
}
