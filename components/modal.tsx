"use client";
import { useEffect, useRef, ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={"modal " + (wide ? "modal-wide" : "")}
    aria-label={title} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="Cerrar" title="Cerrar" onClick={onClose}><X size={18} /></button></div>
    {children}
  </dialog>;
}
