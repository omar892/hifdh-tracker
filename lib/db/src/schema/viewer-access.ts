import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

/**
 * Tokenized read-only access to a single student's progress page. The token
 * is the URL slug for /share/:token. No password, no account — anyone with
 * the link can view, and the teacher can revoke it.
 *
 * `notesVisibleToParent` toggles whether the parent sees `teacherNotes` from
 * weekly entries (teachers may want to keep notes internal).
 *
 * `label` is for the teacher's own bookkeeping ("Mom — sent 2026-05-18") so
 * they can tell multiple active links apart when there are siblings/co-parents.
 */
export const viewerAccessTable = pgTable("viewer_access", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label"),
  notesVisibleToParent: boolean("notes_visible_to_parent").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
  lastViewedAt: timestamp("last_viewed_at"),
});

export type ViewerAccess = typeof viewerAccessTable.$inferSelect;
