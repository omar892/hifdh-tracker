import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studentsTable } from "./students";
import { usersTable } from "./users";

export const weeklyEntriesTable = pgTable("weekly_entries", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  // Which teacher logged this entry. Nullable in schema so the migration can
  // land the column, then backfill, then add NOT NULL.
  teacherId: integer("teacher_id").references(() => usersTable.id),
  weekStartDate: date("week_start_date").notNull(),
  weekEndDate: date("week_end_date").notNull(),

  memorizationLines: integer("memorization_lines").notNull().default(0),
  currentPage: integer("current_page"),
  currentLine: integer("current_line"),

  // Daily pass/fail arrays (JSON text: [true,true,false,true,true])
  dailyMemorization: text("daily_memorization"),
  dailyRmv: text("daily_rmv"),
  dailyReview: text("daily_review"),
  dailyAbsent: text("daily_absent"),

  // Computed on save from daily arrays
  successfulDays: integer("successful_days").notNull().default(0),
  daysAttended: integer("days_attended").notNull().default(5),
  weeklyPoints: integer("weekly_points").notNull().default(0),

  rmvAmount: text("rmv_amount"),
  reviewAmount: text("review_amount"),
  rmvScore: integer("rmv_score"),
  reviewScore: integer("review_score"),
  weekRating: text("week_rating"),

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
