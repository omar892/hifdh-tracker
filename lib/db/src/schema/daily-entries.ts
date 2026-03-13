import { pgTable, serial, integer, boolean, date, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const dailyEntriesTable = pgTable("daily_entries", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  date: date("date").notNull(),

  newMemorizationFromSurah: integer("new_memorization_from_surah"),
  newMemorizationFromAyah: integer("new_memorization_from_ayah"),
  newMemorizationToSurah: integer("new_memorization_to_surah"),
  newMemorizationToAyah: integer("new_memorization_to_ayah"),
  newMemorizationCompleted: boolean("new_memorization_completed").notNull().default(false),
  newMemorizationGrade: text("new_memorization_grade"),

  rmvFromSurah: integer("rmv_from_surah"),
  rmvFromAyah: integer("rmv_from_ayah"),
  rmvToSurah: integer("rmv_to_surah"),
  rmvToAyah: integer("rmv_to_ayah"),
  rmvCompleted: boolean("rmv_completed").notNull().default(false),
  rmvGrade: text("rmv_grade"),

  reviewFromSurah: integer("review_from_surah"),
  reviewFromAyah: integer("review_from_ayah"),
  reviewToSurah: integer("review_to_surah"),
  reviewToAyah: integer("review_to_ayah"),
  reviewCompleted: boolean("review_completed").notNull().default(false),
  reviewGrade: text("review_grade"),

  extraReviewFromSurah: integer("extra_review_from_surah"),
  extraReviewFromAyah: integer("extra_review_from_ayah"),
  extraReviewToSurah: integer("extra_review_to_surah"),
  extraReviewToAyah: integer("extra_review_to_ayah"),

  teacherNotes: text("teacher_notes"),
  daySuccessful: boolean("day_successful").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDailyEntrySchema = createInsertSchema(dailyEntriesTable).omit({ id: true, createdAt: true });
export type InsertDailyEntry = z.infer<typeof insertDailyEntrySchema>;
export type DailyEntry = typeof dailyEntriesTable.$inferSelect;
