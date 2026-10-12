import test from "node:test";
import assert from "node:assert/strict";
import { correctionText } from "../lib/study-correction.ts";

const activity = { id: "eTest", level: 3, title: "Caso de la empresa", topic: "Patrones", scenario: "La empresa cambia de cálculo.", prompt: "Identificá roles y justificá.", code: "// C++ provisto\nint main() {}", refs: [28], kind: "open", rubric: ["Justificar requisitos."], solution: "SECRETO DE LA GUÍA", answer: 1, hints: ["PISTA SECRETA"] };
test("correction copies the case, task, supplied C++ and actual student answer without leaking the guide", () => {
  const text = correctionText(activity, { answer: "Es Strategy porque cambia el cálculo.", draft: "" }, [{ id: 28, name: "Parcial de prueba", url: "/original.jpg", pages: 0 }]);
  for (const expected of [activity.scenario, activity.prompt, activity.code, "Es Strategy", activity.rubric[0], "Parcial de prueba"]) assert.ok(text.includes(expected));
  for (const forbidden of [activity.solution, activity.hints[0]]) assert.ok(!text.includes(forbidden));
  assert.match(text, /solo para lectura/);
});
test("UML correction includes the exact edited diagram and never substitutes a solution or starter", () => {
  const diagram = "classDiagram\nclass Envio\n%% uml-studio: {\"positions\":{}}";
  const text = correctionText({ ...activity, kind: "uml", uml: "DIAGRAMA SECRETO", starter: "PLANTILLA SIN RESPUESTA" }, { answer: "Mi justificación", draft: diagram });
  assert.ok(text.includes(diagram)); assert.ok(text.includes("Mi justificación"));
  assert.ok(!text.includes("DIAGRAMA SECRETO")); assert.ok(!text.includes("PLANTILLA SIN RESPUESTA"));
  assert.match(correctionText({ ...activity, kind: "uml" }, { answer: "Aún no modelé", draft: "" }), /no hay un borrador editado/);
});
test("choice index zero becomes readable selected text without leaking the answer key", () => {
  const text = correctionText({ ...activity, kind: "choice", choices: ["Strategy", "Observer"] }, { answer: "0", draft: "" });
  assert.match(text, /MI RESPUESTA \/ RAZONAMIENTO\nA\. Strategy/);
  const empty = correctionText({ ...activity, kind: "choice", choices: ["Strategy", "Observer"] }, { answer: "", draft: "" });
  assert.match(empty, /Sin respuesta escrita/);
});
test("numeric correction retains units, decimal comma and calculation notes", () => {
  const text = correctionText({ ...activity, kind: "numeric", expected: 12 }, { answer: "12,00", draft: "120 / 1000 × 100 = 12 %." });
  assert.match(text, /RESPUESTA NUMÉRICA\n12,00/); assert.ok(text.includes("120 / 1000 × 100 = 12 %."));
});
