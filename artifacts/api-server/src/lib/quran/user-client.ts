/**
 * Thin fetch wrapper for the Quran Foundation User APIs.
 *
 * Mirrors the shape of ./client.ts (Content API) but operates per-program:
 * the access token is resolved via user-auth.getUserAccessToken(programId)
 * and retried once on 401 with a forced refresh.
 *
 * Base URL: <apiBaseUrl>/auth/v1/...
 */

import { getUserAccessToken, getUserClientId, getUserEnvConfig, invalidateUserAccessToken } from "./user-auth";

export class QuranUserApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`QF User API ${status} ${url}: ${body.slice(0, 200)}`);
    this.name = "QuranUserApiError";
  }
  get isNotFound() { return this.status === 404; }
  get isRateLimited() { return this.status === 429; }
  get isServerError() { return this.status >= 500; }
}

export interface UserFetchOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function buildUrl(path: string, query?: UserFetchOptions["query"]): string {
  const { apiBaseUrl } = getUserEnvConfig();
  const base = `${apiBaseUrl}/auth/v1`;
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function doFetch(args: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  token: string;
  body?: unknown;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "x-auth-token": args.token,
    "x-client-id": getUserClientId(),
    Accept: "application/json",
  };
  let bodyInit: BodyInit | undefined;
  if (args.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(args.body);
  }
  return fetch(args.url, { method: args.method, headers, body: bodyInit });
}

async function request<T>(
  programId: number,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: UserFetchOptions = {},
): Promise<T> {
  const url = buildUrl(path, opts.query);
  let token = await getUserAccessToken(programId);
  let res = await doFetch({ method, url, token, body: opts.body });

  if (res.status === 401) {
    invalidateUserAccessToken(programId);
    token = await getUserAccessToken(programId);
    res = await doFetch({ method, url, token, body: opts.body });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new QuranUserApiError(res.status, url, text);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

export function userGet<T>(programId: number, path: string, opts: Omit<UserFetchOptions, "body"> = {}): Promise<T> {
  return request<T>(programId, "GET", path, opts);
}

export function userPost<T>(programId: number, path: string, body?: unknown, opts: Omit<UserFetchOptions, "body"> = {}): Promise<T> {
  return request<T>(programId, "POST", path, { ...opts, body });
}

export function userDelete<T>(programId: number, path: string, opts: Omit<UserFetchOptions, "body"> = {}): Promise<T> {
  return request<T>(programId, "DELETE", path, opts);
}
