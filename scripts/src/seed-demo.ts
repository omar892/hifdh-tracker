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

import {
  db,
  pool,
  studentsTable,
  weeklyEntriesTable,
  mushafsTable,
  studentCompletedJuzTable,
  programsTable,
  usersTable,
  classesTable,
  guardiansTable,
  viewerAccessTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Madani 15-line page numbers where each juz starts. Mirrors
 * artifacts/api-server/src/lib/quran-data.ts:JUZ_START_PAGES — kept inline so
 * this script has no api-server dependency. Juz 30 ends at page 604.
 */
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

function juzForPage(page: number): number {
  for (let i = JUZ_START_PAGES.length - 1; i >= 0; i--) {
    if (page >= JUZ_START_PAGES[i]) return i + 1;
  }
  return 1;
}

/**
 * Realistic teacher notes to sprinkle on ~20% of entries. Tone matches a
 * teacher tracking 10 students closely — short, specific, sometimes about
 * absence, sometimes about technique.
 */
const TEACHER_NOTES = [
  "Strong tajweed throughout the week",
  "Need to revise Surah Al-Baqarah RMV",
  "Excellent retention on new material",
  "Struggling with new pages — recommended slower pace next week",
  "Completed surah mid-week, very motivated",
  "Doctor appointment Wed afternoon — reduced schedule",
  "Family event Thursday, came in tired Friday",
  "RMV scores improving — keep momentum",
  "Asked for extra review session next week",
  "Beautiful recitation in morning halaqa",
  "Needs daily 1:1 reinforcement on new juz",
  "Confident with last week's new material",
];

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

// Pace is in LINES/WEEK (Madani: 15 lines per page).
// Calibrated to realistic full-time hifz program cadence:
//   - 20+ juz students: 1-2 pages/day = 5-10 pages/wk = 75-150 lines/wk
//   - 5-20 juz students: 0.5-1 page/day = 38-75 lines/wk
//   - Struggling/new: less, with high variance
// Start pages chosen so 8 weeks of seeded weekly entries land each student
// near their target juz total. The 8-week window then ends up crossing
// real juz boundaries, which makes the recent-weeks data demo-worthy.
const PROFILES: Profile[] = [
  {
    name: "Omar Abdullah",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2023-08-15",
    // Target: ~20 juz done, currently in juz 21 (page 402-421). 8 weeks at
    // ~120 lines/wk = 64 pages, so startPage ~340 (juz 17) → ends ~juz 21.
    startPage: 341,
    startLine: 1,
    pace: [90, 120, 150], // ~1.5 pages/day — full-time hafidh pace
    exceptionRate: 0.05,
    ratingDist: [0.6, 0.3, 0.1, 0, 0],
    defaultRmv: "Last 1 Juz",
    defaultReview: "2 Juz",
    notes: "Class topper — pushing for full Quran by year end",
  },
  {
    name: "Zainab Ali",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-06-01",
    // Target: ~18 juz done (currently mid juz 19). ~100 lines/wk × 8 = ~53 pages.
    startPage: 312,
    startLine: 1,
    pace: [75, 100, 130],
    exceptionRate: 0.06,
    ratingDist: [0.5, 0.35, 0.15, 0, 0],
    defaultRmv: "Last 1 Juz",
    defaultReview: "2 Juz",
  },
  {
    name: "Fatima Hassan",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-09-01",
    // Target: ~16 juz done (juz 17 ~ page 322-341). ~80 lines/wk × 8 = ~43 pages.
    startPage: 282,
    startLine: 8,
    pace: [60, 80, 105],
    exceptionRate: 0.1,
    ratingDist: [0.3, 0.4, 0.25, 0.05, 0],
    defaultRmv: "Last 10 pages",
    defaultReview: "1 Juz",
  },
  {
    name: "Ahmed Al-Rashid",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-09-01",
    // Target: ~10 juz done (juz 11 ~ page 201). ~65 lines/wk × 8 = ~35 pages.
    startPage: 170,
    startLine: 1,
    pace: [50, 65, 85],
    exceptionRate: 0.08,
    ratingDist: [0.4, 0.35, 0.2, 0.05, 0],
    defaultRmv: "Last 10 pages",
    defaultReview: "1 Juz",
    notes: "Strong memorization, needs work on tajweed",
  },
  {
    name: "Aisha Rahman",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2023-11-01",
    // Target: ~8 juz done (juz 9 ~ page 162). ~55 lines/wk × 8 = ~29 pages.
    startPage: 141,
    startLine: 6,
    pace: [40, 55, 70],
    exceptionRate: 0.2,
    ratingDist: [0.15, 0.25, 0.3, 0.2, 0.1],
  },
  {
    name: "Yusuf Ibrahim",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-01-15",
    // Target: ~7 juz done (juz 8 ~ page 142). ~50 lines/wk × 8 = ~27 pages.
    startPage: 118,
    startLine: 5,
    pace: [38, 50, 65],
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
    // Target: ~6 juz done (juz 7 ~ page 121). Paused 5 weeks ago → only 3
    // weeks of entries at ~55 lines/wk = ~11 pages of advance.
    startPage: 110,
    startLine: 3,
    pace: [40, 55, 70],
    exceptionRate: 0.1,
    ratingDist: [0.25, 0.4, 0.25, 0.1, 0],
    skipRecentWeeks: 5,
    notes: "Travel — out of state for family event",
  },
  {
    name: "Khadija Iqbal",
    gender: "female",
    mushaf: "madani_15",
    startDate: "2024-04-15",
    // Target: ~4 juz done (juz 5 ~ page 82). ~45 lines/wk × 8 = ~24 pages.
    startPage: 56,
    startLine: 1,
    pace: [30, 45, 60],
    exceptionRate: 0.15,
    ratingDist: [0.15, 0.3, 0.3, 0.2, 0.05],
  },
  {
    name: "Bilal Mustafa",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2024-03-01",
    // Target: ~2 juz done (juz 3 starts page 42). Struggling — much slower
    // pace than peers, ~20 lines/wk × 8 = ~11 pages.
    startPage: 42,
    startLine: 1,
    pace: [12, 20, 32],
    exceptionRate: 0.25,
    ratingDist: [0.05, 0.15, 0.3, 0.35, 0.15],
    defaultRmv: "Last 3 pages",
    defaultReview: "Half Juz",
    notes: "Catching up after late start — daily 1:1 in afternoon",
  },
  {
    name: "Hassan Siddiqui",
    gender: "male",
    mushaf: "madani_15",
    startDate: "2026-05-01",
    // Brand new, only 2 weeks logged. Just starting on Surah Al-Fatihah.
    startPage: 1,
    startLine: 1,
    pace: [4, 8, 14],
    exceptionRate: 0.1,
    ratingDist: [0.1, 0.3, 0.5, 0.1, 0],
    onlyRecentWeeks: 2,
    notes: "New student — starting Surah Al-Fatihah this month",
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
  console.log(`[seed-demo] Wiping in FK order…`);
  // FK order: leaves first, then trunks.
  //   viewer_access, guardians, student_completed_juz, weekly_entries → students
  //   students → classes, users, programs
  //   classes → users, programs
  //   users → programs
  await db.delete(viewerAccessTable);
  await db.delete(guardiansTable);
  await db.delete(studentCompletedJuzTable);
  await db.delete(weeklyEntriesTable);
  await db.delete(studentsTable);
  await db.delete(classesTable);
  await db.delete(usersTable);
  await db.delete(programsTable);

  // Ensure the mushaf catalog rows exist before students reference them. The
  // quranApiId values match QF's mushaf IDs (1 = Hafs Uthmani v2 / Madani, 16
  // = Indo-Pak Nastaleeq). `quran:sync` will refresh these with authoritative
  // values + populate mushaf_pages. Idempotent via ON CONFLICT DO NOTHING.
  console.log(`[seed-demo] Ensuring mushafs catalog…`);
  await db
    .insert(mushafsTable)
    .values([
      { id: "madani_15", quranApiId: 1, displayName: "Madani 15-Line", totalPages: 604 },
      { id: "indopak_15", quranApiId: 16, displayName: "Indo-Pak 15-Line", totalPages: 610 },
    ])
    .onConflictDoNothing();

  // Bootstrap the multi-teacher skeleton: one program, one admin user, one
  // class. All seeded students get stamped with these IDs. The program
  // owner_id is wired after the user exists.
  console.log(`[seed-demo] Bootstrapping program + admin user + default class…`);
  const [program] = await db
    .insert(programsTable)
    .values({ name: "Hifdh Program" })
    .returning();
  const [user] = await db
    .insert(usersTable)
    .values({
      programId: program.id,
      email: "teacher@hifdh.local",
      name: "Teacher",
      role: "admin",
      // passwordHash empty in step 1 — login goes through TEACHER_PASSWORD env.
      // Real bcrypt hash lands in step 7 with the email+password UI.
      passwordHash: "",
    })
    .returning();
  await db
    .update(programsTable)
    .set({ ownerId: user.id })
    .where(eq(programsTable.id, program.id));
  const [klass] = await db
    .insert(classesTable)
    .values({ programId: program.id, teacherId: user.id, name: "Main Class" })
    .returning();
  console.log(`  + program=${program.id} user=${user.id} class=${klass.id}`);

  for (const profile of PROFILES) {
    const rand = seededRandom(profile.name);

    // Insert the student first; we'll update currentPage/Line at the end.
    // Stamp with the bootstrapped program/class/teacher so every query that
    // scopes by teacher_id finds these students. Profiles with skipRecentWeeks
    // are explicitly paused (matches their narrative — Maryam is traveling).
    const initialStatus = profile.skipRecentWeeks ? "paused" : "active";
    const [student] = await db
      .insert(studentsTable)
      .values({
        programId: program.id,
        classId: klass.id,
        teacherId: user.id,
        name: profile.name,
        gender: profile.gender,
        startDate: profile.startDate,
        notes: profile.notes ?? null,
        mushafPreference: profile.mushaf,
        defaultRmvAmount: profile.defaultRmv ?? null,
        defaultReviewAmount: profile.defaultReview ?? null,
        currentPage: profile.startPage,
        currentLine: profile.startLine,
        status: initialStatus,
        active: initialStatus === "active",
        statusChangedAt: initialStatus === "paused" ? new Date() : null,
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
      const dailyMemorization = [true, true, true, true, true];
      const dailyRmv = [true, true, true, true, true];
      const dailyReview = [true, true, true, true, true];
      const dailyAbsent = [false, false, false, false, false];
      for (let d = 0; d < 5; d++) {
        if (rand() < profile.exceptionRate) {
          // Coin flip between "absent" (which kills all 3 categories) and
          // "missed RMV/Review only" (less severe).
          if (rand() < 0.4) {
            dailyAbsent[d] = true;
            dailyMemorization[d] = false;
            dailyRmv[d] = false;
            dailyReview[d] = false;
          } else {
            const which = rand();
            if (which < 0.4) dailyMemorization[d] = false;
            else if (which < 0.7) dailyRmv[d] = false;
            else dailyReview[d] = false;
          }
        }
      }

      const daysAttended = dailyAbsent.filter((a) => !a).length;
      const successfulDays = dailyMemorization.filter((s) => s).length;
      const weeklyPoints =
        dailyMemorization.filter((s) => s).length +
        dailyRmv.filter((s) => s).length +
        dailyReview.filter((s) => s).length;

      // memorizationLines = derived from page/line delta (anchor was last entry)
      const memorizationLines =
        (advanced.page - lastEntryPage) * LINES_PER_PAGE +
        (advanced.line - lastEntryLine);

      const rating = pickRating(rand, profile.ratingDist);

      // ~20% of entries get a teacher note for richness on the profile view.
      const note = rand() < 0.2 ? TEACHER_NOTES[Math.floor(rand() * TEACHER_NOTES.length)] : null;
      // ~50% of entries get RMV + Review scores (1-3 scale matching the UI),
      // skewed toward 2-3 for strong profiles, 1-2 for struggling ones.
      const scoreBase = profile.ratingDist[0] + profile.ratingDist[1] > 0.5 ? 2 : 1;
      const rmvScore = rand() < 0.5 ? scoreBase + Math.floor(rand() * 2) : null;
      const reviewScore = rand() < 0.5 ? scoreBase + Math.floor(rand() * 2) : null;

      await db.insert(weeklyEntriesTable).values({
        studentId: student.id,
        teacherId: user.id,
        weekStartDate: isoDate(weekStart),
        weekEndDate: isoDate(weekEnd),
        memorizationLines: Math.max(0, memorizationLines),
        currentPage: advanced.page,
        currentLine: advanced.line,
        dailyMemorization: JSON.stringify(dailyMemorization),
        dailyRmv: JSON.stringify(dailyRmv),
        dailyReview: JSON.stringify(dailyReview),
        dailyAbsent: JSON.stringify(dailyAbsent),
        successfulDays,
        daysAttended,
        weeklyPoints,
        rmvAmount: profile.defaultRmv ?? null,
        reviewAmount: profile.defaultReview ?? null,
        rmvScore,
        reviewScore,
        weekRating: rating,
        teacherNotes: note,
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

    // Populate student_completed_juz with rows for every juz fully below
    // their final position. Dates are spread between the student's startDate
    // and ~3 weeks ago so timeline-aware views (recent completions, juz this
    // month) have something to show. Skipped/paused students get their last
    // completion before the pause point.
    const finalJuz = juzForPage(lastEntryPage); // juz they're CURRENTLY on
    const completedCount = finalJuz - 1; // juz fully behind them are "completed"
    if (completedCount > 0) {
      const startMs = new Date(profile.startDate + "T00:00:00Z").getTime();
      const pauseWeeks = profile.skipRecentWeeks ?? 0;
      const endRef = addDays(currentMonday, -7 * (pauseWeeks + 2)); // ~2 weeks before today/pause
      const endMs = endRef.getTime();
      const span = Math.max(endMs - startMs, 14 * 24 * 60 * 60 * 1000); // at least 2-week span
      const juzRows = [];
      for (let j = 1; j <= completedCount; j++) {
        // Even spacing with mild jitter so timestamps don't look mechanical.
        const fraction = (j - 0.5) / completedCount;
        const jitter = (rand() - 0.5) * (span / completedCount) * 0.4;
        const completedAt = new Date(startMs + fraction * span + jitter);
        juzRows.push({
          studentId: student.id,
          teacherId: user.id,
          juzNumber: j,
          autoCompleted: true,
          createdAt: completedAt,
        });
      }
      await db.insert(studentCompletedJuzTable).values(juzRows);
    }
  }

  // Don't log the current week as logged for everyone — leave 2-3 students
  // unlogged for the current week so the dashboard shows mixed status.
  // (Already handled implicitly by skipRecentWeeks / onlyRecentWeeks above.)

  console.log(`[seed-demo] Done. ${PROFILES.length} students seeded.`);
  await pool.end();
}

function eqStudentId(id: number) {
  return eq(studentsTable.id, id);
}

main().catch((err) => {
  console.error("[seed-demo] Failed:", err);
  pool.end().finally(() => process.exit(1));
});
