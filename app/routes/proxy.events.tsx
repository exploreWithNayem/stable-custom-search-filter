/**
 * POST /apps/scfs/events
 *
 * Batched storefront analytics (CLAUDE.md §14.1). The shop comes from the
 * verified proxy signature; the body is never trusted for identity.
 *
 * Always answers 202, even when nothing is recorded (tracking disabled, over
 * quota, malformed events). A shopper's browsing must never fail because the
 * analytics pipeline declined the write — that is the §15 degradation rule.
 */

import type { ActionFunctionArgs } from "react-router";
import {
  checkRateLimit,
  hashSessionId,
  rateLimitKey,
  requireProxyContext,
  tooManyRequests,
} from "../lib/proxy.server";
import { analyticsBatchSchema } from "../lib/validation";
import {
  recordFilterEvent,
  recordSearchEvent,
} from "../models/analytics.server";
import { getSettings } from "../models/settings.server";
import { consumeUsage } from "../models/usage.server";
import { logger } from "../lib/logger.server";

const ACCEPTED = new Response(null, {
  status: 202,
  headers: { "Cache-Control": "no-store" },
});

function accepted(): Response {
  return ACCEPTED.clone();
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const context = await requireProxyContext(request);

  if (!checkRateLimit(rateLimitKey(context, "events"), { capacity: 30 })) {
    return tooManyRequests();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return accepted();
  }

  const parsed = analyticsBatchSchema.safeParse(body);
  if (!parsed.success) return accepted();

  const settings = await getSettings(context.shop.id);
  const sessionHash =
    hashSessionId(request, parsed.data.sessionId) ?? context.sessionHash;

  for (const event of parsed.data.events) {
    try {
      if (event.type === "search") {
        if (!settings.analytics.trackSearches) continue;
        // Over quota: stop recording, keep serving. Never block the storefront.
        if (!(await consumeUsage(context.shop.id, "searches"))) continue;

        await recordSearchEvent({
          shopId: context.shop.id,
          term: event.term,
          resultCount: event.resultCount,
          kind: event.kind,
          collectionHandle: event.collectionHandle ?? null,
          clickedProductId: event.clickedProductId ?? null,
          locale: event.locale ?? null,
          sessionHash,
        });
      } else {
        if (!settings.analytics.trackFilters) continue;
        if (!(await consumeUsage(context.shop.id, "filterInteractions"))) continue;

        await recordFilterEvent({
          shopId: context.shop.id,
          filterHandle: event.filterHandle,
          filterValue: event.filterValue,
          resultCount: event.resultCount,
          collectionHandle: event.collectionHandle ?? null,
          sessionHash,
        });
      }
    } catch (error) {
      // One bad event must not discard the rest of the batch.
      logger.error("analytics.event_failed", {
        shop: context.shop.domain,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return accepted();
};

/** A GET here is almost always a misconfigured proxy path; say so quietly. */
export const loader = () => new Response(null, { status: 405 });
