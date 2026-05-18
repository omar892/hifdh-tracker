import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const studentCompletedJuzTable = pgTable(
  "student_completed_juz",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id),
    // Which teacher marked this juz complete (or whose entry auto-completed
    // it). Nullable so the migration can land the column, then backfill.
    teacherId: integer("teacher_id").references(() => usersTable.id),
    juzNumber: integer("juz_number").notNull(),
    autoCompleted: boolean("auto_completed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("student_juz_unique").on(table.studentId, table.juzNumber)]
);

export type StudentCompletedJuz = typeof studentCompletedJuzTable.$inferSelect;
