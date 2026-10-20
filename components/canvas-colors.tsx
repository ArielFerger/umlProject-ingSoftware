"use client";
import { Palette, RotateCcw } from "lucide-react";

const COLORS = [
  ["Amarillo", "#fde68a"], ["Verde", "#bbf7d0"], ["Celeste", "#bae6fd"],
  ["Violeta", "#ddd6fe"], ["Rosa", "#fecdd3"], ["Rojo", "#dc2626"],
  ["Azul", "#2563eb"], ["Gris oscuro", "#334155"],
];
export default function CanvasColors({ label, value, onChange }: { label: string; value?: string; onChange: (color?: string) => void }) {
  return <div className="canvas-colors" role="group" aria-label={label}>
    <Palette size={15} aria-hidden="true" />
    {COLORS.map(([name, color]) => <button key={color} type="button" className="canvas-swatch" style={{ background: color }} aria-label={`${label}: ${name}`} title={name} aria-pressed={value?.toLowerCase() === color} onClick={() => onChange(color)} />)}
    <label className="canvas-custom-color" title="Color personalizado"><input type="color" aria-label={`${label}: personalizado`} value={value || "#ffffff"} onChange={event => onChange(event.target.value)} /></label>
    <button type="button" className="icon-btn" aria-label={`Restaurar ${label.toLowerCase()}`} title="Color original" disabled={!value} onClick={() => onChange()}><RotateCcw size={14} /></button>
  </div>;
}
