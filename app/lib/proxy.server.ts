/**
 * App proxy request handling (CLAUDE.md §6.3, §16).
 *
 * `authenticate.public.appProxy` verifies Shopify's HMAC signature. The shop
 * identity in the returned session is therefore trustworthy — it is the ONLY
 * accepted source. Nothing here ever reads a shop from the query string or body.
 */

import { createHash } from "crypto";
import type { Session } from "@shopify/shopify-api";
import type {
  AdminApiContext,
  StorefrontApiContext,
} from "@shopify/shopify-app-react-router/server";
import type { Shop } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../models/shop.server";
import { logger } from "./logger.server";

export interface ProxyContext {
  shop: Shop;
  session: Session;
  admin: AdminApiContext;
  storefront: StorefrontApiContext;
  /** Storefront session identifier, already salted and hashed. Never raw. */
  sessionHash: string | null;
  url: URL;
}

export class ProxyAuthError extends Error {
  constructor(readonly status: number) {
    super(`Proxy request rejected with ${status}`);
    this.name = "ProxyAuthError";
  }
}

/**
 * Resolves a verified proxy context. Throws a bare Response on failure so route
 * handlers can simply `await requireProxyContext(request)`.
 *
 * Failure bodies are intentionally empty — a probing client learns nothing about
 * whether the signature, the shop, or the installation was the problem.
 */
export async function requireProxyContext(
  request: Request,
): Promise<ProxyContext> {
  let context: Awaited<ReturnType<typeof authenticate.public.appProxy>>;

  try {
    context = await authenticate.public.appProxy(request);
  } catch {
    throw new Response(null, { status: 401 });
  }

  const { session, admin, storefront } = context;

  // No session means the app is not installed on the shop that signed the
  // request; there is nothing legitimate to serve.
  if (!session || !admin || !storefront) {
    throw new Response(null, { status: 401 });
  }

  const shop = await ensureShop(session.shop);
  if (shop.uninstalledAt) throw new Response(null, { status: 401 });

  return {
    shop,
    session,
    admin,
    storefront,
    sessionHash: hashSessionId(request),
    url: new URL(request.url),
  };
}

/**
 * Hashes a client-supplied session id with a server salt so analytics can count
 * unique sessions without storing anything that identifies a visitor.
 */
export function hashSessionId(
  request: Request,
  explicitId?: string | null,
): string | null {
  const url = new URL(request.url);
  const raw = explicitId ?? url.searchParams.get("sid");
  if (!raw) return null;

  const salt = process.env.ANALYTICS_SESSION_SALT ?? "";
  return createHash("sha256")
    .update(`${salt}:${raw}`)
    .digest("hex")
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface JsonResponseOptions {
  status?: number;
  /** Seconds of shared-cache lifetime. Omit for no caching. */
  maxAge?: number;
  etag?: string;
}

export function proxyJson(
  data: unknown,
  { status = 200, maxAge, etag }: JsonResponseOptions = {},
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    // Storefront responses vary per shop; never let a shared cache mix them up.
    Vary: "Accept-Encoding",
  });

  if (maxAge && maxAge > 0) {
    headers.set(
      "Cache-Control",
      `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    );
  } else {
    headers.set("Cache-Control", "no-store");
  }

  if (etag) headers.set("ETag", etag);

  return new Response(JSON.stringify(data), { status, headers });
}

/** Returns a 304 when the client's `If-None-Match` matches. */
export function notModified(request: Request, etag: string): Response | null {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  return null;
}

export function weakEtag(payload: string): string {
  return `W/"${createHash("sha1").update(payload).digest("base64url").slice(0, 27)}"`;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const BUCKET_LIMIT = 2_000;

/**
 * Token-bucket limiter, per shop and per session. In-process only: it caps a
 * single instance's exposure to an abusive client. It is a safety valve, not a
 * security boundary — the HMAC signature is the boundary.
 */
export function checkRateLimit(
  key: string,
  { capacity = 60, refillPerSecond = 1 }: { capacity?: number; refillPerSecond?: number } = {},
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    // Bound memory: drop the whole map rather than leak on unbounded keys.
    if (buckets.size >= BUCKET_LIMIT) buckets.clear();
    bucket = { tokens: capacity, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(
    capacity,
    bucket.tokens + elapsedSeconds * refillPerSecond,
  );
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    logger.warn("proxy.rate_limited", { key: key.split(":")[0] });
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

export function rateLimitKey(context: ProxyContext, scope: string): string {
  return `${context.shop.domain}:${scope}:${context.sessionHash ?? "anon"}`;
}

export function tooManyRequests(): Response {
  return new Response(null, {
    status: 429,
    headers: { "Retry-After": "5", "Cache-Control": "no-store" },
  });
}
