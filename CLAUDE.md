# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **Hifdh Tracker** — an iPad-optimized web app for a teacher running a Quran memorization (hifdh) program to log each student's weekly progress, view metrics, and reference the Mushaf visually while logging. Single-tenant; session-based teacher login.

`replit.md` is the long-form architectural reference for new contributors and is largely accurate — read it for package-by-package layout, route listings, and schema notes. CLAUDE.md is the short list of footguns and conventions that aren't obvious from the code.

## Commands

```bash
pnpm install                                              # install (pnpm only; npm/yarn blocked by preinstall)
pnpm run typecheck                                        # MUST run from root — composite project graph
pnpm run build                                            # typecheck + recursive build

# API server
pnpm --filter @workspace/api-server run dev               # tsx watch, reads PORT (default 3000)
pnpm --filter @workspace/api-server run quran:sync        # hydrate mushaf_pages cache from QF API (idempotent)

# Frontend
pnpm --filter @workspace/hifdh-tracker run dev            # vite, reads VITE_PORT (default 5173)

# DB (Drizzle, no migration files — `push` mode against DATABASE_URL)
pnpm --filter @workspace/db run push                      # interactive — prompts on rename/destructive ops
pnpm --filter @workspace/db run push-force                # skip prompts; only when you're sure

# API codegen — run after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen             # regenerates api-zod + api-client-react
```

There is no test runner wired up; "tests" means typecheck + manual UAT via the dev server.

## Architecture notes that bite

### TypeScript composite projects

Every package has `composite: true` and the root `tsconfig.json` lists project references. **Never run `tsc` inside a single package** — it will fail with stale-deps errors. Always typecheck from the repo root via `pnpm run typecheck`, which runs `tsc --build` over the reference graph.

### Codegen is one-way

`lib/api-spec/openapi.yaml` is the source of truth for both `lib/api-zod` (server-side validation) and `lib/api-client-react` (TanStack Query hooks). After any spec edit, run `pnpm --filter @workspace/api-spec run codegen` before typechecking. The generated `src/generated/` directories are committed.

### Drizzle push, not migrations

The DB uses `drizzle-kit push` (schema sync), not generated migration files. When type-changing a column with data (e.g., text → integer), push will refuse the cast — drop the column manually via `psql` first, then re-push to recreate. When push gets stuck in an interactive rename prompt, fall back to applying the `ALTER TABLE` by hand and re-running push to confirm sync.

### Quran Foundation API integration

- All QF calls are **server-side only**. Credentials (`QURAN_CLIENT_ID`, `QURAN_CLIENT_SECRET`, `QURAN_ENV`) live in env and must never reach the browser bundle.
- OAuth2 client_credentials flow with token caching in `artifacts/api-server/src/lib/quran/auth.ts` — single-flight, 60s refresh buffer.
- `verse_mapping` from QF's page endpoint has the shape `{"<surahNum>": "<firstAyah>-<lastAyah>"}` (e.g., `{"4": "148-154"}`), **not** the `{"surah:ayah": "surah:ayah"}` format the public docs imply. The parser in `sync.ts` is built for the real shape — don't "fix" it back to the docs.
- Browser fetches pages via our own proxy (`/api/quran/mushafs/:id/pages/:n/verses`), which caches and adds the session cookie.

### Mushaf line indexing (don't confuse the two)

QF's API returns a physical `line_number` per word that **includes decorative/header lines** (surah header, basmala ornamentation). On page 1 of the Madani mushaf, the first actual word has `line_number: 9`. The teacher always calls the first visible reading line "line 1".

`artifacts/hifdh-tracker/src/components/quran/mushaf-page.tsx` is the single place that translates: it groups by `line_number`, sorts the groups, then emits `teacherIdx = idx + 1` for callbacks and highlight props. Anything outside that component speaks teacher-facing 1..N. Don't pass QF `line_number` to `highlightLine`/`anchorLine`/`onSelectLine`.

### Madani vs Indo-Pak mushaf rendering

