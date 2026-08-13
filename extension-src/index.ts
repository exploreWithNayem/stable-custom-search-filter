/**
 * Storefront runtime entry point.
 *
 * Boot order matters: configuration first (it decides the engine and seeds the
 * toolbar), then a single results fetch. Blocks may appear in any combination,
 * so every wiring step is independent and tolerant of missing markup.
 */

import { all, one, show } from "./dom";
import { readContext } from "./context";
import {
  actions,
  getConfig,
  installHistoryListener,
  loadConfig,
  loadResults,
  subscribe,
} from "./store";
import { renderActiveCount, renderFacets } from "./render-facets";
import {
  renderChips,
  renderCount,
  renderGrid,
  renderPagination,
} from "./render-results";
import { initSearch } from "./search";
import { initDrawer } from "./drawer";
import { configureAnalytics, installAnalyticsFlush, track } from "./analytics";
import { SORT_OPTIONS, PER_PAGE_OPTIONS } from "../app/lib/filter-url";

/** Guard against the script being included by more than one block. */
const BOOTED = "__scfsBooted";

function wireToolbar(): void {
  const config = getConfig();

  for (const select of all<HTMLSelectElement>("[data-scfs-sort]")) {
    const options = config?.toolbar.sortOptions ?? SORT_OPTIONS;
    select.innerHTML = "";
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.appendChild(node);
    }
    select.addEventListener("change", () => actions.setSort(select.value));
  }

  for (const select of all<HTMLSelectElement>("[data-scfs-per-page]")) {
    const options = config?.toolbar.perPageOptions ?? PER_PAGE_OPTIONS;
    select.innerHTML = "";
    for (const option of options) {
      const node = document.createElement("option");
      node.value = String(option);
      node.textContent = String(option);
      select.appendChild(node);
    }
    select.addEventListener("change", () =>
      actions.setPerPage(Number(select.value)),
    );
  }

  for (const button of all("[data-scfs-clear-all]")) {
    button.addEventListener("click", () => actions.clearAll());
  }
}

function syncToolbarValues(sort: string | null, perPage: number | null): void {
  for (const select of all<HTMLSelectElement>("[data-scfs-sort]")) {
    if (sort) select.value = sort;
  }
  for (const select of all<HTMLSelectElement>("[data-scfs-per-page]")) {
    if (perPage) select.value = String(perPage);
  }
}

function boot(): void {
  const globalScope = window as unknown as Record<string, boolean>;
  if (globalScope[BOOTED]) return;
  globalScope[BOOTED] = true;

  const sidebars = all("[data-scfs-sidebar]");
  const results = all("[data-scfs-results]");
  const searches = all("[data-scfs-search]");

  // Nothing of ours on the page — do no work at all.
  if (sidebars.length === 0 && results.length === 0 && searches.length === 0) {
    return;
  }

  installHistoryListener();
  installAnalyticsFlush();

  for (const sidebar of sidebars) {
    if (sidebar.dataset.scfsMobileDrawer !== "false") initDrawer(sidebar);
  }

  for (const search of searches) initSearch(search);

  subscribe(({ state, config, result, status, activeCount }) => {
    if (config) configureAnalytics(config.analytics);

    for (const sidebar of sidebars) {
      const facets = one<HTMLElement>("[data-scfs-facets]", sidebar);
      if (facets && result) renderFacets(facets, result.facets);
    }

    renderActiveCount(activeCount);
    if (result) renderChips(result.activeFilters);
    renderCount(result);
    syncToolbarValues(state.sort, state.perPage);

    for (const container of results) {
      renderGrid(container, result, status);
      renderPagination(container, result);
    }

    const status_ = one<HTMLElement>("[data-scfs-search-status]");
    if (status_ && result) {
      status_.textContent =
        result.totalCount !== null
          ? `${result.totalCount} results`
          : `${result.products.length} results`;
    }
  });

  void (async () => {
    await loadConfig();
    wireToolbar();

    const config = getConfig();

    // Engine Native means Shopify's own filtering already rendered the page.
    // The runtime still manages chips, the drawer and the URL, but it must not
    // replace a server-rendered grid with its own (CLAUDE.md §7).
    if (config?.engine === "native" && results.length === 0) {
      hydrateNativeLinks();
      return;
    }

    await loadResults();

    const result = getConfig();
    void result;
  })();
}

/**
 * Engine Native fallback: keep Shopify's server-rendered filter form working
 * while syncing our chips and drawer to the same URL grammar.
 */
function hydrateNativeLinks(): void {
  for (const sidebar of all("[data-scfs-sidebar]")) {
    sidebar.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== "checkbox") return;

      const params = new URLSearchParams(window.location.search);
      if (target.checked) params.append(target.name, target.value);
      else {
        const kept = params.getAll(target.name).filter((v) => v !== target.value);
        params.delete(target.name);
        for (const value of kept) params.append(target.name, value);
      }
      params.delete("page");

      track({
        type: "filter",
        filterHandle: target.name,
        filterValue: target.value,
        resultCount: 0,
        collectionHandle: readContext().context.collection || null,
      });

      window.location.assign(`${window.location.pathname}?${params.toString()}`);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

// Theme editor re-renders sections without a page load.
document.addEventListener("shopify:section:load", () => {
  const globalScope = window as unknown as Record<string, boolean>;
  globalScope[BOOTED] = false;
  boot();
});

export { show };
