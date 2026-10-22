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
}, (table) => [index("idx_diagrams_owner").on(table.owner), index("idx_diagrams_project").on(table.owner, table.project)]);

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

// A shared project grants access to every diagram its owner keeps under that
// project name, including diagrams added after the invitation.
export const projectMembers = sqliteTable("project_members", {
  owner: text("owner").notNull(),
  project: text("project").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  joinedAt: text("joined_at").notNull(),
}, table => [uniqueIndex("idx_project_member").on(table.owner, table.project, table.userId), index("idx_project_member_user").on(table.userId)]);

export const projectInvites = sqliteTable("project_invites", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  project: text("project").notNull(),
  ownerName: text("owner_name").notNull().default(""),
  tokenHash: text("token_hash").notNull(),
  role: text("role").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_project_invite_token").on(table.tokenHash), index("idx_project_invite_project").on(table.owner, table.project)]);

// Short-lived heartbeats: one row per open browser tab on a board.
export const boardPresence = sqliteTable("board_presence", {
  diagramId: text("diagram_id").notNull().references(() => diagrams.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  selection: text("selection").notNull().default(""),
  color: text("color").notNull().default(""),
  lastSeen: integer("last_seen").notNull(),
}, table => [uniqueIndex("idx_presence_session").on(table.diagramId, table.sessionId), index("idx_presence_seen").on(table.lastSeen)]);
