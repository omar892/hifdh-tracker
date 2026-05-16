/**
 * Quran Foundation OAuth2 client_credentials.
 *
 * Caches the access token in process memory and proactively refreshes 60s
 * before expiry. Single-flight: concurrent callers during a refresh share the
 * same in-flight promise rather than triggering N parallel token requests.
 */

const REFRESH_BUFFER_MS = 60_000;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

export interface QuranEnvConfig {
  authBaseUrl: string;
  apiBaseUrl: string;
}

export function getEnvConfig(): QuranEnvConfig {
  const env = (process.env.QURAN_ENV ?? "prelive").toLowerCase();
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

function getCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QURAN_CLIENT_ID;
  const clientSecret = process.env.QURAN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "QURAN_CLIENT_ID and QURAN_CLIENT_SECRET must be set to use the Quran Foundation API",
    );
  }
  return { clientId, clientSecret };
}

async function requestToken(): Promise<CachedToken> {
  const { clientId, clientSecret } = getCreds();
  const { authBaseUrl } = getEnvConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${authBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=content",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Quran Foundation token request failed: ${res.status} ${res.statusText} ${body}`,
    );
  }

  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || !json.expires_in) {
    throw new Error(
      `Quran Foundation token response malformed: ${JSON.stringify(json)}`,
    );
  }

  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

/**
 * Return a valid access token. Uses cache if not within REFRESH_BUFFER_MS of
 * expiry. Single-flight: concurrent callers during a refresh share one fetch.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - REFRESH_BUFFER_MS > now) {
    return cached.accessToken;
  }
  if (inflight) {
    const t = await inflight;
    return t.accessToken;
  }
  inflight = requestToken()
    .then((t) => {
      cached = t;
      return t;
    })
    .finally(() => {
      inflight = null;
    });
  const t = await inflight;
  return t.accessToken;
}

/**
 * Force a token refresh on the next call. Used by client.ts after a 401.
 */
export function invalidateToken(): void {
  cached = null;
}

export function getClientId(): string {
  return getCreds().clientId;
}
