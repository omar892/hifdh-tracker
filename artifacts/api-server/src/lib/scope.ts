import { db, studentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Resolve a studentId path param to a student owned by the given teacher.
 * Returns null if the student doesn't exist OR belongs to a different teacher
 * — route handlers should 404 in either case so the existence of another
 * teacher's student isn't leaked.
 *
 * This is the multi-teacher-safe pattern: never trust a path param alone,
 * always confirm ownership.
 */
export async function getStudentForTeacher(studentId: number, teacherId: number) {
  const [s] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.teacherId, teacherId)));
  return s ?? null;
}
