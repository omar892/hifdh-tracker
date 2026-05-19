/**
 * Roster endpoint — purpose-built for the "manage my program" screen.
 *
 * Returns every student belonging to the current teacher with the few
 * computed metrics the roster table needs in one shot: status, current
 * position, last-entry date / weeks since, pace (lines/wk over last 4),
 * attendance % over the same window, juz count.
 *
 * Why not extend /api/students: that endpoint is consumed all over the app
 * for the simple "list of students" use case (log-week navigation, etc.)
 * and we don't want to drag computed metrics through every consumer just
 * because the roster needs them.
 */

import { Router, type IRouter } from "express";
import { db, studentsTable, weeklyEntriesTable, studentCompletedJuzTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function isoMonday(d: Date): string {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out.toISOString().slice(0, 10);
}

function addWeeksISO(mondayStr: string, weeks: number): string {
  const d = new Date(mondayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weeksDiff(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + "T00:00:00Z").getTime() - new Date(fromIso + "T00:00:00Z").getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

router.get("/roster", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.teacherId, teacher.id))
    .orderBy(studentsTable.name);

  const thisWeekMonday = isoMonday(new Date());
  const fourWeeksAgo = addWeeksISO(thisWeekMonday, -4);

  const rows = await Promise.all(
    students.map(async (student) => {
      // Latest entry for last-logged + position trust.
      const [latest] = await db
        .select()
        .from(weeklyEntriesTable)
        .where(eq(weeklyEntriesTable.studentId, student.id))
        .orderBy(desc(weeklyEntriesTable.weekStartDate))
        .limit(1);

      // Last 4 weeks for pace + attendance.
      const recent = await db
        .select()
        .from(weeklyEntriesTable)
        .where(
          and(
            eq(weeklyEntriesTable.studentId, student.id),
          ),
        )
        .orderBy(desc(weeklyEntriesTable.weekStartDate))
        .limit(8); // pull a few extra in case of gaps; we'll filter to last 4 mondays
      const last4 = recent.filter((e) => e.weekStartDate >= fourWeeksAgo);

      const totalLines4w = last4.reduce((s, e) => s + e.memorizationLines, 0);
      const weeksWithEntries = last4.length;
      // Pace = lines/wk over how many of the last 4 weeks the student logged.
      // Using weeksWithEntries (not 4) keeps the metric fair for students who
      // only have 2 entries in the window — it's "their pace when active."
      const paceLast4Weeks = weeksWithEntries > 0 ? Math.round(totalLines4w / weeksWithEntries) : 0;

      // Attendance % over last 4 weeks. Mirrors the stats route formula.
      let scheduled = 0;
      let present = 0;
      for (const e of last4) {
        if (!e.dailyAbsent) continue;
        try {
          const absent = JSON.parse(e.dailyAbsent) as boolean[];
          if (!Array.isArray(absent) || absent.length !== 5) continue;
          scheduled += 5;
          present += absent.filter((a) => !a).length;
        } catch {}
      }
      const attendancePercent = scheduled > 0 ? Math.round((present / scheduled) * 100) : null;

      // Juz count.
      const juzRows = await db
        .select({ j: studentCompletedJuzTable.juzNumber })
        .from(studentCompletedJuzTable)
        .where(eq(studentCompletedJuzTable.studentId, student.id));
      const juzCompleted = juzRows.length;

      return {
        id: student.id,
        name: student.name,
        gender: student.gender,
        currentPage: student.currentPage,
        currentLine: student.currentLine,
        status: student.status,
        statusChangedAt: student.statusChangedAt,
        archivedAt: student.archivedAt,
        active: student.active,
        mushafPreference: student.mushafPreference,
        juzCompleted,
        lastEntryDate: latest?.weekStartDate ?? null,
        weeksSinceLastEntry: latest ? weeksDiff(latest.weekStartDate, thisWeekMonday) : null,
        paceLast4Weeks,
        attendancePercent,
      };
    }),
  );

  res.json(rows);
});

export default router;
