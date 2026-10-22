# UML Studio

This is Ariel's editable UML application, published with Sites. Reuse the existing project_id in `.openai/hosting.json` for all updates.

## Editing the app

- `components/studio.tsx`: workspace, document lifecycle, modals, import/export.
- `components/code-editor.tsx`: CodeMirror editing and history.
- `components/diagram-preview.tsx`: Mermaid rendering, pan and zoom.
- `components/canvas-frames.tsx`, `lib/frames.ts`, `lib/svg-frames.ts`: module frames and annotation arrows, stored in canvas metadata. Preserve their titles, colors, bounds and connectors in undo, shared merges and exports. Frame dragging moves only fully enclosed classes when enabled; resizing and frame deletion never remove or resize classes. Keep frame hit areas and resize handles out of exports.
- `components/canvas-menu.tsx`, `lib/class-actions.ts`: accessible context menus and targeted class mutations. Preserve unrelated declarations, annotations, relationships and canvas metadata.
- `app/canvas-interactions.css`: contextual controls and purposeful motion; honor reduced-motion preferences.
- `app/globals.css`: responsive application layout and print styles.
- `lib/diagrams.ts`: shared validation, seven diagram templates, file interchange.
- `lib/store.ts`, `lib/board-access.ts`: authenticated D1 persistence, shared board membership/invites and optimistic revision checks. Viewers never write; only owners delete boards or manage access. Invitation hashes, not raw tokens, are stored. Revoke invite links separately from existing memberships.
- `lib/shared-sync.ts`, `components/sharing.tsx`, `app/join/`: shared-board synchronization and invitation UI. Preserve local drafts on conflicts, merge only independent edits and exclude remote updates from local undo history.
- `scripts/online-gateway.mjs`, `compose.online.yaml`, `deploy/`: VPS accounts and deployment. The gateway strips supplied identity headers, authenticates HttpOnly sessions and validates Host/Origin. Preserve the localhost-only single-user Docker adapter. Keep account and D1 files on the persistent online volume.
- `lib/studio-request.ts`, `lib/browser-workspace.ts`: Vercel's browser-owned IndexedDB adapter; preserve transactional revision checks and history. Docker/Sites keep the authenticated D1 adapter.
- `lib/relation-actions.ts`: mutate only the selected relationship, preserving other source lines and canvas metadata. SVG hit areas and selection classes must stay out of exports.
- `lib/visual-diagrams.ts`, `lib/visual-svg.ts`: non-class element/connection forms, targeted source changes and unified SVG geometry. Use-case actors carry `:::umlActor`; reserve their layout space and route connections to the figure, not its transparent hit area. SVG/PNG must retain standalone actor styling.
- Sequence dragging reorders participant declarations only; preserve message order and grouped participants. All seven diagram families share the editor history. Complex source structures must fail safely rather than drop unrelated declarations.
- `components/study.tsx`, `app/estudio/`, `app/study.css`: IS II theory, exercises, study progress and mock exams.
- `lib/study-data.json`: course content derived from Ariel's 25 documents; `public/estudio/` retains the originals and downloadable summary.
- `lib/study-visuals.json`, `components/study-visual.tsx`: additions from the supplied 36-page summary (`public/estudio/fuentes/27.pdf`), guided pattern structures/sequences and theory maps. Keep original exercise IDs and source references; scope editable-copy IDs to the study owner and reopen without overwriting changes. `Exercise.diagramType` and `starter` preserve sequence diagrams in drafts, solutions and editor transfer.
- `lib/study.ts`: validated browser-local progress, scoped using the authenticated owner returned by `/api/study-profile`.
- `lib/study-exams.json`: exam-image sources, overrides preserving existing exercise IDs, company cases and C++17 readings. C++ is read-only: students answer in prose or UML, never in a C++ editor. `lib/study-correction.ts` copies the task and actual student answer/draft, never the reference solution or answer key. Preserve clipboard recovery and the active mock-exam restriction.
- `lib/study-papers.json`, `lib/study-paper.ts`, `components/study-paper.tsx`: historical exam papers, presented consecutively with original text, numbering, points and source language. Never replace a historical statement with a summary or add tasks to it. Original 2024 includes a fourth question from source 17; the 2025 theory has five questions before its two practice questions. Training adaptations remain separate. Paper answer IDs begin `p2024-`/`p2025-`; preserve them in progress import/export without counting them as training XP. Year-based timers open the whole paper. Original PHP/Eiffel wording is retained only on historical papers; C++ adaptations are separate read-only training.
- `lib/study-choice.json`: 50 multiple-choice training questions from summary source 32 and exam topics, IDs e106–e155. Keep four unique choices, one answer and aligned `choiceExplanations`. Do not move them into historical papers. `lib/study-grading.ts` validates choice indices and numeric answers; rejected indices must not be converted to answer zero. Choice mode uses `/estudio?modo=opciones`, supports existing filters and progresses only among choices. Incorrect feedback explains the selected distractor without awarding completion.
- `lib/der.ts`, `drawDerNode` in `lib/visual-svg.ts`: Chen-notation ER (`der` type) as a Mermaid flowchart whose nodes carry `:::der*` classes; relationship ratios live in `%% der-ratio <id> <ratio>` comments. Shapes are redrawn with inline styles so exports keep them; lines stop at the shape outline (`shapeBoundary`) and cardinalities sit beside the entity end. `chenLayout` places unplaced attributes around their owner at render time; positions the user saves always win.
- Shared projects (`project_members`, `project_invites`) grant access to every diagram of `(owner, project)`. `ACCESS_SQL`, `EDIT_SQL` and `ROLE_SQL` include project membership; bind the user id with `asUser`. Only owners move a board to another project. Editors create diagrams in a shared project with `projectOwner`, which keeps the project owner as owner.
- `lib/presence.ts`, `/api/presence`: per-tab heartbeats (5 s, 20 s TTL) listing who is on a board and their selected element. Session ids cannot be taken over by another account. Remote selection rings (`.studio-remote-selection`) stay out of exports.
- `db/schema.ts` and `drizzle/`: schema and generated migrations.

