import { z } from "zod";

// Free text and sticky notes placed on the board, stored in canvas metadata
// like frames. They belong to the drawing, not to the Mermaid model.
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const noteSettings = z.object({
  kind: z.enum(["text", "sticky"]),
  text: z.string().max(1000),
  x: z.number().finite().min(-19000).max(19000), y: z.number().finite().min(-19000).max(19000),
  width: z.number().finite().min(60).max(900).default(220),
  color: color.default("#fde68a"),
  size: z.number().min(10).max(64).default(16),
  bold: z.boolean().default(false),
});
export type CanvasNote = z.infer<typeof noteSettings>;
export const MAX_NOTES = 200;

export const STICKY_COLORS = [
  ["Amarillo", "#fde68a"], ["Naranja", "#fed7aa"], ["Rosa", "#fbcfe8"], ["Violeta", "#ddd6fe"],
  ["Celeste", "#bae6fd"], ["Verde", "#bbf7d0"], ["Gris", "#e5e7eb"],
] as const;
export const TEXT_COLORS = [
  ["Grafito", "#1f2937"], ["Petróleo", "#1a647b"], ["Azul", "#1d4ed8"], ["Rojo", "#b91c1c"],
  ["Verde", "#15803d"], ["Naranja", "#c2410c"], ["Violeta", "#7c3aed"],
] as const;
export const NOTE_SIZES = [{ value: 14, label: "S" }, { value: 18, label: "M" }, { value: 26, label: "L" }, { value: 40, label: "XL" }] as const;

export function newNote(kind: CanvasNote["kind"], x: number, y: number): CanvasNote {
  return noteSettings.parse(kind === "sticky"
    ? { kind, text: "", x: x - 100, y: y - 70, width: 200, color: STICKY_COLORS[0][1], size: 18 }
    : { kind, text: "", x: x - 10, y: y - 14, width: 260, color: TEXT_COLORS[0][1], size: 18 });
}

/**
 * Splits text into lines that fit `width`, honoring line breaks; words longer
 * than a line are cut. `measure` returns the rendered width of a string.
 */
export function wrapText(text: string, width: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
      const candidate = line + word;
      if (!line || measure(candidate) <= width) { line = candidate; continue; }
      lines.push(line.trimEnd()); line = word.trimStart();
      while (line && measure(line) > width) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > width) cut--;
        lines.push(line.slice(0, cut)); line = line.slice(cut);
      }
    }
    // A word that is wider than the line on its own is cut too.
    while (line && measure(line) > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut)) > width) cut--;
      lines.push(line.slice(0, cut)); line = line.slice(cut);
    }
    lines.push(line);
  }
  return lines;
}
