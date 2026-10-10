"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { undo, redo, indentWithTab, isolateHistory } from "@codemirror/commands";

export type EditorHandle = { undo: () => void; redo: () => void; insert: (text: string) => void };

const CodeEditor = forwardRef<EditorHandle, { value: string; onChange: (value: string) => void }>(function CodeEditor({ value, onChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const initial = useRef(value);
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
        EditorView.updateListener.of(update => { if (update.docChanged) callback.current(update.state.doc.toString()); }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px", color: "#38414b", backgroundColor: "#fcfcfd" },
          ".cm-scroller": { fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace", lineHeight: "1.85" },
          ".cm-content": { padding: "18px 0 60px" },
          ".cm-line": { padding: "0 16px" },
          ".cm-gutters": { backgroundColor: "#fcfcfd", color: "#687b70", border: "none", paddingRight: "5px" },
          ".cm-activeLine": { backgroundColor: "#edf4f1" },
          ".cm-activeLineGutter": { backgroundColor: "#edf4f1", color: "#347960" },
          "&.cm-focused": { outline: "none" },
          ".cm-selectionBackground": { backgroundColor: "#bce2d2 !important" },
        }),
      ] }),
    });
    view.current = instance;
    return () => { instance.destroy(); view.current = null; };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: isolateHistory.of("full") });
  }, [value]);
  return <div ref={host} className="code-editor" />;
});
export default CodeEditor;
