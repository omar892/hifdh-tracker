import { pgTable, text, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

/**
 * Catalog of Mushaf layouts the app supports.
 * `id` is the app-level slug (stable across deploys); `quranApiId` is the
 * Quran Foundation `mushaf` query param value, resolved at sync time so we're
 * not hard-coding upstream IDs.
 */
export const mushafsTable = pgTable("mushafs", {
  id: text("id").primaryKey(), // 'madani_15' | 'indopak_15'
  quranApiId: integer("quran_api_id").notNull(),
  displayName: text("display_name").notNull(),
  totalPages: integer("total_pages").notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
});

export type Mushaf = typeof mushafsTable.$inferSelect;

/**
 * Per-page → verse-range cache, populated by syncMushafPages().
 * `surahs` is the structured breakdown derived from QF's `verse_mapping`,
 * shaped for direct display use:
 *   [{ surahNumber: 2, name: "Al-Baqarah", ayahStart: 144, ayahEnd: 152 }, ...]
 */
export const mushafPagesTable = pgTable(
  "mushaf_pages",
  {
    mushafId: text("mushaf_id")
      .notNull()
      .references(() => mushafsTable.id),
    pageNumber: integer("page_number").notNull(),
    firstVerseKey: text("first_verse_key").notNull(), // e.g. '2:144'
    lastVerseKey: text("last_verse_key").notNull(),
    versesCount: integer("verses_count").notNull(),
    surahs: jsonb("surahs").notNull(), // PageSurahBreakdown[]
  },
  (t) => [primaryKey({ columns: [t.mushafId, t.pageNumber] })],
);

export interface PageSurahBreakdown {
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
}

export type MushafPage = typeof mushafPagesTable.$inferSelect;
