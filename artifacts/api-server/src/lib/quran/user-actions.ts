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

interface StreakResponse {
  currentStreak?: number;
  current_streak?: number;
  current_streak_days?: number;
  streak?: number;
  longest_streak?: number;
  longestStreak?: number;
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
  // QF exposes both /streaks (with longest) and /streaks/current-streak-days
  // (just the current count). We use /streaks and tolerate shape variations.
  const res = await userGet<StreakResponse>(programId, "/streaks");
  const currentStreak =
    res.currentStreak ?? res.current_streak ?? res.current_streak_days ?? res.streak ?? 0;
  const longestStreak = res.longestStreak ?? res.longest_streak ?? null;
  return { currentStreak, longestStreak };
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
    await userPost(programId, "/activity-days", {
      type: "LESSON",
      date: today,
      seconds: 0,
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
