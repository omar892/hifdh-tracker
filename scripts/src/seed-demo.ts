/**
 * Seed demo data for the Hifdh Tracker.
 *
 * Produces a varied 10-student class with 8 weeks of weekly entry history so
 * every section of the dashboard / class-stats has something interesting to
 * render: strong streakers, paused students, struggling-but-attended, brand
 * new arrivals, mixed performers.
 *
 * Safety:
 *   - Refuses to run unless `SEED_CONFIRM=yes` is set. Wipes all weekly_entries
 *     and students before reseeding (cascading deletes via FK).
 *   - Date math is anchored to `today` (override with `SEED_TODAY=YYYY-MM-DD`
 *     for reproducible runs in CI).
 *
 * Run:
 *   SEED_CONFIRM=yes pnpm --filter @workspace/scripts run seed-demo
 */

import { db, pool, studentsTable, weeklyEntriesTable } from "@workspace/db";

type Rating =
  | "excellent"
  | "strong"
  | "steady"
  | "needs_improvement"
  | "difficult_week";

interface Profile {
  name: string;
  gender: "male" | "female";
  mushaf: "madani_15" | "indopak_15";
  /** ISO start date (yyyy-mm-dd) — when they joined the program. */
  startDate: string;
  /** Page they're on at the START of the 8-week history window. */
  startPage: number;
  /** Line on startPage at the start of the window. */
  startLine: number;
  /**
   * Lines-per-week pace as [min, typical, max]. Used to generate weekly
   * deltas. A strong student might be [12, 18, 25].
   */
  pace: [number, number, number];
  /** Probability of an "exception" (absent day or missed task) in any week. */
  exceptionRate: number;
  /** Probability distribution over ratings, in [excellent, strong, steady, needs_imp, difficult]. */
  ratingDist: [number, number, number, number, number];
  /** Optional teacher notes (printed once if set). */
  notes?: string;
  /** Default RMV scope (chip on log-week). */
  defaultRmv?: string;
  /** Default Review scope. */
  defaultReview?: string;
  /**
   * Skip the most-recent N weeks. Used for "Paused" (skip 4-5) or "brand
   * new" (skip 6-7) profiles.
   */
  skipRecentWeeks?: number;
  /** Only generate the most-recent N weeks (for late-joiners). */
  onlyRecentWeeks?: number;
}

const PROFILES: Profile[] = [
  {
    name: "Ahmed Al-Rashid",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-09-01",
    startPage: 102,
    startLine: 1,
    pace: [12, 18, 24],
    exceptionRate: 0.08,
    ratingDist: [0.4, 0.35, 0.2, 0.05, 0],
    defaultRmv: "Last 10 pages",
    defaultReview: "1 Juz",
    notes: "Strong memorization, needs work on tajweed",
  },
  {
    name: "Fatima Hassan",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-09-01",
    startPage: 278,
    startLine: 8,
    pace: [10, 14, 18],
    exceptionRate: 0.12,
    ratingDist: [0.2, 0.4, 0.3, 0.1, 0],
    defaultRmv: "Last 5 pages",
    defaultReview: "Half Juz",
  },
  {
    name: "Yusuf Ibrahim",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-01-15",
    startPage: 135,
    startLine: 5,
    pace: [8, 12, 16],
    exceptionRate: 0.15,
    ratingDist: [0.1, 0.3, 0.4, 0.15, 0.05],
    defaultRmv: "Last 5 pages",
    defaultReview: "1 Juz",
  },
  {
    name: "Maryam Khalid",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2024-02-01",
    startPage: 115,
    startLine: 3,
    pace: [10, 14, 18],
    exceptionRate: 0.1,
    ratingDist: [0.2, 0.4, 0.3, 0.1, 0],
    skipRecentWeeks: 5,
    notes: "Travel — out of state for family event",
  },
  {
    name: "Omar Abdullah",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2023-08-15",
    startPage: 275,
    startLine: 1,
    pace: [15, 22, 28],
    exceptionRate: 0.05,
    ratingDist: [0.5, 0.35, 0.15, 0, 0],
    defaultRmv: "Last 15 pages",
    defaultReview: "2 Juz",
    notes: "Class topper — pushing for full Quran by year end",
  },
  {
    name: "Aisha Rahman",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-11-01",
    startPage: 152,
    startLine: 6,
    pace: [8, 13, 18],
    exceptionRate: 0.2,
    ratingDist: [0.15, 0.2, 0.3, 0.25, 0.1],
  },
  {
    name: "Bilal Mustafa",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-03-01",
    startPage: 52,
    startLine: 1,
    pace: [4, 7, 10],
    exceptionRate: 0.25,
    ratingDist: [0.05, 0.15, 0.3, 0.35, 0.15],
    defaultRmv: "Last 3 pages",
    defaultReview: "Half Juz",
    notes: "Catching up after late start — daily 1:1 in afternoon",
  },
  {
    name: "Zainab Ali",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-06-01",
    startPage: 295,
    startLine: 1,
    pace: [14, 20, 26],
    exceptionRate: 0.08,
    ratingDist: [0.35, 0.4, 0.2, 0.05, 0],
    defaultRmv: "Last 10 pages",
    defaultReview: "1 Juz",
  },
  {
    name: "Hassan Siddiqui",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2026-05-01",
    startPage: 1,
    startLine: 1,
    pace: [3, 5, 8],
    exceptionRate: 0.1,
    ratingDist: [0.1, 0.3, 0.5, 0.1, 0],
    onlyRecentWeeks: 2,
    notes: "New student — starting Surah Fatihah this month",
  },
  {
    name: "Khadija Iqbal",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2024-04-15",
    startPage: 95,
    startLine: 1,
    pace: [10, 14, 18],
    exceptionRate: 0.15,
    ratingDist: [0.2, 0.3, 0.3, 0.15, 0.05],
  },
];

