# UML Studio

This is Ariel's editable UML application, published with Sites. Reuse the existing project_id in `.openai/hosting.json` for all updates.

## Editing the app

- `components/studio.tsx`: workspace, document lifecycle, modals, import/export.
- `components/code-editor.tsx`: CodeMirror editing and history.
- `components/diagram-preview.tsx`: Mermaid rendering, pan and zoom.
- `app/globals.css`: responsive application layout and print styles.
- `lib/diagrams.ts`: shared validation, seven diagram templates, file interchange.
- `lib/store.ts`: authenticated D1 persistence and optimistic revision checks.
- `components/study.tsx`, `app/estudio/`, `app/study.css`: IS II theory, exercises, study progress and mock exams.
- `lib/study-data.json`: course content derived from Ariel's 25 documents; `public/estudio/` retains the originals and downloadable summary.
- `lib/study.ts`: validated browser-local progress, scoped using the authenticated owner returned by `/api/study-profile`.
- `db/schema.ts` and `drizzle/`: schema and generated migrations.

Keep the interface in Spanish. Use Mermaid as the canonical diagram engine. Use lucide-react icons. Check types with `node node_modules/typescript/bin/tsc --noEmit` and follow Sites skills for publication.

Class positions and arrow appearance are saved as a structured JSON Mermaid comment beginning with `%% uml-studio: `. Preserve this comment when changing a saved diagram's source. `lib/canvas.ts` validates and reads/writes this metadata; `lib/svg-canvas.ts` routes the SVG connections when classes move. Exported JSON and Mermaid include these settings; SVG and PNG preserve the visual placement.

Study exercises reuse CodeEditor and DiagramPreview. Transfer creates a new diagram only when requested; reopening an exercise diagram must not overwrite saved edits. Reasoning and UML are self-assessed with a rubric; only multiple-choice and numerical answers are graded automatically. Keep course assumptions and original source links when revising educational content.

## Editing saved diagrams from chat

The Site exposes the personal UML Studio plugin at `/mcp`, with `list_diagrams`, `get_diagram`, `create_diagram`, and `update_diagram`.

When the user requests a diagram change, use the installed plugin to read the latest diagram, modify its Mermaid source, and save it with its current revision. Preserve its name, project, type, theme, and notes unless the user requested changes. A revision conflict means a newer change exists: read it again and incorporate that change. Do not replace the user's diagrams by editing templates or adding seed migrations.

If the plugin is not connected, offer its existing installation through Sites, or work with an exported `.uml.json` file. Templates only create new documents; changing them does not modify saved documents. User data is scoped to the trusted Sites user ID.

## Local development

Run `node scripts/run-framework.mjs dev --port 5173`. The portable preview uses the development sign-in route `/signin-with-chatgpt?return_to=%2F`. Local schema migrations must be applied to `.wrangler/state`; production migrations are applied by Sites. Keep temporary previews, screenshots and local QA artifacts under the ignored `.sites-runtime/` directory.
