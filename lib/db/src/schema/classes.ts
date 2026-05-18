import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";
import { usersTable } from "./users";

/**
 * A class is a teacher's group of students within a program. Today there is
 * exactly one class per program. When multi-teacher UI lands the same teacher
 * can have multiple classes (e.g., "Morning" and "Afternoon"), and an admin
 * sees all classes across all teachers in the program.
 */
export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Class = typeof classesTable.$inferSelect;
