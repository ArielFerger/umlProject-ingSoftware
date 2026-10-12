import content from "./study-data.json";
import visualContent from "./study-visuals.json";
import examContent from "./study-exams.json";
import paperContent from "./study-papers.json";
import { paperQuestions, type StudyPaperDoc } from "./study-paper";
import { z } from "zod";
import type { Diagram } from "./diagrams";

export type StudyVisual = { id: string; title: string; type: Diagram["type"]; source: string; caption: string; reading: string[]; steps: { title: string; text: string; focus?: string }[] };
export type Section = { title: string; text?: string; items?: string[]; table?: string[][]; code?: string; visuals?: StudyVisual[]; patterns?: string[] };
export type Lesson = { id: string; title: string; lead: string; refs: number[]; sections: Section[] };
export type Pattern = { id: string; name: string; family: string; purpose: string; signal: string; roles: string; example: string; benefit: string; cost: string; error: string; refs: number[]; uml: string; visuals: StudyVisual[]; check: { question: string; answer: string } };
export type Exercise = { id: string; level: number; title: string; topic: string; scenario?: string; prompt: string; code?: string; provenance?: string; solution: string; refs: number[]; kind: string; choices?: string[]; answer?: number; expected?: number; hints: string[]; uml?: string | null; diagramType?: Diagram["type"]; starter?: string; rubric: string[] };
export type StudySource = { id: number; name: string; pages: number; url: string; format?: "image" };
export type ExamSet = { id: string; title: string; minutes: number; exerciseTitles: string[]; paperId?: string };
export const PAPERS = paperContent as StudyPaperDoc[];
const additions = visualContent as {
  source: { id: number; name: string; pages: number; url: string };
  patterns: Record<string, { structure: Omit<StudyVisual, "source" | "type">; sequence: StudyVisual; check: Pattern["check"] }>;
  lessons: Record<string, Section[]>;
  exercises: Exercise[];
};
const exams = examContent as {
  sources: StudySource[]; overrides: Record<string, Partial<Exercise>>;
  exercises: Exercise[]; examSets: ExamSet[]; examOverrides: Record<string, Partial<ExamSet>>;
};
export const STUDY = {
  ...content,
  sources: [...content.sources, additions.source, ...exams.sources],
  sourceCount: content.sourceCount + 1 + exams.sources.length,
  pdfPages: content.pdfPages + additions.source.pages,
  lessons: content.lessons.map(lesson => ({ ...lesson, refs: additions.lessons[lesson.id] ? [...lesson.refs, additions.source.id] : lesson.refs, sections: [...lesson.sections, ...(additions.lessons[lesson.id] || [])] })),
  patterns: content.patterns.map(pattern => {
    const extra = additions.patterns[pattern.id];
    return { ...pattern, refs: [...pattern.refs, additions.source.id], visuals: [{ ...extra.structure, type: "class", source: pattern.uml }, extra.sequence], check: extra.check };
  }),
  exercises: [...content.exercises.map(exercise => ({ ...exercise, ...exams.overrides[exercise.id], id: exercise.id })), ...additions.exercises, ...exams.exercises],
  examSets: [...content.examSets.map(exam => ({ ...exam, ...exams.examOverrides[exam.id], id: exam.id })), ...exams.examSets],
} as Omit<typeof content, "lessons" | "patterns" | "exercises" | "sources" | "examSets"> & { lessons: Lesson[]; patterns: Pattern[]; exercises: Exercise[]; sources: StudySource[]; examSets: ExamSet[] };
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
  for (const paper of PAPERS) for (const question of paperQuestions(paper)) ids.add(question.id);
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
  if (exercise.starter) return exercise.starter;
  return `classDiagram\ndirection TB\n%% ${exercise.title}\n%% Agregá las clases, sus miembros y relaciones.\n`;
}
