import { z } from "zod";
import { frameSettings, frameLinkSettings } from "./frames.ts";
import { noteSettings, MAX_NOTES } from "./notes.ts";

const PREFIX = "%% uml-studio: ";
const point = z.object({ x: z.number().finite().min(-20000).max(20000), y: z.number().finite().min(-20000).max(20000) });
const anchor = z.object({ side: z.enum(["top", "right", "bottom", "left"]), offset: z.number().min(0).max(1) });
export const edgeRouteSettings = z.object({
  shape: z.enum(["straight", "curved", "orthogonal"]).default("curved"),
  from: anchor.optional(), to: anchor.optional(),
  points: z.array(point).max(20).default([]),
});
// `p` is pen pressure (0–1) when the stroke was drawn with a stylus.
const inkPoint = point.extend({ p: z.number().min(0).max(1).optional() });
export const strokeSettings = z.object({
  points: z.array(inkPoint).min(1).max(1500),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).default("#1a647b"),
  width: z.number().min(1).max(48).default(2.5),
  // Strokes without a tool predate the ink renderer and keep their original look.
  tool: z.enum(["pen", "marker"]).optional(),
});
export type EdgeRoute = z.infer<typeof edgeRouteSettings>;
export type EdgeAnchor = z.infer<typeof anchor>;
export type CanvasStroke = z.infer<typeof strokeSettings>;
export const canvasSettings = z.object({
  positions: z.record(point).default({}),
  nodeColors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
  // Per-element size factor; 1 is the size Mermaid lays out.
  nodeScales: z.record(z.number().min(.4).max(4)).optional(),
  edgeColors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
  lineWidth: z.number().min(1).max(6).default(2),
  arrowScale: z.number().min(1).max(3).default(1.4),
  labelSize: z.number().min(12).max(24).default(14),
  routes: z.record(edgeRouteSettings).default({}),
  strokes: z.array(strokeSettings).max(300).optional(),
  frames: z.record(frameSettings).refine(value => Object.keys(value).length <= 40).optional(),
  frameLinks: z.record(frameLinkSettings).refine(value => Object.keys(value).length <= 100).optional(),
  notes: z.record(noteSettings).refine(value => Object.keys(value).length <= MAX_NOTES).optional(),
});
export type CanvasSettings = z.infer<typeof canvasSettings>;
export type Point = z.infer<typeof point>;
export const DEFAULT_CANVAS: CanvasSettings = { positions: {}, routes: {}, lineWidth: 2, arrowScale: 1.4, labelSize: 14 };

export function readCanvas(source: string): CanvasSettings {
  const line = source.split(/\r?\n/).findLast(line => line.trimStart().startsWith(PREFIX));
  if (!line) return { ...DEFAULT_CANVAS, positions: {} };
  try {
    const parsed = canvasSettings.safeParse(JSON.parse(line.trimStart().slice(PREFIX.length)));
    if (!parsed.success) return { ...DEFAULT_CANVAS, positions: {} };
    if (!parsed.data.strokes?.length) delete parsed.data.strokes;
    for (const key of ["nodeColors", "nodeScales", "edgeColors", "frames", "frameLinks", "notes"] as const) if (!Object.keys(parsed.data[key] || {}).length) delete parsed.data[key];
    return parsed.data;
  } catch { return { ...DEFAULT_CANVAS, positions: {} }; }
}
export function cleanSource(source: string) {
  return source.split(/\r?\n/).filter(line => !line.trimStart().startsWith(PREFIX)).join("\n").trimEnd();
}
export function writeCanvas(source: string, settings: CanvasSettings) {
  const parsed = canvasSettings.parse(settings);
  if (!parsed.strokes?.length) delete parsed.strokes;
  for (const key of ["nodeColors", "nodeScales", "edgeColors", "frames", "frameLinks", "notes"] as const) if (!Object.keys(parsed[key] || {}).length) delete parsed[key];
  return cleanSource(source) + "\n" + PREFIX + JSON.stringify(parsed) + "\n";
}

export const RELATIONS = [
  { value: "-->", name: "Asociación", meaning: "Una clase conoce o se relaciona con otra. No expresa propiedad ni controla su ciclo de vida.", example: "Cliente --> Pedido : realiza", origin: "Clase de origen", destination: "Clase de destino", symbol: "Flecha hacia la clase relacionada.", short: "Se relaciona con", from: "Cliente", to: "Pedido" },
  { value: "o--", name: "Agregación", meaning: "Relación todo-parte sin propiedad exclusiva. La parte puede existir independientemente del todo; eliminar el todo no implica eliminar sus partes.", example: "Equipo o-- Jugador : agrupa", origin: "Todo / contenedor", destination: "Parte independiente", symbol: "Rombo vacío del lado del todo. Los detalles de la agregación dependen del modelo.", short: "Agrupa partes independientes", from: "Equipo", to: "Jugador" },
  { value: "*--", name: "Composición", meaning: "Relación todo-parte con propiedad exclusiva: una parte pertenece como máximo a un todo a la vez. Si se elimina el todo, se eliminan las partes que todavía contiene.", example: "Pedido *-- DetallePedido : contiene", origin: "Todo / propietario", destination: "Parte contenida", symbol: "Rombo lleno del lado del todo. Una parte puede separarse del todo antes de su eliminación.", short: "Contiene partes propias", from: "Pedido", to: "Detalle" },
  { value: "<|--", name: "Herencia", meaning: "Una clase es una especialización de otra y hereda sus características. Se puede leer como: Cliente es una Persona.", example: "Persona <|-- Cliente", origin: "Clase base / general", destination: "Clase derivada / específica", symbol: "Triángulo vacío apuntando a la clase base.", short: "Es un tipo de", from: "Persona", to: "Cliente" },
  { value: "..>", name: "Dependencia", meaning: "Una clase utiliza otra para una operación. Un cambio en la clase utilizada puede afectar a la que depende de ella.", example: "Pedido ..> Pago : utiliza", origin: "Clase que utiliza", destination: "Clase utilizada", symbol: "Línea discontinua y flecha hacia la clase utilizada.", short: "Utiliza temporalmente", from: "Pedido", to: "Pago" },
  { value: "..|>", name: "Realización", meaning: "Una clase implementa el contrato de una interfaz: ofrece las operaciones que la interfaz exige.", example: "Tarjeta ..|> Pago", origin: "Implementación", destination: "Interfaz / contrato", symbol: "Línea discontinua y triángulo vacío hacia la interfaz.", short: "Implementa una interfaz", from: "Tarjeta", to: "Pago" },
  { value: "--", name: "Vínculo", meaning: "Asociación sin una dirección de navegación indicada. Conecta dos clases sin añadir una flecha de navegación.", example: "Cliente -- Cuenta", origin: "Primera clase", destination: "Segunda clase", symbol: "Línea continua sin punta.", short: "Conexión sin dirección", from: "Cliente", to: "Cuenta" },
] as const;
export type RelationKind = typeof RELATIONS[number]["value"];
export function relationInfo(value: string) { return RELATIONS.find(r => r.value === value) || RELATIONS[0]; }

export function appendRelation(source: string, from: string, to: string, kind: RelationKind) {
  const content = cleanSource(source);
  return writeCanvas(content + `\n${from} ${kind} ${to}\n`, readCanvas(source));
}
