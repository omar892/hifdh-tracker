import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";

/**
 * Stores the Quran Foundation User-API account that an admin has linked
 * for a program. The refresh token is encrypted at rest using
 * QF_TOKEN_ENCRYPTION_KEY (AES-256-GCM); the per-request access token is
 * cached in memory by user-auth.ts, not persisted here.
 *
 * Single-tenant for now: one row per program. The unique constraint on
 * programId enforces "at most one linked account per program."
 *
 * The integration is purely program-scoped — when a teacher saves a weekly
 * entry, we mark an Activity Day on the linked account so the program's
 * QF streak reflects continuous teaching activity. No student data is ever
 * sent to QF.
 */
export const qfAccountLinksTable = pgTable("qf_account_links", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .notNull()
    .unique()
    .references(() => programsTable.id),
  qfUserId: text("qf_user_id").notNull(),
  /** Friendly name pulled from the QF profile at link time; shown in settings. */
  displayName: text("display_name"),
  /**
   * Refresh token encrypted with AES-256-GCM. Stored as:
   *   base64(iv) || ":" || base64(ciphertext) || ":" || base64(authTag)
   * See lib/quran/encryption.ts.
   */
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  /** Space-separated scopes granted at consent time. */
  scopes: text("scopes").notNull(),
  /**
   * The last date (UTC, YYYY-MM-DD) we wrote an Activity Day for this
   * account. Used as a cheap dedupe so saving multiple weekly entries on
   * the same day only pings QF once.
   */
  lastActivityDate: date("last_activity_date"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type QfAccountLink = typeof qfAccountLinksTable.$inferSelect;
export type InsertQfAccountLink = typeof qfAccountLinksTable.$inferInsert;
