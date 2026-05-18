import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";

/**
 * Lightweight contact record for a parent/guardian/uncle/etc. NOT a login
 * account — there's no password and no auth. Parents see student progress
 * via the tokenized link (viewer_access table), no credentials needed.
 *
 * Real parent auth is a much later phase if ever.
 */
export const guardiansTable = pgTable("guardians", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  relationship: text("relationship"), // "Mother", "Father", "Uncle", "Guardian", etc.
  primary: boolean("primary").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Guardian = typeof guardiansTable.$inferSelect;
