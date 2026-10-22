import { z } from "zod";
import { getBinding } from "@/db";
import { ownerFrom, StoreError } from "@/lib/store";
import { listSharing, createInvite, acceptInvite, changeMember, revokeAccess, listProjectSharing, createProjectInvite, changeProjectMember, revokeProjectAccess } from "@/lib/board-access";
const id = z.string().min(1).max(300);
const project = z.string().trim().min(1).max(80);
const role = z.enum(["view", "edit"]);
// Each request targets either one board (id) or a whole project (project name).
const target = z.union([z.object({ id, project: z.undefined().optional() }), z.object({ project, id: z.undefined().optional() })]);
function failure(error: unknown) {
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Revisá los datos de acceso." }, { status: 400 });
  console.error("Board sharing", error);
  return Response.json({ error: "No se pudo actualizar el acceso al tablero." }, { status: 503 });
}
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
function displayName(request: Request, fallback: string) {
  const name = request.headers.get("oai-authenticated-user-full-name") || fallback;
  try { return decodeURIComponent(name); } catch { return name; }
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, user = ownerFrom(request);
    if (params.has("project")) return json(await listProjectSharing(getBinding(), user, project.parse(params.get("project"))));
    return json(await listSharing(getBinding(), user, id.parse(params.get("id"))));
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const user = ownerFrom(request), body = z.record(z.unknown()).parse(await request.json());
    if (body.action === "join") {
      const { token } = z.object({ token: z.string().length(64) }).parse(body);
      return json(await acceptInvite(getBinding(), user, displayName(request, "Participante"), token));
    }
    const data = target.and(z.object({ role })).parse(body);
    if (data.project) return json(await createProjectInvite(getBinding(), user, displayName(request, ""), data.project, data.role));
    return json(await createInvite(getBinding(), user, data.id!, data.role));
  } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  try {
    const user = ownerFrom(request), data = target.and(z.object({ member: id, role })).parse(await request.json());
    if (data.project) await changeProjectMember(getBinding(), user, data.project, data.member, data.role);
    else await changeMember(getBinding(), user, data.id!, data.member, data.role);
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try {
    const user = ownerFrom(request), data = target.and(z.object({ member: id.optional(), invite: id.optional() })).refine(d => Boolean(d.member) !== Boolean(d.invite)).parse(await request.json());
    if (data.project) await revokeProjectAccess(getBinding(), user, data.project, data);
    else await revokeAccess(getBinding(), user, data.id!, data);
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