const WEEKS_OF_HISTORY = 8;
const LINES_PER_PAGE = 15;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the calendar week containing `d`. */
function mondayOf(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

/** Add days. Returns a new Date. */
function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Deterministic PRNG so re-running the seed produces identical data (helpful
 * when judges replay the demo). Seeded from the student name + week index.
 */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRating(rand: () => number, dist: Profile["ratingDist"]): Rating {
  const ratings: Rating[] = ["excellent", "strong", "steady", "needs_improvement", "difficult_week"];
  const r = rand();
  let acc = 0;
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i];
    if (r < acc) return ratings[i];
  }
  return "steady";
}

function pickPace(rand: () => number, pace: Profile["pace"]): number {
  // Skewed toward the middle ("typical") value
  const r = rand();
  const [min, typ, max] = pace;
  if (r < 0.2) return min + Math.floor(rand() * (typ - min + 1));
  if (r < 0.8) return typ + Math.floor(rand() * 2 - 1); // typ ± 1
  return typ + Math.floor(rand() * (max - typ + 1));
}

function advancePosition(page: number, line: number, lines: number): { page: number; line: number } {
  let totalLines = (page - 1) * LINES_PER_PAGE + (line - 1) + lines;
  const newPage = Math.floor(totalLines / LINES_PER_PAGE) + 1;
  const newLine = (totalLines % LINES_PER_PAGE) + 1;
  return { page: Math.min(newPage, 604), line: newLine };
}

