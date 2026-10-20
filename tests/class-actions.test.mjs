import assert from "node:assert/strict";
import { test } from "node:test";
import { classMembers, classSnippet, duplicateClass, removeClass, setClassMembers } from "../lib/class-actions.ts";
import { cleanSource, readCanvas, writeCanvas, DEFAULT_CANVAS } from "../lib/canvas.ts";

const source = `classDiagram
%% class Cliente { conservar comentario }
class Cliente["Cliente real"] {
  +String nombre
  +comprar() void
}
class ClienteVIP {
  +Cliente contacto
  Cliente : una propiedad distinta
}
class Pedido
Cliente "1" --> "0..*" Pedido : compra de Cliente
Pedido ..> Cliente : devuelve
ClienteVIP --> Pedido : conserva Cliente
note for Pedido "Cliente debe quedar en el texto"
note for Cliente "Nota de la clase"
`;
const settings = { ...DEFAULT_CANVAS, positions: { Cliente: { x: 80, y: 120 }, Pedido: { x: 200, y: 100 } }, lineWidth: 4, arrowScale: 2 };

test("deleting a class removes only its declaration, incident edges, own notes and position", () => {
  const result=removeClass(writeCanvas(source,settings),"Cliente");
  const content=cleanSource(result);
  assert.doesNotMatch(content,/^class Cliente\[/m);
  assert.doesNotMatch(content,/^Cliente "1"/m);
  assert.doesNotMatch(content,/^Pedido \.\.> Cliente/m);
  assert.doesNotMatch(content,/^note for Cliente /m);
  assert.match(content,/%% class Cliente \{ conservar comentario \}/);
  assert.match(content,/class ClienteVIP \{/);
  assert.match(content,/Cliente : una propiedad distinta/);
  assert.match(content,/ClienteVIP --> Pedido : conserva Cliente/);
  assert.match(content,/note for Pedido "Cliente debe quedar en el texto"/);
  assert.deepEqual(readCanvas(result),{...settings,positions:{Pedido:settings.positions.Pedido}});
});

test("duplicating a class avoids implicit names and keeps original relationships and settings", () => {
  const content=writeCanvas(source+"Cliente_copia --> Pedido\n",settings);
  const copy=duplicateClass(content,"Cliente",["Cliente_copia2"]);
  assert.equal(copy.name,"Cliente_copia3");
  assert.match(copy.source,/class Cliente_copia3 \{/);
  assert.match(copy.source,/\+comprar\(\) void/);
  assert.match(copy.source,/Cliente "1" --> "0\.\.\*" Pedido/);
  assert.deepEqual(readCanvas(copy.source),{...settings,positions:{...settings.positions,Cliente_copia3:{x:150,y:190}}});
});

test("editing supports bare and implicit classes while preserving aliases, stereotypes and unrelated members", () => {
  const bare=setClassMembers("classDiagram\nclass Foo\nFoo : +old() void\nFoo : <<interface>>\nclass Bar {\n Foo : propiedad ajena\n}\n","Foo","+new() void");
  assert.match(bare,/class Foo \{\n  \+new\(\) void\n\}/);
  assert.doesNotMatch(bare,/\+old\(\)/);
  assert.match(bare,/Foo : <<interface>>/);
  assert.match(bare,/ Foo : propiedad ajena/);
  const aliased=setClassMembers(writeCanvas(source,settings),"Cliente","+String email");
  assert.match(aliased,/class Cliente\["Cliente real"\] \{/);
  assert.deepEqual(readCanvas(aliased),settings);
  const implicit=setClassMembers("classDiagram\nA --> B\nB : +go() void\n","B","+run() void");
  assert.match(implicit,/A --> B/);
  assert.match(implicit,/class B \{/);
  assert.doesNotMatch(implicit,/\+go\(\)/);
  assert.equal(classMembers("classDiagram\nclass A\nA : +name\n","A"),"+name");
});

test("invalid edits fail before changing the source", () => {
  assert.throws(()=>setClassMembers(source,"Sin espacios","+name"));
  assert.throws(()=>setClassMembers(source,"Cliente","} class Otra {"));
  assert.throws(()=>setClassMembers("classDiagram\nclass Incompleta {","Incompleta","+name"));
});

test("copy and duplicate retain external interface or abstract annotations and members", () => {
  const source="classDiagram\nclass Contrato\nContrato : <<interface>>\nContrato : +run() void\n<<abstract>> Base\nBase : +go() void\n";
  assert.match(classSnippet(source,"Contrato"),/<<interface>>/);
  assert.match(classSnippet(source,"Contrato"),/\+run\(\) void/);
  assert.match(duplicateClass(source,"Contrato").source,/class Contrato_copia \{\n  \+run\(\) void\n  <<interface>>\n\}/);
  assert.match(duplicateClass(source,"Base").source,/class Base_copia \{\n  \+go\(\) void\n  <<abstract>>\n\}/);
});

test("duplicating and deleting a colored class preserves unrelated colors", () => {
  const source = writeCanvas("classDiagram\nclass A\nclass B", { ...readCanvas(""), nodeColors: { A: "#fde68a", B: "#334155" } });
  const copy = duplicateClass(source, "A");
  assert.equal(readCanvas(copy.source).nodeColors[copy.name], "#fde68a");
  assert.deepEqual(readCanvas(removeClass(copy.source, "A")).nodeColors, { B: "#334155", [copy.name]: "#fde68a" });
});
