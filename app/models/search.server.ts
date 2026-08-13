/**
 * Search configuration, synonyms and suggestions (CLAUDE.md §11).
 */

import type {
  SearchConfiguration,
  SearchSuggestion,
  SearchSynonym,
} from "@prisma/client";
import prisma from "../db.server";
import { parseJsonArray, stringifyJson } from "../lib/json";
import type { SearchConfigInput, SuggestionInput, SynonymInput } from "../lib/validation";

export async function getSearchConfig(
  shopId: string,
): Promise<SearchConfiguration> {
  return prisma.searchConfiguration.upsert({
    where: { shopId },
    update: {},
    create: { shopId },
  });
}

export async function updateSearchConfig(
  shopId: string,
  input: SearchConfigInput,
): Promise<SearchConfiguration> {
  return prisma.searchConfiguration.upsert({
    where: { shopId },
    update: input,
    create: { shopId, ...input },
  });
}

// ---------------------------------------------------------------------------
// Synonyms
// ---------------------------------------------------------------------------

export interface SynonymRecord {
  id: string;
  term: string;
  synonyms: string[];
  bidirectional: boolean;
  enabled: boolean;
}

function toSynonymRecord(row: SearchSynonym): SynonymRecord {
  return {
    id: row.id,
    term: row.term,
    synonyms: parseJsonArray<string>(row.synonyms),
    bidirectional: row.bidirectional,
    enabled: row.enabled,
  };
}

export async function listSynonyms(
  shopId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<SynonymRecord[]> {
  const rows = await prisma.searchSynonym.findMany({
    where: { shopId, ...(options.enabledOnly ? { enabled: true } : {}) },
    orderBy: { term: "asc" },
  });
  return rows.map(toSynonymRecord);
}

export async function upsertSynonym(
  shopId: string,
  input: SynonymInput,
): Promise<SynonymRecord> {
  const term = input.term.toLowerCase();
  const row = await prisma.searchSynonym.upsert({
    where: { shopId_term: { shopId, term } },
    update: {
      synonyms: stringifyJson(input.synonyms.map((s) => s.toLowerCase())),
      bidirectional: input.bidirectional,
      enabled: input.enabled,
    },
    create: {
      shopId,
      term,
      synonyms: stringifyJson(input.synonyms.map((s) => s.toLowerCase())),
      bidirectional: input.bidirectional,
      enabled: input.enabled,
    },
  });
  return toSynonymRecord(row);
}

export async function deleteSynonym(
  shopId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.searchSynonym.deleteMany({ where: { id, shopId } });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Suggestions & redirects
// ---------------------------------------------------------------------------

export async function listSuggestions(
  shopId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<SearchSuggestion[]> {
  return prisma.searchSuggestion.findMany({
    where: { shopId, ...(options.enabledOnly ? { enabled: true } : {}) },
    orderBy: [{ position: "asc" }, { term: "asc" }],
  });
}

export async function upsertSuggestion(
  shopId: string,
  input: SuggestionInput,
): Promise<SearchSuggestion> {
  const term = input.term.toLowerCase();
  const data = {
    targetUrl: input.targetUrl ?? null,
    position: input.position,
    enabled: input.enabled,
  };

  return prisma.searchSuggestion.upsert({
    where: { shopId_term_kind: { shopId, term, kind: input.kind } },
    update: data,
    create: { shopId, term, kind: input.kind, ...data },
  });
}

export async function deleteSuggestion(
  shopId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.searchSuggestion.deleteMany({
    where: { id, shopId },
  });
  return result.count > 0;
}
