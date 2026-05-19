export * from "./generated/api";
// Re-export types, excluding GetStudentCalendarParams and ListWeeklyEntriesParams
// which conflict with Zod schema values of the same name in api.ts
export type {
  AuthResponse,
  CalendarWeek,
  ClassStats,
  CreateStudentRequest,
  DashboardStudent,
  ErrorResponse,
  HealthStatus,
  ListStudentsParams,
  LoginRequest,
  MessageResponse,
  Student,
  StudentCalendar,
  StudentStats,
  Surah,
  UpdateStudentRequest,
  UpsertWeeklyEntryRequest,
  WeeklyEntry,
  WeekRating,
} from "./generated/types";
