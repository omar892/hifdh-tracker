/**
 * Program-scoped helpers that wrap the User-API endpoints we actually call:
 *   - markActivityDayForProgram: fires an Activity Day on the linked account
 *   - getStreakForProgram: reads the current streak
 *   - getProfileForProgram: reads display name during link setup
 *
 * markActivityDayForProgram is idempotent within a UTC day: we record
 * last_activity_date locally and skip QF if it already matches today, so
 * teachers saving multiple weekly entries in a day don't double-write.
 */

import { db, qfAccountLinksTable, type QfAccountLink } from "@workspace/db";
import { eq } from "drizzle-orm";
import { QuranUserApiError, userGet, userPost } from "./user-client";

interface ProfileResponse {
  id?: string | number;
  username?: string;
  displayName?: string;
  display_name?: string;
  name?: string;
  firstName?: string;
  first_name?: string;
}

/**
 * Shape of GET /auth/v1/streaks/current-streak-days?type=QURAN:
 *   { "success": true, "data": { "days": 29 } }
 */
interface CurrentStreakResponse {
  success?: boolean;
  data?: { days?: number };
}

export interface ProgramStreak {
  currentStreak: number;
  longestStreak: number | null;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickDisplayName(p: ProfileResponse): string | null {
  return (
    p.displayName ??
    p.display_name ??
    p.name ??
    p.firstName ??
    p.first_name ??
    (p.username ? `@${p.username}` : null)
  );
}

export async function getProfileForProgram(programId: number): Promise<{
  qfUserId: string;
  displayName: string | null;
}> {
  const profile = await userGet<ProfileResponse>(programId, "/users/profile");
  const qfUserId = profile.id != null ? String(profile.id) : profile.username ?? "unknown";
  return { qfUserId, displayName: pickDisplayName(profile) };
}

export async function getStreakForProgram(programId: number): Promise<ProgramStreak> {
  // QF streaks are typed; only QURAN is supported. The endpoint requires the
  // `type` query param and returns { success, data: { days } }.
  const res = await userGet<CurrentStreakResponse>(
    programId,
    "/streaks/current-streak-days",
    { query: { type: "QURAN" } },
  );
  return { currentStreak: res.data?.days ?? 0, longestStreak: null };
}

/**
 * Fire-and-forget mark of today's Activity Day. Safe to call multiple times
 * per day — the first call writes to QF and updates last_activity_date; the
 * rest short-circuit.
 *
 * Never throws to the caller. Logs failures so they're visible in Railway
 * logs without breaking the user's weekly-entry save.
 */
export async function markActivityDayForProgram(programId: number): Promise<void> {
  let link: QfAccountLink | undefined;
  try {
    [link] = await db
      .select()
      .from(qfAccountLinksTable)
      .where(eq(qfAccountLinksTable.programId, programId));
  } catch (err) {
    console.error("[qf-link] activity-day lookup failed", err);
    return;
  }

  if (!link) return; // program isn't linked — nothing to do

  const today = todayUtcDate();
  if (link.lastActivityDate === today) return;

  try {
    // QF streaks only count type=QURAN activity days, and that type requires
    // date + seconds + ranges + mushafId. A weekly-entry save means Quran
    // memorization activity happened in the program, so a QURAN day is the
    // honest signal; the fixed range/duration are nominal — the streak is
    // what matters, not precise verse tracking.
    await userPost(programId, "/activity-days", {
      type: "QURAN",
      date: today,
      seconds: 1800,
      ranges: ["1:1-1:7"],
      mushafId: 1,
    });
    await db
      .update(qfAccountLinksTable)
      .set({ lastActivityDate: today, updatedAt: new Date() })
      .where(eq(qfAccountLinksTable.id, link.id));
  } catch (err) {
    if (err instanceof QuranUserApiError) {
      console.error(`[qf-link] activity-day write failed: ${err.message}`);
    } else {
      console.error("[qf-link] activity-day write failed", err);
    }
    // Swallow — caller's request should still succeed.
  }
}
