import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCanvas, writeCanvas, cleanSource } from '../lib/canvas.ts';
import { enclosingFrame, transformFrame, removeFrame, frameLinkPoints } from '../lib/frames.ts';
import { removeClass } from '../lib/class-actions.ts';
import { mergeSharedDiagram } from '../lib/shared-sync.ts';
const source='classDiagram\nclass A\nclass B\nA --> B\n%% comentario original';
const nodes=[{name:'A',x:100,y:100,width:80,height:40},{name:'B',x:500,y:100,width:80,height:40}];
const frame={title:'Módulo ventas',x:0,y:0,width:300,height:240,color:'#2563eb',border:'dashed',moveContents:true};
const link={from:{kind:'frame',id:'ventas'},to:{kind:'class',id:'B'},color:'#dc2626',border:'dotted',label:'consulta'};
const settings={...readCanvas(source),frames:{ventas:frame},frameLinks:{consulta:link},nodeColors:{A:'#fde68a'}};
test('frames and connectors round-trip without changing Mermaid or other metadata',()=>{
 const saved=writeCanvas(source,settings);assert.deepEqual(readCanvas(saved),settings);assert.equal(cleanSource(saved),source);
 for(const patch of [{width:159},{height:99},{x:Infinity},{color:'url(bad)'},{border:'invalid'}])assert.throws(()=>writeCanvas(source,{...settings,frames:{ventas:{...frame,...patch}}}));
 assert.equal(readCanvas(writeCanvas(source,{...settings,frames:{},frameLinks:{}})).frames,undefined);
});
test('moving a frame moves only fully enclosed classes and supports leaving them in place',()=>{
 const moved=transformFrame(settings,'ventas','move',{x:40,y:25},nodes);
 assert.deepEqual(moved.positions,{A:{x:140,y:125}});assert.equal(moved.frames.ventas.x,40);assert.deepEqual(moved.nodeColors,settings.nodeColors);
 const fixed=transformFrame({...settings,frames:{ventas:{...frame,moveContents:false}}},'ventas','move',{x:40,y:25},nodes);assert.deepEqual(fixed.positions,{});
 assert.deepEqual(settings.positions,{});
});
test('resizing every edge preserves opposite edges, minimum size and class placement',()=>{
 for(const handle of ['n','s','e','w','nw','ne','se','sw']) {
  const next=transformFrame(settings,'ventas',handle,{x:1000,y:1000},nodes);assert.ok(next.frames.ventas.width>=160);assert.ok(next.frames.ventas.height>=100);assert.deepEqual(next.positions,{});
 }
 const west=transformFrame(settings,'ventas','w',{x:1000,y:0},nodes).frames.ventas;assert.equal(west.x+west.width,300);
});
test('deleting a frame keeps its classes and unrelated links; deleting a class removes only its frame links',()=>{
 const next=removeFrame({...settings,frames:{...settings.frames,otro:{...frame,x:500}},frameLinks:{...settings.frameLinks,otra:{...link,from:{kind:'frame',id:'otro'},to:{kind:'class',id:'A'}}}},'ventas');
 assert.equal(next.frameLinks.consulta,undefined);assert.ok(next.frameLinks.otra);assert.deepEqual(next.positions,{});
 const saved=removeClass(writeCanvas(source,settings),'B');assert.equal(readCanvas(saved).frameLinks,undefined);assert.ok(readCanvas(saved).frames.ventas);assert.match(saved,/class A/);
});
test('frame arrows attach to rectangle boundaries and ignore missing endpoints',()=>{
 const points=frameLinkPoints(link,settings.frames,nodes);assert.equal(points[0].x,300);assert.equal(points[1].x,460);
 assert.equal(frameLinkPoints({...link,to:{kind:'class',id:'missing'}},settings.frames,nodes),null);
 const around=enclosingFrame(nodes);assert.ok(around.x<60);assert.ok(around.x+around.width>540);
});
test('shared independent frames merge, overlapping edits and dangling links conflict safely',()=>{
 const doc={id:'board',name:'Board',type:'class',project:'',theme:'studio',notes:'',revision:1,source:writeCanvas(source,settings)};
 const local={...doc,source:writeCanvas(source,{...settings,frames:{...settings.frames,ventas:{...frame,title:'Ventas'}}})};
 const remote={...doc,revision:2,source:writeCanvas(source,{...settings,frames:{...settings.frames,otro:{...frame,title:'Compras',x:600}}})};
 const merged=mergeSharedDiagram(doc,local,remote);assert.ok(merged);assert.equal(readCanvas(merged.source).frames.ventas.title,'Ventas');assert.equal(readCanvas(merged.source).frames.otro.title,'Compras');
 assert.equal(mergeSharedDiagram(doc,local,{...remote,source:writeCanvas(source,{...settings,frames:{ventas:{...frame,title:'Distinto'}}})}),null);
 const deleted={...doc,source:writeCanvas(source,removeFrame(settings,'ventas'))};
 const newLink={...doc,revision:2,source:writeCanvas(source,{...settings,frameLinks:{...settings.frameLinks,nueva:{...link,label:'nueva'}}})};
 assert.equal(mergeSharedDiagram(doc,deleted,newLink),null);
});

test('module-to-module arrows run above the frames and keep their label away from class relations',async()=>{
 const {frameLinkRoute}=await import('../lib/frames.ts');
 const frames={ventas:frame,pagos:{...frame,x:500,y:40}};
 const route=frameLinkRoute({...link,to:{kind:'frame',id:'pagos'}},frames,nodes);
 assert.deepEqual(route.points[0],{x:150,y:0});assert.deepEqual(route.points.at(-1),{x:650,y:40});
 assert.ok(route.label.y<Math.min(frame.y,frames.pagos.y));
 assert.equal(frameLinkRoute({...link,to:{kind:'frame',id:'constructor'}},frames,nodes),null);
});
