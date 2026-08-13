/**
 * Search field and predictive suggestions (CLAUDE.md §11).
 *
 * Tier 1 uses the theme's own `/search/suggest.json` — zero app requests. Tier 2
 * goes through the proxy so synonyms, redirects and custom suggestions apply.
 * A Tier 2 endpoint that answers 204 (plan does not include it) transparently
 * downgrades to Tier 1.
 */

import { debounce, el, replaceChildren, show } from "./dom";
import { formatMoney, readContext } from "./context";
import { actions, getConfig, getResult } from "./store";
import { track } from "./analytics";
import type { SuggestResponse } from "./types";

let sequence = 0;
let controller: AbortController | null = null;

async function fetchTier2(term: string, signal: AbortSignal): Promise<SuggestResponse | null> {
  const { proxy } = readContext();
  const response = await fetch(
    `${proxy}/suggest?q=${encodeURIComponent(term)}`,
    { headers: { Accept: "application/json" }, signal },
  );

  // 204 means the shop is not entitled to Tier 2 — fall through to Tier 1.
  if (response.status === 204 || !response.ok) return null;
  return (await response.json()) as SuggestResponse;
}

interface NativeSuggestPayload {
  resources?: {
    results?: {
      products?: {
        id: string;
        title: string;
        handle: string;
        url: string;
        image?: string | null;
        price?: string;
        vendor?: string;
      }[];
      collections?: { id: string; title: string; handle: string; url: string }[];
      queries?: { text: string }[];
    };
  };
}

async function fetchTier1(
  term: string,
  limit: number,
  signal: AbortSignal,
): Promise<SuggestResponse | null> {
  const { routes } = readContext();
  const url = `${routes.predictive}?q=${encodeURIComponent(term)}&resources[type]=product,collection,query&resources[limit]=${limit}&section_id=predictive-search`;

  try {
    const response = await fetch(
      `${routes.predictive}?q=${encodeURIComponent(term)}&resources[type]=product,collection,query&resources[limit]=${limit}`,
      { headers: { Accept: "application/json" }, signal },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as NativeSuggestPayload;
    const results = body.resources?.results;
    if (!results) return null;

    return {
      term,
      redirect: null,
      products: (results.products ?? []).map((product) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        url: product.url,
        image: product.image ? { url: product.image, altText: null } : null,
        price: product.price ?? null,
        currency: readContext().context.currency,
        vendor: product.vendor ?? null,
        productType: null,
      })),
      collections: (results.collections ?? []).map((collection) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        url: collection.url,
        image: null,
      })),
      queries: (results.queries ?? []).map((query) => query.text),
      totalSuggestions:
        (results.products?.length ?? 0) +
        (results.collections?.length ?? 0) +
        (results.queries?.length ?? 0),
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return null;
    // A theme without the predictive endpoint is not an error worth surfacing.
    void url;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSuggestions(
  panel: HTMLElement,
  input: HTMLInputElement,
  data: SuggestResponse | null,
  showViewAll: boolean,
): void {
  const strings = readContext().strings;

  if (!data || data.totalSuggestions === 0) {
    replaceChildren(panel, [
      el("p", { class: "scfs-suggest__empty", text: strings.searchNoResults }),
    ]);
    show(panel, true);
    input.setAttribute("aria-expanded", "true");
    return;
  }

  const nodes: HTMLElement[] = [];

  if (data.queries.length > 0) {
    nodes.push(
      el("p", { class: "scfs-suggest__heading", text: strings.searchSuggestions }),
    );
    const list = el("ul", { class: "scfs-suggest__list", role: "presentation" });
    for (const query of data.queries) {
      const option = el("li", {
        class: "scfs-suggest__item",
        role: "option",
        tabindex: "-1",
        text: query,
      });
      option.addEventListener("click", () => {
        input.value = query;
        applyTerm(query);
        closePanel(panel, input);
      });
      list.appendChild(option);
    }
    nodes.push(list);
  }

  if (data.products.length > 0) {
    nodes.push(
      el("p", { class: "scfs-suggest__heading", text: strings.searchProducts }),
    );
    const list = el("ul", { class: "scfs-suggest__list", role: "presentation" });
    for (const product of data.products) {
      const option = el("li", {
        class: "scfs-suggest__item scfs-suggest__item--product",
        role: "option",
        tabindex: "-1",
      });

      const link = el("a", { class: "scfs-suggest__link", href: product.url });
      if (product.image) {
        link.appendChild(
          el("img", {
            class: "scfs-suggest__image",
            src: product.image.url,
            alt: product.image.altText ?? "",
            loading: "lazy",
            width: 48,
            height: 48,
          }),
        );
      }

      const meta = el("span", { class: "scfs-suggest__meta" }, [
        el("span", { class: "scfs-suggest__title", text: product.title }),
        product.price
          ? el("span", {
              class: "scfs-suggest__price",
              text: formatMoney(product.price, product.currency ?? "USD"),
            })
          : null,
        product.vendor
          ? el("span", { class: "scfs-suggest__vendor", text: product.vendor })
          : null,
      ]);

      link.appendChild(meta);
      link.addEventListener("click", () => {
        track({
          type: "search",
          term: data.term,
          resultCount: data.totalSuggestions,
          kind: "predictive",
          clickedProductId: product.id,
        });
      });

      option.appendChild(link);
      list.appendChild(option);
    }
    nodes.push(list);
  }

  if (data.collections.length > 0) {
    nodes.push(
      el("p", { class: "scfs-suggest__heading", text: strings.searchCollections }),
    );
    const list = el("ul", { class: "scfs-suggest__list", role: "presentation" });
    for (const collection of data.collections) {
      list.appendChild(
        el("li", { class: "scfs-suggest__item", role: "option", tabindex: "-1" }, [
          el("a", {
            class: "scfs-suggest__link",
            href: collection.url,
            text: collection.title,
          }),
        ]),
      );
    }
    nodes.push(list);
  }

  if (showViewAll) {
    const viewAll = el("a", {
      class: "scfs-suggest__view-all",
      href: `${readContext().routes.search}?q=${encodeURIComponent(data.term)}&type=product`,
      text: `Search for "${data.term}"`,
    });
    nodes.push(viewAll);
  }

  replaceChildren(panel, nodes);
  show(panel, true);
  input.setAttribute("aria-expanded", "true");
}

