/**
 * Quran Foundation User-API link routes.
 *
 *   GET    /api/qf-link/start    — kick off PKCE OAuth, redirect to QF login
 *   GET    /api/qf-link/callback — exchange code, persist encrypted refresh token
 *   GET    /api/qf-link/status   — { connected, displayName, connectedAt }
 *   GET    /api/qf-link/streak   — { connected, currentStreak, longestStreak }
 *   DELETE /api/qf-link          — disconnect the linked account
 *
 * All routes are session-gated except /callback, which the browser hits after
 * the QF hosted-login redirect — the session cookie is still present so we
 * gate that one the same way.
 */

import { Router, type IRouter } from "express";
import { db, qfAccountLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  generatePkcePair,
  getDefaultScopes,
  invalidateUserAccessToken,
} from "../lib/quran/user-auth";
import { encryptToken } from "../lib/quran/encryption";
import {
  QuranUserApiError,
} from "../lib/quran/user-client";
import {
  getProfileForProgram,
  getStreakForProgram,
} from "../lib/quran/user-actions";

const router: IRouter = Router();

/**
 * Resolve where to bounce the admin back to after the OAuth dance. Honor a
 * configured QF_USER_POST_LINK_REDIRECT for explicit deploys; otherwise fall
 * back to the Referer or "/".
 */
function postLinkRedirect(referer?: string): string {
  return process.env.QF_USER_POST_LINK_REDIRECT ?? referer ?? "/";
}

router.get("/qf-link/start", requireAuth, (req, res, next) => {
  try {
    const teacher = req.teacher!;
    const pkce = generatePkcePair();
    req.session.qfLinkPkce = {
      codeVerifier: pkce.codeVerifier,
      state: pkce.state,
      programId: teacher.programId,
    };
    const authUrl = buildAuthorizationUrl({
      codeChallenge: pkce.codeChallenge,
      state: pkce.state,
      scopes: getDefaultScopes(),
    });
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

router.get("/qf-link/callback", async (req, res, next) => {
  try {
    const pkce = req.session?.qfLinkPkce;
    if (!pkce) {
      res.status(400).send("Missing PKCE state. Start the link flow again.");
      return;
    }
    const { state, code, error, error_description } = req.query as Record<string, string | undefined>;
    if (error) {
      delete req.session.qfLinkPkce;
      res.status(400).send(`QF authorization denied: ${error}${error_description ? ` — ${error_description}` : ""}`);
      return;
    }
    if (!state || state !== pkce.state) {
      delete req.session.qfLinkPkce;
      res.status(400).send("OAuth state mismatch");
      return;
    }
    if (!code) {
      delete req.session.qfLinkPkce;
      res.status(400).send("Missing authorization code");
      return;
    }

    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: pkce.codeVerifier,
    });

    // Persist the encrypted refresh token first (so subsequent calls can
    // resolve the access token), THEN call /users/profile via the client.
    const encryptedRefreshToken = encryptToken(tokens.refreshToken);
    const placeholder = {
      programId: pkce.programId,
      qfUserId: "pending",
      displayName: null as string | null,
      encryptedRefreshToken,
      scopes: tokens.scopes,
    };
    await db
      .insert(qfAccountLinksTable)
      .values(placeholder)
      .onConflictDoUpdate({
        target: qfAccountLinksTable.programId,
        set: {
          encryptedRefreshToken,
          scopes: tokens.scopes,
          updatedAt: new Date(),
        },
      });

    // Now we can call /users/profile through user-client, which reads the
    // row we just wrote. If profile resolution fails, the link is still
    // valid — we just won't have a display name to show.
    invalidateUserAccessToken(pkce.programId);
    try {
      const profile = await getProfileForProgram(pkce.programId);
      await db
        .update(qfAccountLinksTable)
        .set({
          qfUserId: profile.qfUserId,
          displayName: profile.displayName,
          updatedAt: new Date(),
        })
        .where(eq(qfAccountLinksTable.programId, pkce.programId));
    } catch (err) {
      console.warn("[qf-link] profile fetch failed after link", err);
    }

    const redirectTo = postLinkRedirect(req.get("referer") ?? undefined);
    delete req.session.qfLinkPkce;
    res.redirect(redirectTo);
  } catch (err) {
    next(err);
  }
});

router.get("/qf-link/status", requireAuth, async (req, res, next) => {
  try {
    const teacher = req.teacher!;
    const [link] = await db
      .select()
      .from(qfAccountLinksTable)
      .where(eq(qfAccountLinksTable.programId, teacher.programId));
    if (!link) {
      res.json({ connected: false });
      return;
    }
    res.json({
      connected: true,
      displayName: link.displayName ?? null,
      connectedAt: link.connectedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/qf-link/streak", requireAuth, async (req, res, next) => {
  try {
    const teacher = req.teacher!;
    const [link] = await db
      .select()
      .from(qfAccountLinksTable)
      .where(eq(qfAccountLinksTable.programId, teacher.programId));
    if (!link) {
      res.json({ connected: false, currentStreak: 0, longestStreak: null });
      return;
    }
    try {
      const streak = await getStreakForProgram(teacher.programId);
      res.json({
        connected: true,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      });
    } catch (err) {
      if (err instanceof QuranUserApiError) {
        console.error(`[qf-link] streak fetch failed: ${err.message}`);
        res.status(502).json({ error: "Failed to fetch streak from Quran Foundation" });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.delete("/qf-link", requireAuth, async (req, res, next) => {
  try {
    const teacher = req.teacher!;
    await db
      .delete(qfAccountLinksTable)
      .where(eq(qfAccountLinksTable.programId, teacher.programId));
    invalidateUserAccessToken(teacher.programId);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

export default router;
