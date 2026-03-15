# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── hifdh-tracker/      # React + Vite frontend (iPad-optimized)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes:
  - `src/routes/index.ts` mounts all sub-routers
  - `src/routes/health.ts` — `GET /api/health`
  - `src/routes/auth.ts` — `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
  - `src/routes/students.ts` — CRUD for students
  - `src/routes/entries.ts` — Weekly entry CRUD (`/students/:id/entries/weekly`)
  - `src/routes/stats.ts` — `/api/dashboard`, `/api/students/:id/stats`, `/api/students/:id/calendar`, `/api/stats/class`, `/api/surahs`
  - `src/lib/quran-data.ts` — Quran surah data, ayah counting helpers (`calculateAyahsUpTo`, `calculateAyahsBetween`, `calculateJuzFromPosition`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- Auth: session-based with `requireAuth` middleware; password from `TEACHER_PASSWORD` env var (default: `hifdh2024`)

### `artifacts/hifdh-tracker` (`@workspace/hifdh-tracker`)

iPad-optimized React + Vite frontend for the Quran Hifdh Tracker.

Pages:
- `src/pages/login.tsx` — Password login page
- `src/pages/dashboard.tsx` — Weekly student overview with "Done/Pending" badges
- `src/pages/log-week.tsx` — Sequential weekly entry form (one student at a time)
- `src/pages/student-profile.tsx` — Student KPIs + monthly weekly calendar history
- `src/pages/manage-students.tsx` — Add/edit/deactivate students
- `src/pages/class-stats.tsx` — Class-wide statistics

Key components:
- `src/components/ui/surah-search-select.tsx` — Custom Surah dropdown with search
- `src/components/layout/app-layout.tsx` — Sidebar + mobile bottom nav layout with dark mode (persisted to localStorage)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/students.ts` — `students` table
- `src/schema/weekly-entries.ts` — `weekly_entries` table (replaces old `daily_entries`)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)

**Weekly Entries Schema** (`weekly_entries` table):
- `id`, `student_id`, `week_start_date` (Mon), `week_end_date` (Fri)
- `new_mem_from_surah`, `new_mem_from_ayah`, `new_mem_to_surah`, `new_mem_to_ayah`
- `ayahs_memorized` (computed), `successful_days`, `days_attended`
- `week_rating` (excellent/strong/steady/needs_improvement/difficult_week)
- `rmv_quality`, `review_quality` (excellent/good/fair/poor)
- `teacher_notes`

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by `api-server` for request/response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.
- `custom-fetch.ts` — always includes `credentials: "include"` for cookie-based auth.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
