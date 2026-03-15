import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";

export const weeklyEntriesTable = pgTable("weekly_entries", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  weekStartDate: date("week_start_date").notNull(),
  weekEndDate: date("week_end_date").notNull(),

  newMemFromSurah: integer("new_mem_from_surah"),
  newMemFromAyah: integer("new_mem_from_ayah"),
  newMemToSurah: integer("new_mem_to_surah"),
  newMemToAyah: integer("new_mem_to_ayah"),
  ayahsMemorized: integer("ayahs_memorized").notNull().default(0),

  successfulDays: integer("successful_days").notNull().default(0),
  daysAttended: integer("days_attended").notNull().default(5),

  weekRating: text("week_rating"),
  rmvQuality: text("rmv_quality"),
  reviewQuality: text("review_quality"),

  teacherNotes: text("teacher_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWeeklyEntrySchema = createInsertSchema(weeklyEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWeeklyEntry = z.infer<typeof insertWeeklyEntrySchema>;
export type WeeklyEntry = typeof weeklyEntriesTable.$inferSelect;
