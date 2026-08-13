import prisma from "../db.server";
import { stringifyJson } from "../lib/json";

export type ActivityActor = "merchant" | "system" | "webhook";

export interface RecordActivityInput {
  shopId: string;
  action: string;
  summary: string;
  actor?: ActivityActor;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Audit trail for Dashboard → Recent Activity (CLAUDE.md §33).
 * Never throws: an audit write must not fail a merchant's save.
 */
export async function recordActivity({
  shopId,
  action,
  summary,
  actor = "merchant",
  entityType = null,
  entityId = null,
  metadata = {},
}: RecordActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        shopId,
        action,
        summary,
        actor,
        entityType,
        entityId,
        metadata: stringifyJson(metadata),
      },
    });
  } catch {
    // Intentionally swallowed — see doc comment.
  }
}

export async function listActivity(shopId: string, limit = 10) {
  return prisma.activityLog.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}
