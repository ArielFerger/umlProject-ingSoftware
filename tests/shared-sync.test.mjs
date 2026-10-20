import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeText, mergeSharedDiagram } from "../lib/shared-sync.ts";
import { readCanvas, writeCanvas, cleanSource } from "../lib/canvas.ts";
const base={id:"board",name:"Tablero",type:"class",project:"Grupo",theme:"studio",notes:"",revision:1,updatedAt:"",access:"edit",source:"classDiagram\nclass A {\n+String nombre\n}\nclass B {\n+String nombre\n}\nA --> B"};
test("independent Mermaid edits merge while overlapping edits need a decision",()=>{
 const local={...base,source:base.source.replace("class A {","class A {\n+int id")};
 const remote={...base,revision:2,source:base.source.replace("class B {","class B {\n+int edad")};
 const merged=mergeSharedDiagram(base,local,remote);assert.ok(merged);assert.match(merged.source,/int id/);assert.match(merged.source,/int edad/);assert.equal(merged.revision,2);
 assert.equal(mergeText("abc","aXc","aYc"),null);assert.equal(mergeText("abc","aXbc","aYbc"),null);
 assert.equal(mergeSharedDiagram(base,{...base,name:"Local"},{...base,name:"Remoto"}),null);
});
test("simultaneous movement of different nodes preserves metadata, source and routes",()=>{
 const settings=readCanvas(base.source),start={...base,source:writeCanvas(base.source,settings)};
 const local={...start,source:writeCanvas(base.source,{...settings,positions:{A:{x:20,y:40}}})};
 const remote={...start,revision:2,source:writeCanvas(base.source,{...settings,positions:{B:{x:-80,y:120}}})};
 const merged=mergeSharedDiagram(start,local,remote);assert.ok(merged);assert.equal(cleanSource(merged.source),base.source);assert.deepEqual(readCanvas(merged.source).positions,{A:{x:20,y:40},B:{x:-80,y:120}});
 assert.equal(mergeSharedDiagram(start,local,{...remote,source:writeCanvas(base.source,{...settings,positions:{A:{x:200,y:40}}})}),null);
});
test("new pencil strokes merge, overlapping erasures and invalid metadata fail safely",()=>{
 const settings=readCanvas(base.source),a={points:[{x:1,y:2}],color:"#123456",width:3},b={...a,color:"#abcdef"};
 const local={...base,source:writeCanvas(base.source,{...settings,strokes:[a]})},remote={...base,revision:2,source:writeCanvas(base.source,{...settings,strokes:[b]})};
 assert.equal(readCanvas(mergeSharedDiagram(base,local,remote).source).strokes.length,2);
 assert.equal(mergeSharedDiagram(base,{...local,source:local.source+"%% uml-studio: nope\n"},remote),null);
 assert.equal(mergeSharedDiagram(base,local,{...remote,access:"view"}),null);
});

test("different class and arrow colors merge without losing concurrent layout edits",()=>{
 const settings=readCanvas(base.source);
 const local={...base,source:writeCanvas(base.source,{...settings,nodeColors:{A:"#fde68a"},edgeColors:{one:"#dc2626"}})};
 const remote={...base,revision:2,source:writeCanvas(base.source,{...settings,nodeColors:{B:"#bae6fd"},positions:{B:{x:50,y:60}}})};
 const merged=mergeSharedDiagram(base,local,remote);assert.ok(merged);
 assert.deepEqual(readCanvas(merged.source).nodeColors,{A:"#fde68a",B:"#bae6fd"});
 assert.deepEqual(readCanvas(merged.source).edgeColors,{one:"#dc2626"});
 assert.deepEqual(readCanvas(merged.source).positions, {B:{x:50,y:60}});
 assert.equal(mergeSharedDiagram(base,local,{...remote,source:writeCanvas(base.source,{...settings,nodeColors:{A:"#334155"}})}),null);
});