function closePanel(panel: HTMLElement, input: HTMLInputElement): void {
  show(panel, false);
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function applyTerm(term: string): void {
  actions.setTerm(term.trim() || null);

  // Result count is not known yet; record it once the response lands.
  const result = getResult();
  track({
    type: "search",
    term,
    resultCount: result?.totalCount ?? result?.products.length ?? 0,
    kind: "search",
    collectionHandle: readContext().context.collection || null,
    locale: readContext().context.locale,
  });
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

function installKeyboard(panel: HTMLElement, input: HTMLInputElement): void {
  input.addEventListener("keydown", (event) => {
    const options = Array.from(
      panel.querySelectorAll<HTMLElement>('[role="option"]'),
    );
    if (options.length === 0) return;

    const activeIndex = options.findIndex((option) =>
      option.classList.contains("scfs-suggest__item--active"),
    );

    const move = (nextIndex: number) => {
      options.forEach((option) =>
        option.classList.remove("scfs-suggest__item--active"),
      );
      const target = options[(nextIndex + options.length) % options.length];
      target.classList.add("scfs-suggest__item--active");
      target.scrollIntoView({ block: "nearest" });
      if (!target.id) target.id = `scfs-option-${options.indexOf(target)}`;
      input.setAttribute("aria-activedescendant", target.id);
    };

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const link = options[activeIndex].querySelector("a");
      if (link) link.click();
      else options[activeIndex].click();
    } else if (event.key === "Escape") {
      closePanel(panel, input);
    }
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function initSearch(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>("[data-scfs-search-input]");
  const panel = root.querySelector<HTMLElement>("[data-scfs-search-results]");
  const form = root.querySelector<HTMLFormElement>("[data-scfs-search-form]");
  const clearButton = root.querySelector<HTMLElement>("[data-scfs-search-clear]");
  if (!input || !panel) return;

  const minChars = Number(root.dataset.scfsMinChars ?? 2);
  const delay = Number(root.dataset.scfsDebounce ?? 250);
  const predictiveEnabled = root.dataset.scfsPredictive !== "false";
  const filterInPlace = root.dataset.scfsFilterResults !== "false";

  const runSuggest = debounce(async (term: string) => {
    if (!predictiveEnabled || term.length < minChars) {
      closePanel(panel, input);
      return;
    }

    const requestId = ++sequence;
    controller?.abort();
    controller = new AbortController();

    const config = getConfig();
    const limit = config?.search.maxSuggestions ?? 6;

    let data: SuggestResponse | null = null;
    try {
      if (config?.search.tier === 2) {
        data = await fetchTier2(term, controller.signal);
      }
      if (!data) data = await fetchTier1(term, limit, controller.signal);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      data = null;
    }

    // Discard responses that a newer keystroke has superseded.
    if (requestId !== sequence) return;

    if (data?.redirect) {
      window.location.assign(data.redirect);
      return;
    }

    renderSuggestions(panel, input, data, config?.search.showViewAll ?? true);
  }, delay);

  const runFilter = debounce((term: string) => {
    if (!filterInPlace) return;
    if (term.length > 0 && term.length < minChars) return;
    applyTerm(term);
  }, delay);

  input.addEventListener("input", () => {
    const term = input.value.trim();
    show(clearButton, term.length > 0);
    void runSuggest(term);
    runFilter(term);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= minChars) void runSuggest(input.value.trim());
  });

  clearButton?.addEventListener("click", () => {
    input.value = "";
    show(clearButton, false);
    closePanel(panel, input);
    if (filterInPlace) applyTerm("");
    input.focus();
  });

  // In-place filtering means the form must not navigate away.
  form?.addEventListener("submit", (event) => {
    if (!filterInPlace) return;
    event.preventDefault();
    closePanel(panel, input);
    applyTerm(input.value.trim());
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) closePanel(panel, input);
  });

  installKeyboard(panel, input);
  show(clearButton, input.value.trim().length > 0);
}
