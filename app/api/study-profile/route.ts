import { ownerFrom, StoreError } from "@/lib/store";
export async function GET(request: Request) {
  try {
    let displayName = request.headers.get("oai-authenticated-user-full-name") || "Mi cuenta";
    try { displayName = decodeURIComponent(displayName); } catch { /* Plain text display name. */ }
    return Response.json({ owner: ownerFrom(request), displayName, sharing: request.headers.get("x-uml-auth-provider") === "vps" }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Inicia sesión." }, { status: e instanceof StoreError ? e.status : 500 }); }
}