Keep the interface in Spanish. Use Mermaid as the canonical diagram engine. Use lucide-react icons. Check types with `node node_modules/typescript/bin/tsc --noEmit` and follow Sites skills for publication.

Class positions and arrow appearance are saved as a structured JSON Mermaid comment beginning with `%% uml-studio: `. Preserve this comment when changing a saved diagram's source. `lib/canvas.ts` validates and reads/writes this metadata; `lib/svg-canvas.ts` routes the SVG connections when classes move. Exported JSON and Mermaid include these settings; SVG and PNG preserve the visual placement.

Study exercises reuse CodeEditor and DiagramPreview. Transfer creates a new diagram only when requested; reopening an exercise diagram must not overwrite saved edits. Reasoning and UML are self-assessed with a rubric; only multiple-choice and numerical answers are graded automatically. Keep course assumptions and original source links when revising educational content.

DiagramPreview enables class editing only when `onSourceChange` is provided. Reference and solution diagrams stay read-only. Context menus use the popover top layer and mount inside the active dialog when applicable. Source changes from forms and canvas actions are isolated in CodeMirror history so each gesture can be undone. Run `npm test` for canvas metadata and class mutation tests.

## Editing saved diagrams from chat

The Site exposes the personal UML Studio plugin at `/mcp`, with `list_diagrams`, `get_diagram`, `create_diagram`, and `update_diagram`.

When the user requests a diagram change, use the installed plugin to read the latest diagram, modify its Mermaid source, and save it with its current revision. Preserve its name, project, type, theme, and notes unless the user requested changes. A revision conflict means a newer change exists: read it again and incorporate that change. Do not replace the user's diagrams by editing templates or adding seed migrations.

If the plugin is not connected, offer its existing installation through Sites, or work with an exported `.uml.json` file. Templates only create new documents; changing them does not modify saved documents. User data is scoped to the trusted Sites user ID.

## Local development

Run `node scripts/run-framework.mjs dev --port 5173`. The portable preview uses the development sign-in route `/signin-with-chatgpt?return_to=%2F`. Local schema migrations must be applied to `.wrangler/state`; production migrations are applied by Sites. Keep temporary previews, screenshots and local QA artifacts under the ignored `.sites-runtime/` directory.

For Vercel, use `npm run build:vercel` and `npm run start:vercel -- --hostname 127.0.0.1 --port 3002`; `npm run dev:vercel` is the Next.js development alternative. Vercel builds use browser storage and do not provide the Sites MCP connector or a shared database. Never trust user-supplied Sites identity headers on Vercel. `vercel.json` selects the Next.js framework and build command.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
