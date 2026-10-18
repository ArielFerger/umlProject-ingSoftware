"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { undo, redo, undoDepth, redoDepth, indentWithTab, isolateHistory } from "@codemirror/commands";

export type EditorHandle = { undo: () => void; redo: () => void; insert: (text: string) => void };

const CodeEditor = forwardRef<EditorHandle, { value: string; onChange: (value: string) => void; onHistoryChange?: (history: { undo: boolean; redo: boolean }) => void }>(function CodeEditor({ value, onChange, onHistoryChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const historyCallback = useRef(onHistoryChange);
  historyCallback.current = onHistoryChange;
  const initial = useRef(value);
  const syncing = useRef(false);
  useImperativeHandle(ref, () => ({
    undo() { if (view.current) undo(view.current); },
    redo() { if (view.current) redo(view.current); },
    insert(text) {
      const v = view.current;
      if (v) { v.dispatch({ changes: { from: v.state.doc.length, insert: "\n" + text + "\n" } }); v.focus(); }
    },
  }));
  useEffect(() => {
    if (!host.current) return;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: initial.current, extensions: [
        basicSetup, keymap.of([indentWithTab]), EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Código Mermaid del diagrama", spellcheck: "false" }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            if (!syncing.current) callback.current(update.state.doc.toString());
            historyCallback.current?.({ undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 });
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px", color: "var(--code-ink)", backgroundColor: "var(--code-surface)" },
          ".cm-scroller": { fontFamily: "'IBM Plex Mono', monospace", lineHeight: "1.85" },
          ".cm-content": { padding: "18px 0 60px" },
          ".cm-line": { padding: "0 16px" },
          ".cm-gutters": { backgroundColor: "var(--code-surface)", color: "var(--muted)", border: "none", paddingRight: "5px" },
          ".cm-activeLine": { backgroundColor: "var(--code-line)" },
          ".cm-activeLineGutter": { backgroundColor: "var(--code-line)", color: "var(--accent)" },
          "&.cm-focused": { outline: "none" },
          ".cm-selectionBackground": { backgroundColor: "var(--selection) !important" },
        }),
      ] }),
    });
    view.current = instance;
    historyCallback.current?.({ undo: false, redo: false });
    return () => { instance.destroy(); view.current = null; };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    let start = 0;
    const minLen = Math.min(current.length, value.length);
    while (start < minLen && current.charCodeAt(start) === value.charCodeAt(start)) start++;
    let endCurrent = current.length;
    let endValue = value.length;
    while (endCurrent > start && endValue > start && current.charCodeAt(endCurrent - 1) === value.charCodeAt(endValue - 1)) {
      endCurrent--;
      endValue--;
    }
    syncing.current = true;
    try {
      v.dispatch({
        changes: { from: start, to: endCurrent, insert: value.slice(start, endValue) },
        annotations: isolateHistory.of("full"),
      });
    } finally {
      syncing.current = false;
    }
  }, [value]);
  return <div ref={host} className="code-editor" />;
});
export default CodeEditor;

