/**
 * Quran Foundation API proxy routes.
 * - Hides the client_secret + token from the browser.
 * - Caches aggressively since QF content is immutable.
 * - Resolves the mushaf slug → QF mushaf id from our `mushafs` table.
 */

import { Router, type IRouter } from "express";
import { db, mushafsTable, type Mushaf } from "@workspace/db";
import { eq } from "drizzle-orm";
import { quranGet, QuranApiError } from "../lib/quran/client";
import { syncAllMushafs, syncMushafPages } from "../lib/quran/sync";
import { requireAuth } from "../middlewares/auth";
import { pageToVerses } from "../lib/quran/lookup";

const router: IRouter = Router();

/** GET /api/mushafs — list supported mushaf layouts (open, no auth) */
router.get("/mushafs", async (_req, res, next) => {
  try {
    const rows = await db.select().from(mushafsTable);
    res.json(
      rows.map((m: Mushaf) => ({
        id: m.id,
        displayName: m.displayName,
        totalPages: m.totalPages,
        synced: m.lastSyncedAt !== null,
      })),
    );
  } catch (err) { next(err); }
});

/** GET /api/quran/mushafs/:id/pages/:n — cached page metadata (verse range) */
router.get("/quran/mushafs/:id/pages/:n", async (req, res, next) => {
  try {
    const mushafId = req.params.id;
    const n = Number(req.params.n);
    if (!Number.isFinite(n) || n < 1) {
      res.status(400).json({ error: "page must be a positive integer" });
      return;
    }
    const row = await pageToVerses(mushafId, n);
    if (!row) {
      res.status(404).json({ error: "page not found in cache; run quran:sync" });
      return;
    }
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.json(row);
  } catch (err) { next(err); }
});

/** GET /api/quran/mushafs/:id/pages/:n/verses — live fetch of verse+word data */
router.get("/quran/mushafs/:id/pages/:n/verses", async (req, res, next) => {
  try {
    const mushafId = req.params.id;
    const n = Number(req.params.n);
    if (!Number.isFinite(n) || n < 1) {
      res.status(400).json({ error: "page must be a positive integer" });
      return;
    }
    const [mushaf] = await db.select().from(mushafsTable).where(eq(mushafsTable.id, mushafId));
    if (!mushaf) {
      res.status(404).json({ error: `unknown mushaf id: ${mushafId}` });
      return;
    }

    const data = await quranGet(`/verses/by_page/${n}`, {
      query: {
        mushaf: mushaf.quranApiId,
        words: true,
        word_fields: "code_v2,line_number,page_number,position,char_type_name,text_uthmani,text_qpc_hafs",
        per_page: 50,
      },
    });
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.json(data);
  } catch (err) {
    if (err instanceof QuranApiError && err.isNotFound) {
      res.status(404).json({ error: "Quran Foundation returned 404", url: err.url });
      return;
    }
    next(err);
  }
});

/** POST /api/quran/sync — admin: re-hydrate the page cache (auth required) */
router.post("/quran/sync", requireAuth, async (req, res, next) => {
  try {
    const mushafId = typeof req.body?.mushafId === "string" ? req.body.mushafId : null;
    const counts = mushafId
      ? { [mushafId]: await syncMushafPages(mushafId) }
      : await syncAllMushafs();
    res.json({ ok: true, counts });
  } catch (err) { next(err); }
});

export default router;