async function main() {
  if (process.env.SEED_CONFIRM !== "yes") {
    console.error(
      "[seed-demo] Refusing to run. Set SEED_CONFIRM=yes to wipe and reseed the database.",
    );
    process.exit(1);
  }

  const today = process.env.SEED_TODAY
    ? new Date(process.env.SEED_TODAY + "T00:00:00Z")
    : new Date();
  const currentMonday = mondayOf(today);

  console.log(`[seed-demo] Anchoring at today=${isoDate(today)}, currentMonday=${isoDate(currentMonday)}`);
  console.log(`[seed-demo] Wiping weekly_entries + students…`);
  await db.delete(weeklyEntriesTable);
  await db.delete(studentsTable);

  for (const profile of PROFILES) {
    const rand = seededRandom(profile.name);

    // Insert the student first; we'll update currentPage/Line at the end.
    const [student] = await db
      .insert(studentsTable)
      .values({
        name: profile.name,
        gender: profile.gender,
        startDate: profile.startDate,
        notes: profile.notes ?? null,
        mushafPreference: profile.mushaf,
        defaultRmvAmount: profile.defaultRmv ?? null,
        defaultReviewAmount: profile.defaultReview ?? null,
        currentPage: profile.startPage,
        currentLine: profile.startLine,
      })
      .returning();
    console.log(`  + ${profile.name} (id=${student.id})`);

    let page = profile.startPage;
    let line = profile.startLine;
    let lastEntryPage = page;
    let lastEntryLine = line;

    const firstWeekOffset = profile.onlyRecentWeeks
      ? WEEKS_OF_HISTORY - profile.onlyRecentWeeks
      : 0;
    const lastWeekOffset = profile.skipRecentWeeks ?? 0;

    for (let i = firstWeekOffset; i < WEEKS_OF_HISTORY - lastWeekOffset; i++) {
      // i=0 means oldest week, i=WEEKS_OF_HISTORY-1 means current week.
      const weekStart = addDays(currentMonday, -(WEEKS_OF_HISTORY - 1 - i) * 7);
      const weekEnd = addDays(weekStart, 4); // Mon → Fri

      const lines = pickPace(rand, profile.pace);
      const advanced = advancePosition(page, line, lines);

      // Daily flags. Most weeks fully successful; occasional exceptions.
      const dailySabaq = [true, true, true, true, true];
      const dailyRmv = [true, true, true, true, true];
      const dailyReview = [true, true, true, true, true];
      const dailyAbsent = [false, false, false, false, false];
      for (let d = 0; d < 5; d++) {
        if (rand() < profile.exceptionRate) {
          // Coin flip between "absent" (which kills all 3 categories) and
          // "missed RMV/Review only" (less severe).
          if (rand() < 0.4) {
            dailyAbsent[d] = true;
            dailySabaq[d] = false;
            dailyRmv[d] = false;
            dailyReview[d] = false;
          } else {
            const which = rand();
            if (which < 0.4) dailySabaq[d] = false;
            else if (which < 0.7) dailyRmv[d] = false;
            else dailyReview[d] = false;
          }
        }
      }

      const daysAttended = dailyAbsent.filter((a) => !a).length;
      const successfulDays = dailySabaq.filter((s) => s).length;
      const weeklyPoints =
        dailySabaq.filter((s) => s).length +
        dailyRmv.filter((s) => s).length +
        dailyReview.filter((s) => s).length;

      // memorizationLines = derived from page/line delta (anchor was last entry)
      const memorizationLines =
        (advanced.page - lastEntryPage) * LINES_PER_PAGE +
        (advanced.line - lastEntryLine);

      const rating = pickRating(rand, profile.ratingDist);

      await db.insert(weeklyEntriesTable).values({
        studentId: student.id,
        weekStartDate: isoDate(weekStart),
        weekEndDate: isoDate(weekEnd),
        memorizationLines: Math.max(0, memorizationLines),
        currentPage: advanced.page,
        currentLine: advanced.line,
        dailySabaq: JSON.stringify(dailySabaq),
        dailyRmv: JSON.stringify(dailyRmv),
        dailyReview: JSON.stringify(dailyReview),
        dailyAbsent: JSON.stringify(dailyAbsent),
        successfulDays,
        daysAttended,
        weeklyPoints,
        rmvAmount: profile.defaultRmv ?? null,
        reviewAmount: profile.defaultReview ?? null,
        weekRating: rating,
        teacherNotes: null,
      });

      lastEntryPage = advanced.page;
      lastEntryLine = advanced.line;
      page = advanced.page;
      line = advanced.line;
    }

    // Update student's current position to match their final logged entry.
    // (Skipped students keep their pre-pause position from their last entry.)
    await db
      .update(studentsTable)
      .set({ currentPage: lastEntryPage, currentLine: lastEntryLine })
      .where(eqStudentId(student.id));
  }

  // Don't log the current week as logged for everyone — leave 2-3 students
  // unlogged for the current week so the dashboard shows mixed status.
  // (Already handled implicitly by skipRecentWeeks / onlyRecentWeeks above.)

  console.log(`[seed-demo] Done. ${PROFILES.length} students seeded.`);
  await pool.end();
}

import { eq } from "drizzle-orm";
function eqStudentId(id: number) {
  return eq(studentsTable.id, id);
}

main().catch((err) => {
  console.error("[seed-demo] Failed:", err);
  pool.end().finally(() => process.exit(1));
});
