import content from "./study-data.json";
import { z } from "zod";

export type Section = { title: string; text?: string; items?: string[]; table?: string[][]; code?: string };
export type Lesson = { id: string; title: string; lead: string; refs: number[]; sections: Section[] };
export type Pattern = { id: string; name: string; family: string; purpose: string; signal: string; roles: string; example: string; benefit: string; cost: string; error: string; refs: number[]; uml: string };
export type Exercise = { id: string; level: number; title: string; topic: string; prompt: string; solution: string; refs: number[]; kind: string; choices?: string[]; answer?: number; expected?: number; hints: string[]; uml?: string; rubric: string[] };
export const STUDY = content as typeof content & { lessons: Lesson[]; patterns: Pattern[]; exercises: Exercise[] };
export const ENTRY_SCHEMA = z.object({
  answer: z.string().max(30000).default(""), draft: z.string().max(80000).default(""),
  attempts: z.number().int().min(0).max(100000).default(0), done: z.boolean().default(false),
  result: z.enum(["correct", "incorrect"]).optional(), hints: z.number().int().min(0).max(10).default(0),
  rubric: z.array(z.boolean()).max(20).default([]), review: z.boolean().default(false),
  solutionSeen: z.boolean().default(false), diagramId: z.string().max(300).optional(),
});
export const PROGRESS_SCHEMA = z.object({
  version: z.literal(1), read: z.array(z.string().max(100)).max(100),
  entries: z.record(z.string().max(100), ENTRY_SCHEMA),
});
export type Entry = z.infer<typeof ENTRY_SCHEMA>;
export type Progress = z.infer<typeof PROGRESS_SCHEMA>;
export const emptyProgress = (): Progress => ({ version: 1, read: [], entries: {} });
export const emptyEntry = (): Entry => ENTRY_SCHEMA.parse({});
export function parseProgress(value: unknown): Progress {
  const p = PROGRESS_SCHEMA.parse(value);
  const ids = new Set(STUDY.exercises.map(e => e.id));
  return { ...p, read: [...new Set(p.read)].filter(id => STUDY.lessons.some(l => l.id === id)),
    entries: Object.fromEntries(Object.entries(p.entries).filter(([id]) => ids.has(id))) };
}
export function numericValue(value: string): number | null {
  // One decimal separator; grouping separators are deliberately rejected.
  const clean = value.trim().replace(/\s*%$/, "");
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(clean)) return null;
  const n = Number(clean.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function correctAnswer(exercise: Exercise, answer: string): boolean {
  if (exercise.kind === "choice") return answer !== "" && Number(answer) === exercise.answer;
  if (exercise.kind === "numeric") {
    const n = numericValue(answer);
    return n !== null && exercise.expected !== undefined && Math.abs(n - exercise.expected) <= .015;
  }
  return false;
}
export function completion(p: Progress) {
  const done = STUDY.exercises.filter(e => p.entries[e.id]?.done).length;
  return { done, total: STUDY.exercises.length, xp: done * 25, percent: Math.round(done / STUDY.exercises.length * 100) };
}
export function starter(exercise: Exercise) {
  return `classDiagram\ndirection TB\n%% ${exercise.title}\n%% Agregá las clases, sus miembros y relaciones.\n`;
}
