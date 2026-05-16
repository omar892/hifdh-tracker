/**
 * Hydrate `mushaf_pages` from the Quran Foundation /pages endpoint.
 *
 * Run via `pnpm --filter @workspace/scripts run quran:sync` (CLI), or call
 * `syncMushafPages(id)` from server code on first cold start.
 */

import { db, mushafsTable, mushafPagesTable, type PageSurahBreakdown } from "@workspace/db";
import { eq } from "drizzle-orm";
import { quranGet } from "./client";

interface QFPage {
  id: number;
  page_number: number;
  verse_mapping: Record<string, string>; // {"2:144": "2:152"}
  first_verse_id: number;
  last_verse_id: number;
  verses_count: number;
}

interface ListPagesResponse {
  pages: QFPage[];
}

/**
 * Parse QF's verse_mapping into our structured surah breakdown.
 * Handles pages that span multiple surahs (multiple keys in the mapping).
 */
export function parseVerseMapping(
  verseMapping: Record<string, string>,
): { firstVerseKey: string; lastVerseKey: string; surahs: PageSurahBreakdown[] } {
  const entries = Object.entries(verseMapping);
  if (entries.length === 0) {
    throw new Error("verse_mapping is empty");
  }

  const surahs: PageSurahBreakdown[] = entries.map(([startKey, endKey]) => {
    const [startSurah, startAyah] = startKey.split(":").map(Number);
    const [endSurah, endAyah] = endKey.split(":").map(Number);
    if (startSurah !== endSurah) {
      // Each verse_mapping entry should be per-surah; QF format guarantees this.
      throw new Error(`Unexpected cross-surah mapping entry: ${startKey} → ${endKey}`);
    }
    return { surahNumber: startSurah, ayahStart: startAyah, ayahEnd: endAyah };
  });

  // Order by surah number ascending so first/last keys reflect reading order
  surahs.sort((a, b) => a.surahNumber - b.surahNumber);

  const first = surahs[0];
  const last = surahs[surahs.length - 1];
  return {
    firstVerseKey: `${first.surahNumber}:${first.ayahStart}`,
    lastVerseKey: `${last.surahNumber}:${last.ayahEnd}`,
    surahs,
  };
}

/**
 * Sync all pages for one mushaf into the local cache.
 * Returns the number of pages written.
 */
export async function syncMushafPages(mushafId: string): Promise<number> {
  const [mushaf] = await db.select().from(mushafsTable).where(eq(mushafsTable.id, mushafId));
  if (!mushaf) {
    throw new Error(`Unknown mushaf id: ${mushafId}. Seed it in the mushafs table first.`);
  }

  const data = await quranGet<ListPagesResponse>("/pages", {
    query: { mushaf: mushaf.quranApiId },
  });

  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    throw new Error(`Quran Foundation returned no pages for mushaf=${mushaf.quranApiId}`);
  }

  const rows = data.pages.map((p) => {
    const parsed = parseVerseMapping(p.verse_mapping);
    return {
      mushafId,
      pageNumber: p.page_number,
      firstVerseKey: parsed.firstVerseKey,
      lastVerseKey: parsed.lastVerseKey,
      versesCount: p.verses_count,
      surahs: parsed.surahs,
    };
  });

  // Pages data is static per mushaf; cleanest sync is a full replace inside a txn.
  await db.transaction(async (tx) => {
    await tx.delete(mushafPagesTable).where(eq(mushafPagesTable.mushafId, mushafId));
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(mushafPagesTable).values(rows.slice(i, i + BATCH));
    }
  });

  await db
    .update(mushafsTable)
    .set({ lastSyncedAt: new Date() })
    .where(eq(mushafsTable.id, mushafId));

  return rows.length;
}

/**
 * Sync every mushaf in the catalog.
 */
export async function syncAllMushafs(): Promise<Record<string, number>> {
  const mushafs = await db.select().from(mushafsTable);
  const result: Record<string, number> = {};
  for (const m of mushafs) {
    console.log(`[quran:sync] syncing ${m.id} (quran_api_id=${m.quranApiId})...`);
    const count = await syncMushafPages(m.id);
    console.log(`[quran:sync]   ✓ ${m.id}: ${count} pages`);
    result[m.id] = count;
  }
  return result;
}
