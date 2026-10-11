"use client";

import { useState } from "react";
import { Check, Boxes } from "lucide-react";

export default function ClassProperties({ name, body, onApply }: { name: string; body: string; onApply: (body: string) => void }) {
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState("");
  const members = draft.split("\n").filter(line => line.trim());
  return <form className="class-properties" onSubmit={event => {
    event.preventDefault();
    try { onApply(draft); setError(""); } catch (e) { setError((e as Error).message); }
  }}>
    <div className="selection-heading"><Boxes size={18} /><strong>{name}</strong></div>
    <label className="property-field">Nombre de la clase<input value={name} readOnly className="mono" /></label>
    <label className="property-field">Atributos y métodos<textarea className="mono member-input" aria-label={"Atributos y métodos de " + name} value={draft} onChange={event => setDraft(event.target.value)} rows={9} spellCheck={false} /></label>
    <div className="member-count"><span>{members.filter(line => !line.includes("(") && !line.startsWith("<<")).length} atributos</span><span>{members.filter(line => line.includes("(")).length} métodos</span></div>
    <p className="property-help"><code>+</code> público · <code>−</code> privado · <code>#</code> protegido</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="btn primary apply-properties" disabled={draft === body}><Check size={15} />Aplicar cambios</button>
  </form>;
}
