import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Top-level container for a hifdh program. Owns users (teachers + admin),
 * classes, and (transitively) students.
 *
 * Single-tenant for now: there is exactly one program row in production,
 * and every read query is implicitly scoped to "this program" via the
 * current user's program_id. The skeleton is here so adding more programs
 * later is a UI/permissions change, not a schema migration.
 *
 * `ownerId` references the admin user who owns the program. FK is added
 * AFTER usersTable is created — see schema/users.ts for the deferred wiring.
 */
export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id"), // → usersTable.id (FK added after users exists)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Program = typeof programsTable.$inferSelect;
