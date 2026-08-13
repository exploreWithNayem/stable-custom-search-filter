/**
 * Storefront runtime entry point.
 *
 * Boot order matters: configuration first (it resolves the layout and seeds
 * the toolbar), then a single results fetch. Every wiring step is independent
 * and tolerant of missing markup, because each part of the block can be turned
 * off in the theme editor.
 */

import { all, one, show } from "./dom";
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
import { configureAnalytics, installAnalyticsFlush } from "./analytics";
import { SORT_OPTIONS, PER_PAGE_OPTIONS } from "../app/lib/filter-url";

/** Guard against the script being included by more than one block. */
const BOOTED = "__scfsBooted";

/**
 * Attaches the toolbar's listeners.
 *
 * Runs before any network call, and never waits on one: gating this on the
 * config fetch meant a slow or unreachable proxy left the sort control with no
 * listener at all, so changing it did nothing and there was no error to show
 * for it. The option lists are filled in later by `syncToolbarOptions`.
 */
function wireToolbar(): void {
  for (const select of all<HTMLSelectElement>("[data-scfs-sort]")) {
    select.addEventListener("change", () => actions.setSort(select.value));
  }

  for (const select of all<HTMLSelectElement>("[data-scfs-per-page]")) {
    select.addEventListener("change", () =>
      actions.setPerPage(Number(select.value)),
    );
  }

  for (const button of all("[data-scfs-clear-all]")) {
    button.addEventListener("click", () => actions.clearAll());
  }
}

/** Replaces the markup's defaults with the merchant's configured lists. */
function syncToolbarOptions(): void {
  const config = getConfig();

  const fill = (
    select: HTMLSelectElement,
    options: readonly { value: string; label: string }[],
  ) => {
    // An empty list would leave a select with nothing in it; the markup's own
    // options are a better answer than none.
    if (options.length === 0) return;

    const previous = select.value;
    select.innerHTML = "";
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.appendChild(node);
    }
    if (options.some((option) => option.value === previous)) select.value = previous;
  };

  for (const select of all<HTMLSelectElement>("[data-scfs-sort]")) {
    fill(select, config?.toolbar.sortOptions ?? SORT_OPTIONS);
  }

  for (const select of all<HTMLSelectElement>("[data-scfs-per-page]")) {
    const options = config?.toolbar.perPageOptions ?? PER_PAGE_OPTIONS;
    fill(
      select,
      options.map((option) => ({ value: String(option), label: String(option) })),
    );
  }
}

/**
 * Wires the server-rendered fallback filters.
 *
 * Until app facets replace them the sidebar holds Shopify's own controls from
 * `scfs-native-filters.liquid`. They use the same `filter.*` grammar as the
 * runtime (CLAUDE.md D10), so a change can be translated straight into store
 * actions — without this they are inert markup, which is why the fallback
 * price inputs and checkboxes did nothing.
 */
function wireServerRenderedFilters(container: HTMLElement): void {
  container.addEventListener("change", (event) => {
    // Once the runtime has rendered its own facets, those controls carry their
    // own listeners and this would double-apply.
    if (container.dataset.scfsRendered === "true") return;

    const target = event.target as HTMLInputElement | null;
    if (!target?.name || !target.name.startsWith("filter.")) return;

    if (target.type === "checkbox" || target.type === "radio") {
      actions.toggleValue(target.name, target.value, target.type === "checkbox");
      return;
    }

    const suffix = target.name.endsWith(".gte")
      ? ".gte"
      : target.name.endsWith(".lte")
        ? ".lte"
        : null;
    if (!suffix) return;

    const base = target.name.slice(0, -suffix.length);
    const inputs = Array.from(
      container.querySelectorAll<HTMLInputElement>("input"),
    );

    const bound = (which: string): number | null => {
      const input = inputs.find((candidate) => candidate.name === base + which);
      if (!input || input.value === "") return null;
      const value = Number(input.value);
      return Number.isFinite(value) ? value : null;
    };

    actions.setRange(base, bound(".gte"), bound(".lte"));
  });
}