- **Madani 15-Line** (`madani_15`, 604 pages): per-page QCF v2 WOFF2 font loaded via FontFace API, glyphs rendered from `word.code_v2`.
- **Indo-Pak 15-Line** (`indopak_15`, 610 pages): different architecture — single global Nastaleeq font + `word.text_indopak`, not per-page glyphs. **Not implemented.** `MushafPage` shows an explicit "coming soon" notice for `indopak_15` instead of rendering a stuck skeleton. Position tracking still works for Indo-Pak students; just the visual preview is deferred.

### Weekly entry position model

Lines are not stored directly — they're derived. The log-entry UI holds an anchor (last week's endpoint, page+line) and a current endpoint (page+line). On save, `memorizationLines = max(0, (currentPage - anchorPage) * 15 + (currentLine - anchorLine))`. When editing an existing entry, the anchor must come from the previous *distinct* entry — fetch with `limit: 2` and filter out the entry being edited, or you'll anchor against the entry itself.

### Auth

Session cookies via `express-session` + `connect-pg-simple`. `requireAuth` middleware guards every non-auth route. Default teacher password is `hifdh2024` unless `TEACHER_PASSWORD` is set. The generated React client's `custom-fetch.ts` always sends `credentials: "include"`.

### React Query gotcha

Use `isPending` (initial load) vs `isLoading` (any fetch) deliberately — they differ in TanStack v5. Quran content queries set `networkMode: "always"` because the default `online` mode can pause queries during SSE-heavy pages and produce stuck skeletons.

## Environment variables

See `.env.example`. Required: `DATABASE_URL`, `PORT`, `VITE_PORT`, `BASE_PATH`. Required for Quran preview: `QURAN_CLIENT_ID`, `QURAN_CLIENT_SECRET`, `QURAN_ENV`. Required for AI Entry mode: `ANTHROPIC_API_KEY`. Optional: `TEACHER_PASSWORD`.

## Deployment

**Host: Railway** (https://hifdh-tracker-production.up.railway.app). Auto-deploys from GitHub `main` push.

- `railway.json` — build + start commands + `/api/health` healthcheck
- `.nvmrc` + `packageManager` field — pin Node 24 + pnpm 10 (Nixpacks needs both signals)
- Production = single process: `node artifacts/api-server/dist/index.cjs`. The api-server bundle serves both `/api/*` and the built frontend (`artifacts/hifdh-tracker/dist/public`) with an SPA fallback. See `app.ts`.
- Postgres is a separate Railway service. App connects via `DATABASE_URL` (internal `postgres.railway.internal:5432`). For schema pushes from your laptop, use `DATABASE_PUBLIC_URL` (the external proxy at `crossover.proxy.rlwy.net:NNNNN`) — internal hostname isn't resolvable outside Railway's network.
- `.replit` + `.replitignore` files remain in the repo but have no effect — leftover from the Replit host we migrated off. Safe to delete.

### Common Railway ops

```bash
railway logs --deployment              # app stdout/stderr
railway logs --build                   # latest build log
railway redeploy --yes                 # force redeploy without code change
railway variables                       # print env vars for the linked service
railway service hifdh-tracker          # switch CLI to the app service
railway service Postgres               # switch CLI to the DB service
railway run -- pnpm ...                # run a local command with Railway env vars

# Schema push from laptop (needs the public proxy URL):
DATABASE_URL="$(railway service Postgres > /dev/null && railway variables --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  pnpm --filter @workspace/db run push-force

# Re-seed demo data:
DATABASE_URL="<public URL>" SEED_CONFIRM=yes \
  pnpm --filter @workspace/scripts run seed-demo
```

### Connect-pg-simple is intentionally EXTERNAL in the api-server bundle

It ships a `table.sql` loaded at runtime via `fs.readFile` (for `createTableIfMissing` in the session store). Bundling it into `dist/index.cjs` breaks that lookup — first session write fails with ENOENT and no authenticated request works. Keep it out of the `allowlist` in `artifacts/api-server/build.ts`.
