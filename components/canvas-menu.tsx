"use client";
import { useLayoutEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuAction = { label: string; icon: ReactNode; run: () => void; danger?: boolean; disabled?: boolean; separator?: boolean };
export default function CanvasMenu({ x, y, title, actions, onClose, dark = false, container }: {
  x: number; y: number; title: string; actions: MenuAction[]; onClose: () => void; dark?: boolean; container?: Element;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const el = menu.current; if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    el.showPopover?.();
    setPosition({ x: Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8)), y: Math.max(8, Math.min(y, innerHeight - el.offsetHeight - 8)) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!el.contains(event.target as Node)) onClose(); };
    const close = () => onClose();
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !el.contains(event.target)) onClose(); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      if (el.isConnected && el.matches(":popover-open")) el.hidePopover?.();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
      if (previous?.isConnected && (el.contains(document.activeElement) || document.activeElement === document.body)) previous.focus({ preventScroll: true });
    };
  }, [x, y, onClose]);
  return createPortal(<div popover="manual" className={"canvas-context-menu" + (dark ? " context-dark" : "")} role="menu" aria-label={title} ref={menu}
    style={{ left: position.x, top: position.y }} onContextMenu={e => e.preventDefault()} onKeyDown={e => {
      const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      } else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); onClose(); }
    }}>
    <div className="context-title">{title}</div>
    {actions.map(action => <div key={action.label}>{action.separator && <div role="separator" className="context-separator" />}<button type="button" role="menuitem" disabled={action.disabled} className={action.danger ? "context-danger" : ""}
      onClick={() => { onClose(); action.run(); }}>{action.icon}<span>{action.label}</span></button></div>)}
  </div>, container || document.body);
}
