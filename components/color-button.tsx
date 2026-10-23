"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";

export const ELEMENT_COLORS = [
  ["Amarillo", "#fde68a"], ["Verde", "#bbf7d0"], ["Celeste", "#bae6fd"], ["Violeta", "#ddd6fe"],
  ["Rosa", "#fecdd3"], ["Naranja", "#fed7aa"], ["Rojo", "#dc2626"], ["Azul", "#2563eb"],
  ["Verde oscuro", "#15803d"], ["Gris oscuro", "#334155"],
] as const;

/**
 * One swatch that opens a small palette, so selection bars stay compact.
 * `value` undefined means the original color; `onChange()` restores it.
 */
export default function ColorButton({ label, value, onChange, colors = ELEMENT_COLORS, allowReset = true }: { label: string; value?: string; onChange: (color?: string) => void; colors?: readonly (readonly [string, string])[]; allowReset?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", close, true); window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", key, true); };
  }, [open]);
  return <div className="color-button" ref={box}>
    <button type="button" className="icon-btn color-button-trigger" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {value ? <span className="color-button-dot" style={{ background: value }} /> : <Palette size={16} />}
    </button>
    {open && <div className="color-popover" role="group" aria-label={label}>
      {colors.map(([name, color]) => <button key={color} type="button" className="color-popover-swatch" style={{ background: color }} title={name} aria-label={`${label}: ${name}`} aria-pressed={value?.toLowerCase() === color} onClick={() => { onChange(color); setOpen(false); }}>{value?.toLowerCase() === color && <Check size={13} />}</button>)}
      <label className="color-popover-swatch color-popover-custom" title="Otro color"><input type="color" aria-label={`${label}: personalizado`} value={value || "#ffffff"} onChange={event => onChange(event.target.value)} /></label>
      {allowReset && <button type="button" className="color-popover-reset" disabled={!value} onClick={() => { onChange(); setOpen(false); }}><RotateCcw size={13} />Original</button>}
    </div>}
  </div>;
}
