import { z } from "zod";
import { getBinding } from "@/db";
import { ownerFrom, StoreError } from "@/lib/store";
import { readAsset, storeAsset } from "@/lib/assets";

const upload = z.object({ board: z.string().min(1).max(300), data: z.string().max(4_500_000) });
const fail = (error: unknown) => {
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "La imagen no es válida." }, { status: 400 });
  if (error instanceof Error && /imagen|MB/.test(error.message)) return Response.json({ error: error.message }, { status: 400 });
  console.error("Board assets", error);
  return Response.json({ error: "No se pudo guardar la imagen." }, { status: 503 });
};

/** Stores a picture for a board the user can edit. */
export async function POST(request: Request) {
  try {
    const user = ownerFrom(request), body = upload.parse(await request.json());
    const id = await storeAsset(getBinding(), user, body.board, body.data);
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

/**
 * Serves a picture to anyone who can see a board that uses it, so copies and
 * shared boards keep working. Asset content never changes: cached for a year.
 */
export async function GET(request: Request) {
  try {
    const user = ownerFrom(request), params = new URL(request.url).searchParams;
    const id = z.string().uuid().parse(params.get("id")), board = z.string().min(1).max(300).parse(params.get("board"));
    const { mime, bytes } = await readAsset(getBinding(), user, board, id);
    return new Response(bytes, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", ETag: `"${id}"` } });
  } catch (error) { return fail(error); }
}
