/**
 * Thin fetch wrapper for the Quran Foundation Content API.
 *
 * Auto-attaches x-auth-token + x-client-id, retries once on 401 with a forced
 * token refresh, and throws typed errors so callers can distinguish 404 / 429 /
 * 5xx / network from each other.
 */

import { getAccessToken, getClientId, getEnvConfig, invalidateToken } from "./auth";

export class QuranApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`Quran API ${status} ${url}: ${body.slice(0, 200)}`);
    this.name = "QuranApiError";
  }
  get isNotFound() { return this.status === 404; }
  get isRateLimited() { return this.status === 429; }
  get isServerError() { return this.status >= 500; }
}

export interface QuranFetchOptions {
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: QuranFetchOptions["query"]): string {
  const { apiBaseUrl } = getEnvConfig();
  const base = `${apiBaseUrl}/content/api/v4`;
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function doFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "x-auth-token": token,
      "x-client-id": getClientId(),
      Accept: "application/json",
    },
  });
}

/**
 * GET a Content API endpoint, JSON-decoded. Retries once on 401.
 */
export async function quranGet<T>(path: string, opts: QuranFetchOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);

  let token = await getAccessToken();
  let res = await doFetch(url, token);

  if (res.status === 401) {
    invalidateToken();
    token = await getAccessToken();
    res = await doFetch(url, token);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new QuranApiError(res.status, url, body);
  }

  return (await res.json()) as T;
}
