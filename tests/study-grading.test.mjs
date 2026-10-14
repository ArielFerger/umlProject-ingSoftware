import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { correctAnswer, numericValue, choiceExplanation } from "../lib/study-grading.ts";

const bank = JSON.parse(readFileSync(new URL("../lib/study-choice.json", import.meta.url), "utf8"));
test("50 summary questions have four distinct answers with aligned feedback and balanced answer positions", () => {
  assert.equal(bank.exercises.length, 50);
  for (let level=1; level<=5; level++) assert.equal(bank.exercises.filter(e=>e.level===level).length,10);
  assert.deepEqual([0,1,2,3].map(i=>bank.exercises.filter(e=>e.answer===i).length),[13,13,12,12]);
  assert.ok(existsSync(new URL("../public" + bank.source.url, import.meta.url)));
  for (const e of bank.exercises) {
    assert.equal(e.kind,"choice"); assert.equal(e.choices.length,4); assert.equal(new Set(e.choices).size,4,e.id);
    assert.equal(e.choiceExplanations.length,4); assert.ok(e.choiceExplanations.every(text=>typeof text==="string" && text.length>25));
    assert.ok(e.refs.includes(bank.source.id)); assert.ok(e.hints.length); assert.ok(e.solution.length>60);
    for (let i=0;i<4;i++) { assert.equal(correctAnswer(e,String(i)),i===e.answer,e.id); assert.equal(choiceExplanation(e,String(i)),e.choiceExplanations[i]); }
  }
});
test("grading rejects malformed or out of bounds choice indices instead of interpreting them as answer zero", () => {
  const e={kind:"choice",choices:["A","B","C","D"],answer:0,choiceExplanations:["A why","B why","C why","D why"]};
  assert.equal(correctAnswer(e,"0"),true);
  for(const value of [""," ","-1","0.0","+0","0x0","1e0","4","99999999999999999999","false"]){assert.equal(correctAnswer(e,value),false,value);assert.equal(choiceExplanation(e,value),undefined,value);}
});
test("numeric grading retains decimal comma, percent handling and tolerance without accepting grouping separators", () => {
  const e={kind:"numeric",expected:3};
  assert.equal(correctAnswer(e,"3,00"),true); assert.equal(correctAnswer(e,"3 %"),true);
  assert.equal(correctAnswer(e,"3.014"),true); assert.equal(correctAnswer(e,"3.02"),false);
  for(const invalid of ["","1,000.00","1.000,00","NaN","Infinity"]){assert.equal(numericValue(invalid),null);assert.equal(correctAnswer(e,invalid),false);}
});
test("C++ remains read-only and exam-inspired choices remain separate training", () => {
  const cpp=bank.exercises.filter(e=>e.code);assert.equal(cpp.length,3);
  for(const e of cpp){assert.equal(e.kind,"choice");assert.match(e.code,/#include/);assert.match(e.code,/int main\(/);}
  for(const e of bank.exercises.filter(e=>e.level===5))assert.match(e.provenance,/no modifica las consignas originales/);
});
