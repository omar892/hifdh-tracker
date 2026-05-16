/**
 * Read-side helpers for the mushaf_pages cache.
 *
 * - pageToVerses(mushafId, n) — single page, returns the cached row
 * - pageRangeToVerses(mushafId, start, end) — multi-page span as one merged
 *   surah breakdown, used for "this week's coverage"
 * - enrichLogEntry — derive verse coverage from previous→current position and
 *   attach it to an entry for response shaping
 */

import { db, mushafPagesTable, type MushafPage, type PageSurahBreakdown } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";

export async function pageToVerses(
  mushafId: string,
  pageNumber: number,
): Promise<MushafPage | null> {
  const [row] = await db
    .select()
    .from(mushafPagesTable)
    .where(
      and(
        eq(mushafPagesTable.mushafId, mushafId),
        eq(mushafPagesTable.pageNumber, pageNumber),
      ),
    );
  return row ?? null;
}

export interface PageRangeCoverage {
  startPage: number;
  endPage: number;
  firstVerseKey: string;
  lastVerseKey: string;
  totalVerses: number;
  surahs: PageSurahBreakdown[];
}

/**
 * Fetch all pages in [startPage, endPage], merge surah breakdowns so the same
 * surah doesn't appear twice (its ayah range is widened instead).
 */
export async function pageRangeToVerses(
  mushafId: string,
  startPage: number,
  endPage: number,
): Promise<PageRangeCoverage | null> {
  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);

  const rows = await db
    .select()
    .from(mushafPagesTable)
    .where(
      and(
        eq(mushafPagesTable.mushafId, mushafId),
        gte(mushafPagesTable.pageNumber, lo),
        lte(mushafPagesTable.pageNumber, hi),
      ),
    )
    .orderBy(mushafPagesTable.pageNumber);

  if (rows.length === 0) return null;

  const merged = new Map<number, PageSurahBreakdown>();
  let totalVerses = 0;
  for (const r of rows) {
    totalVerses += r.versesCount;
    const surahs = r.surahs as PageSurahBreakdown[];
    for (const s of surahs) {
      const existing = merged.get(s.surahNumber);
      if (!existing) {
        merged.set(s.surahNumber, { ...s });
      } else {
        existing.ayahStart = Math.min(existing.ayahStart, s.ayahStart);
        existing.ayahEnd = Math.max(existing.ayahEnd, s.ayahEnd);
      }
    }
  }

  const surahs = [...merged.values()].sort((a, b) => a.surahNumber - b.surahNumber);
  return {
    startPage: lo,
    endPage: hi,
    firstVerseKey: rows[0].firstVerseKey,
    lastVerseKey: rows[rows.length - 1].lastVerseKey,
    totalVerses,
    surahs,
  };
}

export interface EnrichedCoverage {
  fromPage: number;
  fromLine: number;
  toPage: number;
  toLine: number;
  coverage: PageRangeCoverage | null;
}

/**
 * Compute the verse coverage of one week from the student's position at the
 * start of the week (prevPage/prevLine) to the position at the end of the
 * week (currentPage/currentLine). Either side may be null, in which case
 * coverage is also null.
 */
export async function enrichLogEntry(args: {
  mushafId: string;
  prevPage: number | null;
  prevLine: number | null;
  currentPage: number | null;
  currentLine: number | null;
}): Promise<EnrichedCoverage | null> {
  const { mushafId, prevPage, prevLine, currentPage, currentLine } = args;
  if (currentPage == null || currentLine == null) return null;
  if (prevPage == null || prevLine == null) {
    // First entry: count the current page only
    const coverage = await pageRangeToVerses(mushafId, currentPage, currentPage);
    return { fromPage: currentPage, fromLine: 1, toPage: currentPage, toLine: currentLine, coverage };
  }
  const coverage = await pageRangeToVerses(mushafId, prevPage, currentPage);
  return { fromPage: prevPage, fromLine: prevLine, toPage: currentPage, toLine: currentLine, coverage };
}
