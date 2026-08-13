/**
 * Shop settings blobs (CLAUDE.md §16 / §12.2).
 *
 * Stored as stringified JSON per D5. Reads always run the zod schema so a blob
 * written by an older version still produces a complete, valid object.
 */

import prisma from "../db.server";
import { parseJson, stringifyJson } from "../lib/json";
import {
  analyticsSettingsSchema,
  appearanceSettingsSchema,
  generalSettingsSchema,
} from "../lib/validation";
import type {
  AnalyticsSettings,
  AppearanceSettings,
  GeneralSettings,
} from "../lib/validation";

export interface ShopSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  analytics: AnalyticsSettings;
}

function coerce<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } },
  raw: string | null | undefined,
  fallbackSource: unknown = {},
): T {
  const parsed = parseJson<unknown>(raw, fallbackSource);
  const result = schema.safeParse(parsed);
  if (result.success && result.data !== undefined) return result.data;
  // A malformed blob falls back to schema defaults rather than breaking the page.
  return schema.safeParse({}).data as T;
}

export async function getSettings(shopId: string): Promise<ShopSettings> {
  const row = await prisma.appSettings.upsert({
    where: { shopId },
    update: {},
    create: { shopId },
  });

  return {
    general: coerce<GeneralSettings>(generalSettingsSchema, row.general),
    appearance: coerce<AppearanceSettings>(
      appearanceSettingsSchema,
      row.appearance,
    ),
    analytics: coerce<AnalyticsSettings>(analyticsSettingsSchema, row.analytics),
  };
}

export async function updateGeneralSettings(
  shopId: string,
  general: GeneralSettings,
): Promise<void> {
  await prisma.appSettings.upsert({
    where: { shopId },
    update: { general: stringifyJson(general) },
    create: { shopId, general: stringifyJson(general) },
  });
}

/**
 * Merges a subset of the general settings.
 *
 * The layout picker edits two fields out of a dozen; writing the whole blob
 * from that page would silently reset everything the merchant set elsewhere.
 */
export async function patchGeneralSettings(
  shopId: string,
  patch: Partial<GeneralSettings>,
): Promise<GeneralSettings> {
  const current = await getSettings(shopId);
  const next = generalSettingsSchema.parse({ ...current.general, ...patch });
  await updateGeneralSettings(shopId, next);
  return next;
}

export async function updateAppearanceSettings(
  shopId: string,
  appearance: AppearanceSettings,
): Promise<void> {
  await prisma.appSettings.upsert({
    where: { shopId },
    update: { appearance: stringifyJson(appearance) },
    create: { shopId, appearance: stringifyJson(appearance) },
  });
}

export async function updateAnalyticsSettings(
  shopId: string,
  analytics: AnalyticsSettings,
): Promise<void> {
  await prisma.appSettings.upsert({
    where: { shopId },
    update: { analytics: stringifyJson(analytics) },
    create: { shopId, analytics: stringifyJson(analytics) },
  });
}
