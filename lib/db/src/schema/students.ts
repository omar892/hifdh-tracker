import { pgTable, serial, text, integer, boolean, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mushafsTable } from "./mushafs";
import { programsTable } from "./programs";
import { classesTable } from "./classes";
import { usersTable } from "./users";

/**
 * Status drives roster filtering + alert suppression. Replaces the boolean
 * `active` (which stays as a mirror for one release: active = status === 'active').
 *   active:     currently enrolled, expected to log
 *   paused:     temporarily off (travel/sick); excluded from "needs attention"
 *   graduated:  finished memorization; archived, celebrated
 *   withdrawn:  left the program; archived, no longer tracked
 */
export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "paused",
  "graduated",
  "withdrawn",
]);

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  // Multi-teacher skeleton — single program/teacher/class today, scoped queries
  // future-proof. FKs are not-null after backfill; nullable here so the
  // migration can land cols first, then UPDATE, then add NOT NULL.
  programId: integer("program_id").references(() => programsTable.id),
  classId: integer("class_id").references(() => classesTable.id),
  teacherId: integer("teacher_id").references(() => usersTable.id),

  name: text("name").notNull(),
  gender: text("gender"),
  currentPage: integer("current_page").notNull().default(1),
  currentLine: integer("current_line").notNull().default(1),
  startDate: date("start_date").notNull(),
  notes: text("notes"),

  // Status replaces `active`. We keep `active` for one release as a computed
  // mirror so frontend reads can migrate gradually without a flag day.
  status: studentStatusEnum("status").notNull().default("active"),
  statusChangedAt: timestamp("status_changed_at"),
  // Set when status moves to graduated/withdrawn — used for archival sort.
  archivedAt: timestamp("archived_at"),
  active: boolean("active").notNull().default(true),

  mushafPreference: text("mushaf_preference")
    .notNull()
    .default("madani_15")
    .references(() => mushafsTable.id),
  // Per-student defaults for RMV/Review scope. RMV scope rarely changes
  // week to week; setting it once on the profile lets log-week show it as
  // a small chip instead of a full-width input.
  defaultRmvAmount: text("default_rmv_amount"),
  defaultReviewAmount: text("default_review_amount"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({ id: true, createdAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
