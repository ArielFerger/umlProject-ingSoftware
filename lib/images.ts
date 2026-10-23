import { z } from "zod";

// Pictures placed on a board. The bytes live in board_assets (`asset`); the
// browser-only build stores a compressed data URL instead (`src`).
export const MAX_IMAGES = 60;
export const MAX_ASSET_BYTES = 3 * 1024 * 1024;
export const MAX_INLINE_IMAGE = 400_000;
export const imageSettings = z.object({
  asset: z.string().uuid().optional(),
  src: z.string().max(MAX_INLINE_IMAGE).regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/).optional(),
  x: z.number().finite().min(-19000).max(19000), y: z.number().finite().min(-19000).max(19000),
  width: z.number().finite().min(16).max(6000), height: z.number().finite().min(16).max(6000),
  layer: z.enum(["front", "back"]).default("front"),
  name: z.string().max(120).default(""),
}).refine(image => Boolean(image.asset) !== Boolean(image.src), "Una imagen tiene un archivo o un dato incrustado, no ambos.");
export type CanvasImage = z.infer<typeof imageSettings>;

const SIGNATURES: [string, (bytes: Uint8Array) => boolean][] = [
  ["image/png", b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a],
  ["image/jpeg", b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", b => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"],
  ["image/gif", b => String.fromCharCode(...b.slice(0, 6)) === "GIF87a" || String.fromCharCode(...b.slice(0, 6)) === "GIF89a"],
];
/** The real type of image bytes, whatever their name or data URL claims; "" if they are not a supported picture. */
export function imageType(bytes: Uint8Array) { return SIGNATURES.find(([, test]) => bytes.length > 12 && test(bytes))?.[0] || ""; }

/** Decodes and validates an uploaded data URL. Throws a user-facing message. */
export function decodeImage(dataUrl: string) {
  const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("La imagen debe ser PNG, JPEG, WebP o GIF.");
  const binary = atob(match[1]), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new Error("La imagen debe pesar menos de 3 MB.");
  const mime = imageType(bytes);
  if (!mime) throw new Error("El archivo no es una imagen válida (PNG, JPEG, WebP o GIF).");
  return { bytes, mime };
}

/** Initial size on the board: natural size, no wider or taller than `max`, centered on `at`. */
export function placeImage(natural: { width: number; height: number }, at: { x: number; y: number }, max = 480) {
  const scale = Math.min(1, max / Math.max(natural.width, natural.height, 1));
  const width = Math.max(16, Math.round(natural.width * scale)), height = Math.max(16, Math.round(natural.height * scale));
  return { x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2), width, height };
}
