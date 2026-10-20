import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const diagramMembers = sqliteTable("diagram_members", {
  diagramId: text("diagram_id").notNull().references(() => diagrams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  joinedAt: text("joined_at").notNull(),
}, table => [uniqueIndex("idx_diagram_member").on(table.diagramId, table.userId), index("idx_member_user").on(table.userId)]);

export const diagramInvites = sqliteTable("diagram_invites", {
  id: text("id").primaryKey(),
  diagramId: text("diagram_id").notNull().references(() => diagrams.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  role: text("role").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_invite_token").on(table.tokenHash)]);
