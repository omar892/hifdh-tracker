import "express-session";

declare module "express-session" {
  interface SessionData {
    /**
     * Legacy boolean kept during the transition to multi-user. Once everything
     * reads `userId`, this can be removed.
     */
    authenticated: boolean;
    /**
     * Foreign key to users.id — the currently logged-in user. In single-teacher
     * mode this is always the one teacher/admin user (id=1 from backfill).
     * Set by the login route, consumed by getCurrentTeacher().
     */
    userId: number;
  }
}
