/**
 * Batched storefront analytics (CLAUDE.md §14.1).
 *
 * Events queue in memory and flush on idle or page hide via `sendBeacon`, so
 * tracking never sits on the critical path and never blocks unload.
 */

import { readContext } from "./context";

interface SearchEvent {
  type: "search";
  term: string;
  resultCount: number;
  kind?: "search" | "predictive";
  collectionHandle?: string | null;
  clickedProductId?: string | null;
  locale?: string | null;
}

interface FilterEvent {
  type: "filter";
  filterHandle: string;
  filterValue: string;
  resultCount: number;
  collectionHandle?: string | null;
}

type Event = SearchEvent | FilterEvent;

const MAX_BATCH = 50;
const FLUSH_DELAY = 2_000;

let queue: Event[] = [];
let timer: number | undefined;
let enabled = { searches: true, filters: true };
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;

  const key = "scfs_sid";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) {
      sessionId = existing;
      return existing;
    }
    // Opaque and per-tab; the server salts and hashes it before storage.
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2);
    window.sessionStorage.setItem(key, created);
    sessionId = created;
    return created;
  } catch {
    // Private mode or blocked storage — fall back to a per-page id.
    sessionId = String(Date.now());
    return sessionId;
  }
}

export function configureAnalytics(settings: {
  trackSearches: boolean;
  trackFilters: boolean;
}): void {
  enabled = {
    searches: settings.trackSearches,
    filters: settings.trackFilters,
  };
}

export function track(event: Event): void {
  if (event.type === "search" && !enabled.searches) return;
  if (event.type === "filter" && !enabled.filters) return;

  queue.push(event);
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }

  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(flush, FLUSH_DELAY);
}

export function flush(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  if (queue.length === 0) return;

  const payload = JSON.stringify({
    sessionId: getSessionId(),
    events: queue.slice(0, MAX_BATCH),
  });
  queue = [];

  const url = `${readContext().proxy}/events`;

  // `sendBeacon` survives navigation; fetch+keepalive is the fallback.
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }

  void fetch(url, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {
    /* analytics must never surface an error to the shopper */
  });
}

export function installAnalyticsFlush(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
