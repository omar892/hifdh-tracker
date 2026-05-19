/**
 * Quran Foundation User-API OAuth2 (Authorization Code + PKCE).
 *
 * Unlike Content API auth (client_credentials, in ./auth.ts), the User APIs
 * require an end-user login. Flow:
 *   1. start: generate PKCE pair + state, redirect admin to QF hosted login
 *   2. callback: exchange code for tokens, persist encrypted refresh token
 *   3. ongoing: per-program access token cache + on-demand refresh
 *
 * Access tokens live in process memory keyed by programId; refresh tokens
 * are encrypted at rest in qf_account_links.
 */

import { createHash, randomBytes } from "node:crypto";
import { db, qfAccountLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./encryption";

const REFRESH_BUFFER_MS = 60_000;
const DEFAULT_SCOPES = "openid offline_access activity_day activity_day.create streak streak.read";

interface UserEnvConfig {
  authBaseUrl: string;
  apiBaseUrl: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

const accessCache = new Map<number, CachedAccessToken>();
const inflight = new Map<number, Promise<string>>();

export function getUserEnvConfig(): UserEnvConfig {
  // QF_USER_ENV overrides QURAN_ENV for the User API only, because the
  // Production QF client typically ships with "NO authentication/user
  // features by default" while the Pre-Production (Test) client has them
  // enabled. This lets the Content API stay in production while the User
  // API integration points at prelive, until production user features
  // are granted.
  const env = (
    process.env.QF_USER_ENV ??
    process.env.QURAN_ENV ??
    "prelive"
  ).toLowerCase();
  if (env === "production") {
    return {
      authBaseUrl: "https://oauth2.quran.foundation",
      apiBaseUrl: "https://apis.quran.foundation",
    };
  }
  return {
    authBaseUrl: "https://prelive-oauth2.quran.foundation",
    apiBaseUrl: "https://apis-prelive.quran.foundation",
  };
}

function getCreds(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.QF_USER_CLIENT_ID;
  const clientSecret = process.env.QF_USER_CLIENT_SECRET;
  const redirectUri = process.env.QF_USER_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "QF_USER_CLIENT_ID, QF_USER_CLIENT_SECRET, and QF_USER_REDIRECT_URI must be set to use the QF User API",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function getUserClientId(): string {
  return getCreds().clientId;
}

export function getDefaultScopes(): string {
  return DEFAULT_SCOPES;
}

// ---------------------------------------------------------------------------
// PKCE start
// ---------------------------------------------------------------------------

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  const state = base64UrlEncode(randomBytes(16));
  return { codeVerifier, codeChallenge, state };
}

export function buildAuthorizationUrl(args: { codeChallenge: string; state: string; scopes?: string }): string {
  const { authBaseUrl } = getUserEnvConfig();
  const { clientId, redirectUri } = getCreds();
  const url = new URL(`${authBaseUrl}/oauth2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", args.scopes ?? DEFAULT_SCOPES);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange + refresh
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const { authBaseUrl } = getUserEnvConfig();
  const { clientId, clientSecret } = getCreds();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QF user token request failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || !json.expires_in) {
    throw new Error(`QF user token response malformed: ${JSON.stringify(json)}`);
  }
  return json;
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string;
}

export async function exchangeCodeForTokens(args: {
  code: string;
  codeVerifier: string;
}): Promise<ExchangeResult> {
  const { redirectUri } = getCreds();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: redirectUri,
    code_verifier: args.codeVerifier,
  });
  const json = await postToken(body);
  if (!json.refresh_token) {
    throw new Error(
      "QF user token response missing refresh_token. Was offline_access scope requested?",
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scopes: json.scope ?? DEFAULT_SCOPES,
  };
}

async function refreshAccessToken(programId: number, refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const json = await postToken(body);
  const cached: CachedAccessToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  accessCache.set(programId, cached);
  // QF may rotate refresh tokens; if a new one came back, persist it.
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await db
      .update(qfAccountLinksTable)
      .set({
        encryptedRefreshToken: encryptToken(json.refresh_token),
        updatedAt: new Date(),
      })
      .where(eq(qfAccountLinksTable.programId, programId));
  }
  return cached.accessToken;
}

/**
 * Return a valid access token for the program's linked QF account.
 * Throws if the program is not linked.
 */
export async function getUserAccessToken(programId: number): Promise<string> {
  const now = Date.now();
  const cached = accessCache.get(programId);
  if (cached && cached.expiresAt - REFRESH_BUFFER_MS > now) {
    return cached.accessToken;
  }
  let pending = inflight.get(programId);
  if (pending) return pending;

  pending = (async () => {
    const [link] = await db
      .select()
      .from(qfAccountLinksTable)
      .where(eq(qfAccountLinksTable.programId, programId));
    if (!link) {
      throw new Error(`No QF account linked for program ${programId}`);
    }
    const refreshToken = decryptToken(link.encryptedRefreshToken);
    return refreshAccessToken(programId, refreshToken);
  })();

  inflight.set(programId, pending);
  try {
    return await pending;
  } finally {
    inflight.delete(programId);
  }
}

export function invalidateUserAccessToken(programId: number): void {
  accessCache.delete(programId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
