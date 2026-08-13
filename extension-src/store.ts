/**
 * Filter state, URL synchronisation and result fetching (CLAUDE.md §4.3, §9).
 *
 * The URL codec is imported from the app source, so the storefront and the
 * server can never disagree about what a query string means.
 */

import {
  clearAllFilters,
  filterStateToSearch,
  parseFilterState,
  removeSelection,
  setPage,
  setPerPage,
  setRange,
  setSort,
  setTerm,
  toggleValue,
  activeFilterCount,
  type FilterState,
} from "../app/lib/filter-url";
import { readContext } from "./context";
import type { ConfigResponse, ProductsResponse } from "./types";

export type Status = "idle" | "loading" | "error";

export interface StoreSnapshot {
  state: FilterState;
  config: ConfigResponse | null;
  result: ProductsResponse | null;
  status: Status;
  activeCount: number;
}

type Listener = (snapshot: StoreSnapshot) => void;

/**
 * Monotonic request id. Every response checks it before applying, so a slow
 * earlier request can never overwrite a newer result (CLAUDE.md §4.3).
 */
let sequence = 0;
let inFlight: AbortController | null = null;

let state: FilterState = parseFilterState(window.location.search);
let config: ConfigResponse | null = null;
let result: ProductsResponse | null = null;
let status: Status = "idle";

const listeners = new Set<Listener>();

function snapshot(): StoreSnapshot {
  return {
    state,
    config,
    result,
    status,
    activeCount: activeFilterCount(state),
  };
}

function emit(): void {
  const current = snapshot();
  for (const listener of listeners) listener(current);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getState(): FilterState {
  return state;
}

export function getConfig(): ConfigResponse | null {
  return config;
}

export function getResult(): ProductsResponse | null {
  return result;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function collectionHandle(): string | null {
  return readContext().context.collection || null;
}

export async function loadConfig(): Promise<ConfigResponse | null> {
  const { proxy } = readContext();
  const params = new URLSearchParams();
  const handle = collectionHandle();
  if (handle) params.set("collection", handle);

  try {
    const response = await fetch(`${proxy}/config?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    config = (await response.json()) as ConfigResponse;

    // Seed per-page from the merchant default when the URL does not say.
    if (state.perPage === null && config.toolbar.defaultPerPage) {
      state = { ...state, perPage: config.toolbar.defaultPerPage };
    }

    emit();
    return config;
  } catch {
    return null;
  }
}

export async function loadResults(): Promise<void> {
  const { proxy } = readContext();
  const requestId = ++sequence;

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  status = "loading";
  emit();

  const params = new URLSearchParams(filterStateToSearch(state).replace(/^\?/, ""));
  const handle = collectionHandle();
  if (handle) params.set("collection", handle);

  try {
    const response = await fetch(`${proxy}/products?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    // A newer request started while this one was in flight — discard.
    if (requestId !== sequence) return;

    if (!response.ok) {
      status = "error";
      emit();
      return;
    }

    result = (await response.json()) as ProductsResponse;
    status = "idle";
    emit();
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return;
    if (requestId !== sequence) return;
    status = "error";
    emit();
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

// ---------------------------------------------------------------------------
// URL synchronisation
// ---------------------------------------------------------------------------

function pushUrl(replace = false): void {
  const search = filterStateToSearch(state);
  const url = `${window.location.pathname}${search}`;

  if (replace) window.history.replaceState({ scfs: true }, "", url);
  else window.history.pushState({ scfs: true }, "", url);
}

/** Applies a state change: update URL, then refetch. */
function commit(next: FilterState, options: { replace?: boolean } = {}): void {
  state = next;
  pushUrl(options.replace);
  emit();
  void loadResults();
}

export function installHistoryListener(): void {
  window.addEventListener("popstate", () => {
    // Back/forward: the URL is the source of truth, so re-read it wholesale.
    state = parseFilterState(window.location.search);
    if (state.perPage === null && config?.toolbar.defaultPerPage) {
      state = { ...state, perPage: config.toolbar.defaultPerPage };
    }
    emit();
    void loadResults();
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actions = {
  toggleValue(param: string, value: string, multiSelect = true): void {
    commit(toggleValue(state, param, value, multiSelect));
  },

  setRange(param: string, min: number | null, max: number | null): void {
    commit(setRange(state, param, min, max));
  },

  removeChip(param: string, value: string | null): void {
    commit(removeSelection(state, param, value ?? undefined));
  },

  clearAll(): void {
    commit(clearAllFilters(state));
  },

  setTerm(term: string | null): void {
    commit(setTerm(state, term));
  },

  setSort(sort: string): void {
    commit(setSort(state, sort));
  },

  setPerPage(perPage: number): void {
    commit(setPerPage(state, perPage));
  },

  goToPage(page: number): void {
    commit(setPage(state, page));
    // Deep pagination should return the shopper to the top of the results.
    document
      .querySelector("[data-scfs-results]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  /** Load-more keeps the current products and appends the next page. */
  async loadMore(): Promise<void> {
    const next = setPage(state, state.page + 1);
    const previous = result?.products ?? [];
    state = next;
    pushUrl(true);
    await loadResults();
    if (result) {
      result = { ...result, products: [...previous, ...result.products] };
      emit();
    }
  },
};
