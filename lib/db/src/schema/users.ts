import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";

/**
 * Role enum — drives permissions when multi-teacher UI lands in step 7.
 *   teacher: sees only their own students; can log + manage them
 *   admin:   sees the whole program; manages teachers and class assignments
 *
 * Today there is exactly one user with role='admin' — the single teacher,
 * who is also the program owner. The enum is here so we don't need a
 * migration to add roles later.
 */
export const userRoleEnum = pgEnum("user_role", ["teacher", "admin"]);

/**
 * User account. Currently password validation goes through the TEACHER_PASSWORD
 * env var (the legacy single-teacher flow), so `passwordHash` is allowed to be
 * empty in step 1 — it becomes the real bcrypt hash when the email+password
 * login UI lands in step 7.
 */
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => programsTable.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull().default(""),
  role: userRoleEnum("role").notNull().default("teacher"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
