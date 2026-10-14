import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const base = JSON.parse(readFileSync(new URL("../lib/study-data.json", import.meta.url), "utf8"));
const extra = JSON.parse(readFileSync(new URL("../lib/study-visuals.json", import.meta.url), "utf8"));
const exams = JSON.parse(readFileSync(new URL("../lib/study-exams.json", import.meta.url), "utf8"));
const choices = JSON.parse(readFileSync(new URL("../lib/study-choice.json", import.meta.url), "utf8"));

test("visual study additions preserve stable exercise IDs and valid source references", () => {
  const exercises = [...base.exercises.map(exercise => ({ ...exercise, ...exams.overrides[exercise.id], id: exercise.id })), ...extra.exercises, ...exams.exercises, ...choices.exercises];
  const sources = new Set([...base.sources, extra.source, ...exams.sources, choices.source].map(source => source.id));
  assert.equal(new Set(exercises.map(exercise => exercise.id)).size, exercises.length);
  assert.ok(existsSync(new URL("../public" + extra.source.url, import.meta.url)));
  for (const exercise of exercises) {
    assert.ok(base.levels.some(level => level.id === exercise.level), exercise.id);
    assert.ok(exercise.refs.every(id => sources.has(id)), exercise.id);
    if (exercise.kind === "choice") assert.ok(Number.isInteger(exercise.answer) && exercise.choices[exercise.answer], exercise.id);
  }
  assert.equal(new Set(exercises.map(exercise => exercise.title)).size, exercises.length);
  const sets = [...base.examSets.map(exam => ({ ...exam, ...exams.examOverrides[exam.id] })), ...exams.examSets];
  assert.equal(new Set(sets.map(exam => exam.id)).size, sets.length);
  for (const exam of sets) assert.ok(exam.exerciseTitles.every(title => exercises.some(exercise => exercise.title === title)));
});

test("exam adaptations preserve old IDs and use read-only complete C++ instead of PHP or Eiffel tasks", () => {
  for (const id of Object.keys(exams.overrides)) assert.ok(base.exercises.some(exercise => exercise.id === id), id);
  for (const source of exams.sources) assert.ok(existsSync(new URL("../public" + source.url, import.meta.url)), source.name);
  const exercises = [...base.exercises.map(exercise => ({ ...exercise, ...exams.overrides[exercise.id] })), ...exams.exercises];
  for (const exercise of exercises) {
    assert.ok(!/PHP|Eiffel|C#/.test(exercise.title + exercise.prompt + exercise.solution), exercise.id);
    assert.ok(!["code", "cpp"].includes(exercise.kind), exercise.id);
    if (exercise.topic === "Código" || exercise.topic === "Lectura C++") {
      assert.ok(exercise.code, exercise.id); assert.match(exercise.code, /#include/); assert.match(exercise.code, /int main\(/);
    }
  }
  assert.equal(exams.exercises.length, 19);
  assert.equal(exercises.filter(exercise => exercise.code).length, 16);
});

test("every pattern has a guided sequence exercise and steps reference real participants", () => {
  assert.deepEqual(Object.keys(extra.patterns).sort(), base.patterns.map(pattern => pattern.id).sort());
  for (const pattern of base.patterns) {
    const visual = extra.patterns[pattern.id];
    const exercise = extra.exercises.find(exercise => exercise.title === "Seguí las llamadas de " + pattern.name);
    assert.ok(exercise, pattern.name);
    assert.equal(exercise.diagramType, "sequence");
    assert.equal(exercise.uml, visual.sequence.source);
    assert.match(exercise.starter, /^sequenceDiagram\n/);
    const ids = [...visual.sequence.source.matchAll(/^participant (\w+)/gm)].map(match => match[1]);
    for (const step of visual.sequence.steps) assert.ok(ids.includes(step.focus), pattern.name + ": " + step.focus);
    for (const step of visual.structure.steps) assert.match(pattern.uml, new RegExp("\\b" + step.focus + "\\b"));
    assert.ok(visual.check.question && visual.check.answer);
  }
});

test("theory visuals attach to existing lessons and keep globally distinct copy IDs", () => {
  const visuals = Object.values(extra.patterns).flatMap(pattern => [pattern.structure, pattern.sequence]);
  for (const [id, sections] of Object.entries(extra.lessons)) {
    assert.ok(base.lessons.some(lesson => lesson.id === id), id);
    for (const section of sections) {
      for (const id of section.patterns || []) assert.ok(extra.patterns[id]);
      for (const visual of section.visuals || []) { assert.ok(["activity", "state"].includes(visual.type)); visuals.push(visual); }
    }
  }
  assert.equal(new Set(visuals.map(visual => visual.id)).size, visuals.length);
  assert.equal(visuals.length, 23);
});
