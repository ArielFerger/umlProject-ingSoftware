type Gradeable = { kind: string; choices?: string[]; answer?: number; expected?: number; choiceExplanations?: string[] };

export function numericValue(value: string): number | null {
  const clean = value.trim().replace(/\s*%$/, "");
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(clean)) return null;
  const number = Number(clean.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}
function choiceIndex(exercise: Gradeable, value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) && index < (exercise.choices?.length || 0) ? index : null;
}
export function correctAnswer(exercise: Gradeable, answer: string): boolean {
  if (exercise.kind === "choice") { const index = choiceIndex(exercise, answer); return index !== null && index === exercise.answer; }
  if (exercise.kind === "numeric") { const number = numericValue(answer); return number !== null && exercise.expected !== undefined && Math.abs(number - exercise.expected) <= .015; }
  return false;
}
export function choiceExplanation(exercise: Gradeable, answer: string): string | undefined {
  const index = choiceIndex(exercise, answer);
  return index === null ? undefined : exercise.choiceExplanations?.[index];
}
