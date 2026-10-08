import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  initializedAt: text("initialized_at").notNull(),
});

export const diagrams = sqliteTable("diagrams", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  project: text("project").notNull(),
  source: text("source").notNull(),
  theme: text("theme").notNull().default("studio"),
  notes: text("notes").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_diagrams_owner").on(table.owner)]);

export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(),
  diagramId: text("diagram_id").notNull().references(() => diagrams.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_revisions_diagram").on(table.diagramId, table.revision)]);