const KNOWN_LAYOUTS = [
  "sidebar",
  "offcanvas",
  "collapsed",
  "columns_1",
  "columns_2",
  "columns_3",
  "show_all",
];

/**
 * Resolves the layouts the block deferred to the app for.
 *
 * Liquid cannot read app settings, so a block left on "use the app setting"
 * renders with the sidebar defaults and is corrected here once the config
 * lands. Blocks with an explicit layout are left alone — a theme setting
 * outranks the shop default (CLAUDE.md §12.2).
 */
function applyConfiguredLayout(): void {
  const config = getConfig();
  if (!config) return;

  for (const root of all("[data-scfs-app]")) {
    if (
      root.dataset.scfsLayoutAuto === "true" &&
      KNOWN_LAYOUTS.includes(config.layout)
    ) {
      root.classList.remove(`scfs-app--${root.dataset.scfsDesktopLayout}`);
      root.classList.add(`scfs-app--${config.layout}`);
      root.dataset.scfsDesktopLayout = config.layout;

      const sidebar = one<HTMLElement>("[data-scfs-sidebar]", root);
      if (sidebar) sidebar.dataset.scfsLayout = config.layout;
    }

    if (root.dataset.scfsMobileLayout === "auto") {
      root.dataset.scfsMobileLayout = config.mobileLayout || "drawer";
    }
  }
}

const VIEW_KEY = "scfs:view";

/**
 * Grid / list switch. The choice is per-shopper rather than per-page, so it is
 * remembered locally and re-applied on the next collection they open.
 */
function wireViewSwitch(): void {
  const buttons = all<HTMLButtonElement>("[data-scfs-view]");
  if (buttons.length === 0) return;

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(VIEW_KEY);
  } catch {
    // Private browsing or blocked storage — fall back to the default view.
  }

  const apply = (view: string) => {
    for (const container of all("[data-scfs-results]")) {
      container.classList.toggle("scfs-results--list", view === "list");
    }
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        button.dataset.scfsView === view ? "true" : "false",
      );
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const view = button.dataset.scfsView ?? "grid";
      try {
        window.localStorage.setItem(VIEW_KEY, view);
      } catch {
        // Not being able to remember the choice is not a reason to ignore it.
      }
      apply(view);
    });
  }

  apply(stored === "list" ? "list" : "grid");
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
    if (sidebar.dataset.scfsMobileDrawer === "false") continue;
    initDrawer(sidebar);
  }

  wireViewSwitch();
  wireToolbar();

  for (const sidebar of sidebars) {
    const facets = one<HTMLElement>("[data-scfs-facets]", sidebar);
    if (facets) wireServerRenderedFilters(facets);
  }

  // Pressing Enter in a price field would otherwise navigate. The change event
  // has already applied the value by then, so this only stops the reload.
  for (const form of all<HTMLFormElement>("[data-scfs-filter-form]")) {
    form.addEventListener("submit", (event) => event.preventDefault());
  }

  for (const search of searches) initSearch(search);

  subscribe(({ state, config, result, status, activeCount, hydrating }) => {
    if (config) configureAnalytics(config.analytics);

    for (const sidebar of sidebars) {
      const facets = one<HTMLElement>("[data-scfs-facets]", sidebar);
      if (facets && result) renderFacets(facets, result.facets);
    }

    renderActiveCount(activeCount);
    if (result) renderChips(result.activeFilters);
    syncToolbarValues(state.sort, state.perPage);

    // Liquid rendered the grid, the pagination and an exact count for this
    // URL. The boot fetch exists to upgrade the sidebar, so leave all of that
    // alone — otherwise a slow, failing or empty first response replaces a
    // correct page with an empty one.
    if (hydrating) return;

    renderCount(result, activeCount);

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
    applyConfiguredLayout();
    syncToolbarOptions();

    // Hydrate, don't re-render: the products on screen are already the right
    // ones for this URL (§12.4). This response only upgrades the sidebar from
    // Shopify's native facets to the merchant's configured ones.
    await loadResults({ hydrate: true });
  })();
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
