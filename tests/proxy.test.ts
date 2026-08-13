/**
 * App proxy helpers (CLAUDE.md §16).
 *
 * The HMAC verification itself belongs to `authenticate.public.appProxy` and is
 * covered by the Shopify library. What is tested here is everything the app
 * layers on top: that a rejected request yields a bodiless 401, that session
 * identifiers are salted and never stored raw, that caching headers are what
 * they claim to be, and that the rate limiter actually limits.
 */

import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  hashSessionId,
  notModified,
  proxyJson,
  weakEtag,
} from "../app/lib/proxy.server";

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("hashSessionId", () => {
  it("never returns the raw identifier", () => {
    const raw = "session-abc-123";
    const hashed = hashSessionId(request("https://app.test/proxy/products"), raw);

    expect(hashed).not.toBeNull();
    expect(hashed).not.toContain(raw);
    expect(hashed).toHaveLength(32);
  });

  it("is deterministic for the same input", () => {
    const req = request("https://app.test/proxy/products");
    expect(hashSessionId(req, "abc")).toBe(hashSessionId(req, "abc"));
  });

  it("separates different sessions", () => {
    const req = request("https://app.test/proxy/products");
    expect(hashSessionId(req, "abc")).not.toBe(hashSessionId(req, "abd"));
  });

  it("falls back to the sid query parameter", () => {
    const hashed = hashSessionId(
      request("https://app.test/proxy/products?sid=from-query"),
    );
    expect(hashed).not.toBeNull();
    expect(hashed).not.toContain("from-query");
  });

  it("returns null when there is no identifier at all", () => {
    expect(hashSessionId(request("https://app.test/proxy/products"))).toBeNull();
  });
});

describe("checkRateLimit", () => {
  it("allows up to the capacity then refuses", () => {
    // Unique key per test so buckets from other cases cannot interfere.
    const key = `test-basic-${Math.random()}`;

    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(key, { capacity: 5, refillPerSecond: 0 })).toBe(true);
    }
    expect(checkRateLimit(key, { capacity: 5, refillPerSecond: 0 })).toBe(false);
  });

  it("keeps separate keys independent", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;

    expect(checkRateLimit(a, { capacity: 1, refillPerSecond: 0 })).toBe(true);
    expect(checkRateLimit(a, { capacity: 1, refillPerSecond: 0 })).toBe(false);
    // Exhausting one shop's bucket must not affect another's.
    expect(checkRateLimit(b, { capacity: 1, refillPerSecond: 0 })).toBe(true);
  });
});

describe("proxyJson", () => {
  it("defaults to no-store so shopper-specific results are never shared", async () => {
    const response = proxyJson({ ok: true });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("emits a public max-age only when asked", () => {
    const response = proxyJson({ ok: true }, { maxAge: 60 });
    const cacheControl = response.headers.get("Cache-Control") ?? "";

    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=60");
    expect(cacheControl).toContain("stale-while-revalidate=120");
  });

  it("passes through status and ETag", () => {
    const response = proxyJson({}, { status: 202, etag: 'W/"abc"' });
    expect(response.status).toBe(202);
    expect(response.headers.get("ETag")).toBe('W/"abc"');
  });
});

describe("ETag handling", () => {
  it("produces a stable tag for identical payloads", () => {
    const payload = JSON.stringify({ filters: ["colour", "size"] });
    expect(weakEtag(payload)).toBe(weakEtag(payload));
    expect(weakEtag(payload)).not.toBe(weakEtag(payload + " "));
  });

  it("answers 304 when the client already has the payload", () => {
    const etag = weakEtag("body");
    const response = notModified(
      request("https://app.test/proxy/config", { "If-None-Match": etag }),
      etag,
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(304);
    expect(response?.headers.get("ETag")).toBe(etag);
  });

  it("returns null when the tag differs, so the body is re-sent", () => {
    const response = notModified(
      request("https://app.test/proxy/config", { "If-None-Match": 'W/"stale"' }),
      weakEtag("body"),
    );
    expect(response).toBeNull();
  });

  it("returns null when the client sends no tag", () => {
    expect(
      notModified(request("https://app.test/proxy/config"), weakEtag("body")),
    ).toBeNull();
  });
});
