import { RELATIONS, relationInfo } from "@/lib/canvas";
import { BookOpen } from "lucide-react";

export function RelationSymbol({ kind }: { kind: string }) {
  const relation = relationInfo(kind);
  return <svg className="relation-symbol" viewBox="0 0 180 42" role="img" aria-label={relation.name}>
    <path d="M 22 21 L 158 21" stroke="currentColor" strokeWidth="2" strokeDasharray={kind.startsWith("..") ? "6 4" : undefined} />
    {kind === "o--" || kind === "*--" ? <polygon points="22,21 34,13 46,21 34,29" fill={kind === "*--" ? "currentColor" : "white"} stroke="currentColor" strokeWidth="2" /> : null}
    {kind === "<|--" && <polygon points="22,21 40,11 40,31" fill="white" stroke="currentColor" strokeWidth="2" />}
    {kind === "..|>" && <polygon points="158,21 140,11 140,31" fill="white" stroke="currentColor" strokeWidth="2" />}
    {kind === "-->" || kind === "..>" ? <path d="M 146 13 L 158 21 L 146 29" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
  </svg>;
}

export default function RelationGuide({ selected, onSelect }: { selected: string; onSelect: (value: string) => void }) {
  const relation = relationInfo(selected);
  return <div className="relation-guide">
    <div className="guide-tabs" role="tablist" aria-label="Relaciones UML">{RELATIONS.map(item => <button key={item.value} role="tab" aria-selected={item.value === selected} onClick={() => onSelect(item.value)}>{item.name}</button>)}</div>
    <section className="guide-detail" role="tabpanel" aria-label={relation.name}>
      <div className="guide-example"><span>{relation.from}</span><RelationSymbol kind={selected} /><span>{relation.to}</span></div>
      <h3>{relation.name}</h3><p>{relation.meaning}</p><p className="guide-symbol-note">{relation.symbol}</p>
      <code>{relation.example}</code>
      <div className="guide-roles"><div><small>ORIGEN</small><strong>{relation.origin}</strong></div><div><small>DESTINO</small><strong>{relation.destination}</strong></div></div>
    </section>
    <section className="guide-reference"><h3>Cardinalidad</h3><dl><dt>1</dt><dd>Exactamente uno</dd><dt>0..1</dt><dd>Cero o uno</dd><dt>0..*</dt><dd>Cero o muchos</dd><dt>1..*</dt><dd>Uno o muchos</dd></dl>
      <p>La cantidad junto a una clase indica cuántas instancias de esa clase pueden estar relacionadas con una instancia de la otra.</p>
      <code>Cliente "1" -- "0..*" Pedido</code><p>Un cliente puede tener cero o muchos pedidos; cada pedido corresponde a un cliente.</p>
    </section>
    <section className="guide-reference"><h3>Visibilidad</h3><dl><dt>+</dt><dd>Público</dd><dt>-</dt><dd>Privado</dd><dt>#</dt><dd>Protegido</dd><dt>~</dt><dd>Paquete</dd></dl></section>
    <a className="guide-source" href="https://mermaid.js.org/syntax/classDiagram.html" target="_blank" rel="noreferrer"><BookOpen size={14} />Referencia de Mermaid</a>
  </div>;
}
