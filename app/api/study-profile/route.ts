import { ownerFrom, StoreError } from "@/lib/store";
export async function GET(request: Request) {
  try { return Response.json({ owner: ownerFrom(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Inicia sesión." }, { status: e instanceof StoreError ? e.status : 500 }); }
}
