/**
 * Synonym expansion and search-term shaping (CLAUDE.md §11.4).
 *
 * The current strategy is a normalised-term map, which is intentionally simple.
 * Everything else calls `expandSearchTerm` and never touches the synonym table,
 * so a smarter strategy (stemming, weighted expansion, an external index) can
 * replace the internals without touching callers.
 */

import { listSynonyms, listSuggestions } from "../../models/search.server";
import { normalizeTerm } from "../../models/analytics.server";
import { planAllows } from "../../config/plans";

/** Escapes characters that would otherwise be Storefront search operators. */
function escapeTerm(term: string): string {
  return term.replace(/["\\()]/g, " ").trim();
}

export interface ExpandedSearch {
  /** The query string handed to the Storefront API. */
  query: string;
  /** The term as the shopper typed it — used for analytics and display. */
  originalTerm: string;
  appliedSynonyms: string[];
}

export async function expandSearchTerm(
  shopId: string,
  term: string,
  planKey: string,
): Promise<ExpandedSearch> {
  const originalTerm = term.trim();
  const escaped = escapeTerm(originalTerm);

  if (!escaped) {
    return { query: "*", originalTerm, appliedSynonyms: [] };
  }

  if (!planAllows(planKey, "synonyms")) {
    return { query: escaped, originalTerm, appliedSynonyms: [] };
  }

  const normalized = normalizeTerm(originalTerm);
  const synonyms = await listSynonyms(shopId, { enabledOnly: true });

  const matches = new Set<string>();
  for (const entry of synonyms) {
    if (entry.term === normalized) {
      for (const synonym of entry.synonyms) matches.add(synonym);
    } else if (entry.bidirectional && entry.synonyms.includes(normalized)) {
      matches.add(entry.term);
      for (const synonym of entry.synonyms) {
        if (synonym !== normalized) matches.add(synonym);
      }
    }
  }

  const appliedSynonyms = [...matches]
    .map(escapeTerm)
    .filter((value) => value.length > 0);

  if (appliedSynonyms.length === 0) {
    return { query: escaped, originalTerm, appliedSynonyms: [] };
  }

  const query = [escaped, ...appliedSynonyms]
    .map((value) => `(${value})`)
    .join(" OR ");

  return { query, originalTerm, appliedSynonyms };
}

// ---------------------------------------------------------------------------
// Redirects and custom suggestions
// ---------------------------------------------------------------------------

export interface SearchRedirect {
  targetUrl: string;
}

/**
 * Exact-match redirect for a search term. Only same-origin paths are stored
 * (enforced by `suggestionInputSchema`), so this can never send a shopper
 * off-site.
 */
export async function findRedirect(
  shopId: string,
  term: string,
  planKey: string,
): Promise<SearchRedirect | null> {
  if (!planAllows(planKey, "suggestions")) return null;

  const normalized = normalizeTerm(term);
  const suggestions = await listSuggestions(shopId, { enabledOnly: true });

  const match = suggestions.find(
    (suggestion) =>
      suggestion.kind === "redirect" &&
      suggestion.term === normalized &&
      suggestion.targetUrl,
  );

  return match?.targetUrl ? { targetUrl: match.targetUrl } : null;
}

export interface CustomSuggestion {
  term: string;
  featured: boolean;
}

/** Merchant-authored suggestions that prefix the predictive results. */
export async function findCustomSuggestions(
  shopId: string,
  term: string,
  planKey: string,
  limit: number,
): Promise<CustomSuggestion[]> {
  if (!planAllows(planKey, "suggestions")) return [];

  const normalized = normalizeTerm(term);
  const suggestions = await listSuggestions(shopId, { enabledOnly: true });

  return suggestions
    .filter(
      (suggestion) =>
        suggestion.kind !== "redirect" &&
        (suggestion.kind === "featured" || suggestion.term.startsWith(normalized)),
    )
    .slice(0, limit)
    .map((suggestion) => ({
      term: suggestion.term,
      featured: suggestion.kind === "featured",
    }));
}
