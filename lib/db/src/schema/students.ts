import { pgTable, serial, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mushafsTable } from "./mushafs";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gender: text("gender"),
  currentPage: integer("current_page").notNull().default(1),
  currentLine: integer("current_line").notNull().default(1),
  startDate: date("start_date").notNull(),
  notes: text("notes"),
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
