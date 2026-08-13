/**
 * Product grid, chips, count and pagination (CLAUDE.md §10.3-§10.7, §13, §14).
 */

import { el, replaceChildren, show } from "./dom";
import { formatCount, formatMoney, readContext } from "./context";
import { actions } from "./store";
import type { ActiveChip, ProductCard, ProductsResponse } from "./types";

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

export interface CardOptions {
  showVendor: boolean;
  showRating: boolean;
  showSwatches: boolean;
  showSecondImage: boolean;
  imageRatio: string;
}

/** Shopify CDN images accept width hints, which keeps the grid light. */
function sizedUrl(url: string, width: number): string {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

function renderImage(product: ProductCard, options: CardOptions): HTMLElement {
  const wrapper = el("div", {
    class: `scfs-card__media scfs-card__media--${options.imageRatio}`,
  });

  if (product.image) {
    const img = el("img", {
      class: "scfs-card__image",
      src: sizedUrl(product.image.url, 500),
      srcset: [300, 500, 750]
        .map((width) => `${sizedUrl(product.image!.url, width)} ${width}w`)
        .join(", "),
      sizes: "(min-width: 990px) 300px, 45vw",
      alt: product.image.altText ?? product.title,
      loading: "lazy",
      decoding: "async",
      width: product.image.width ?? 500,
      height: product.image.height ?? 500,
    });
    wrapper.appendChild(img);

    if (options.showSecondImage && product.hoverImage) {
      wrapper.appendChild(
        el("img", {
          class: "scfs-card__image scfs-card__image--hover",
          src: sizedUrl(product.hoverImage.url, 500),
          alt: "",
          "aria-hidden": "true",
          loading: "lazy",
          decoding: "async",
        }),
      );
    }
  } else {
    wrapper.appendChild(el("div", { class: "scfs-card__image-placeholder" }));
  }

  const badges = el("div", { class: "scfs-card__badges" });
  if (!product.available) {
    badges.appendChild(
      el("span", {
        class: "scfs-badge scfs-badge--sold-out",
        text: readContext().strings.soldOut,
      }),
    );
  } else if (product.onSale) {
    badges.appendChild(
      el("span", {
        class: "scfs-badge scfs-badge--sale",
        text: readContext().strings.sale,
      }),
    );
  }
  if (badges.childNodes.length > 0) wrapper.appendChild(badges);

  return wrapper;
}

function renderRating(product: ProductCard): HTMLElement | null {
  if (!product.rating) return null;

  const rounded = Math.round(product.rating.value);
  const stars = el("span", { class: "scfs-card__stars", "aria-hidden": "true" });
  for (let index = 1; index <= 5; index += 1) {
    stars.appendChild(
      el("span", {
        class: `scfs-star${index <= rounded ? " scfs-star--on" : ""}`,
        text: "★",
      }),
    );
  }

  return el(
    "div",
    {
      class: "scfs-card__rating",
      "aria-label": `Rated ${product.rating.value} out of 5 from ${product.rating.count} reviews`,
    },
    [
      stars,
      product.rating.count > 0
        ? el("span", {
            class: "scfs-card__rating-count",
            text: `(${product.rating.count})`,
          })
        : null,
    ],
  );
}

function renderPrice(product: ProductCard): HTMLElement {
  const price = el("div", { class: "scfs-card__price" });

  const current = formatMoney(product.price, product.currency);
  price.appendChild(
    el("span", {
      class: `scfs-price${product.onSale ? " scfs-price--sale" : ""}`,
      text: product.priceVaries ? `From ${current}` : current,
    }),
  );

  if (product.compareAtPrice) {
    price.appendChild(
      el("s", {
        class: "scfs-price scfs-price--compare",
        text: formatMoney(product.compareAtPrice, product.currency),
      }),
    );
  }

  return price;
}

function renderVariantOptions(product: ProductCard): HTMLElement | null {
  // Show the first non-colour option (typically size) as a compact hint.
  const option = product.options.find(
    (candidate) => !/colou?r/i.test(candidate.name),
  );
  if (!option || option.values.length === 0) return null;

  const list = el("ul", {
    class: "scfs-card__options",
    role: "list",
    "aria-label": option.name,
  });

  for (const value of option.values.slice(0, 6)) {
    list.appendChild(el("li", { class: "scfs-card__option", text: value }));
  }
  if (option.values.length > 6) {
    list.appendChild(el("li", { class: "scfs-card__option", text: "…" }));
  }

  return list;
}

function renderSwatches(product: ProductCard): HTMLElement | null {
  if (product.swatches.length === 0) return null;

  const list = el("ul", {
    class: "scfs-card__swatches",
    role: "list",
    "aria-label": "Available colours",
  });

  for (const swatch of product.swatches.slice(0, 5)) {
    const chip = el("span", { class: "scfs-card__swatch" });
    if (swatch.image) chip.style.backgroundImage = `url(${CSS.escape(swatch.image)})`;
    else if (swatch.color) chip.style.backgroundColor = swatch.color;

    list.appendChild(
      el("li", { class: "scfs-card__swatch-item", title: swatch.value }, [
        chip,
        el("span", { class: "scfs-visually-hidden", text: swatch.value }),
      ]),
    );
  }

  return list;
}

export function renderCard(
  product: ProductCard,
  options: CardOptions,
): HTMLElement {
  const card = el("article", { class: "scfs-card", "data-product-id": product.id });

  const link = el("a", { class: "scfs-card__link", href: product.url }, [
    renderImage(product, options),
  ]);
  card.appendChild(link);

  const body = el("div", { class: "scfs-card__body" });

  if (options.showVendor && product.vendor) {
    body.appendChild(el("p", { class: "scfs-card__vendor", text: product.vendor }));
  }

  body.appendChild(
    el("h3", { class: "scfs-card__title" }, [
      el("a", { href: product.url, text: product.title }),
    ]),
  );

  if (options.showRating) {
    const rating = renderRating(product);
    if (rating) body.appendChild(rating);
  }

  body.appendChild(renderPrice(product));

  const variantOptions = renderVariantOptions(product);
  if (variantOptions) body.appendChild(variantOptions);

  if (options.showSwatches) {
    const swatches = renderSwatches(product);
    if (swatches) body.appendChild(swatches);
  }

  card.appendChild(body);
  return card;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export function renderGrid(
  container: HTMLElement,
  result: ProductsResponse | null,
  status: string,
): void {
  const grid = container.querySelector<HTMLElement>("[data-scfs-grid]");
  const empty = container.querySelector<HTMLElement>("[data-scfs-empty]");
  const error = container.querySelector<HTMLElement>("[data-scfs-error]");
  if (!grid) return;

  grid.setAttribute("aria-busy", status === "loading" ? "true" : "false");
  container.classList.toggle("scfs-results--loading", status === "loading");

  if (status === "error") {
    show(error, true);
    show(empty, false);
    return;
  }
  show(error, false);

  // Keep the previous grid on screen while a refresh is in flight; swapping to
  // skeletons on every keystroke is more disruptive than a dimmed grid.
  if (status === "loading" && result) return;
  if (!result) return;

  const options: CardOptions = {
    showVendor: container.dataset.scfsShowVendor === "true",
    showRating: container.dataset.scfsShowRating === "true",
    showSwatches: container.dataset.scfsShowSwatches === "true",
    showSecondImage: container.dataset.scfsShowSecondImage === "true",
    imageRatio: container.dataset.scfsImageRatio ?? "square",
  };

  if (result.products.length === 0) {
    replaceChildren(grid, []);
    show(empty, true);
    return;
  }

  show(empty, false);
  replaceChildren(
    grid,
    result.products.map((product) => renderCard(product, options)),
  );
}

// ---------------------------------------------------------------------------
// Count, chips, pagination
// ---------------------------------------------------------------------------

export function renderCount(result: ProductsResponse | null): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-scfs-count]"),
  );
  if (nodes.length === 0 || !result) return;

  // `totalCount` is null when the Storefront API cannot prove a total
  // (CLAUDE.md §7) — show what is on screen rather than inventing a number.
  const text =
    result.totalCount !== null
      ? formatCount(result.totalCount)
      : `${readContext().strings.searchProducts}: ${result.products.length}+`;

  for (const node of nodes) node.textContent = text;
}

export function renderChips(chips: ActiveChip[]): void {
  for (const container of Array.from(
    document.querySelectorAll<HTMLElement>("[data-scfs-active-filters]"),
  )) {
    const list = container.querySelector<HTMLElement>("[data-scfs-chips]");
    if (!list) continue;

    show(container, chips.length > 0);

    replaceChildren(
      list,
      chips.map((chip) => {
        const button = el("button", {
          type: "button",
          class: "scfs-chip",
          "aria-label": `Remove ${chip.label}`,
        });
        button.appendChild(document.createTextNode(chip.label));
        button.appendChild(
          el("span", { class: "scfs-chip__remove", "aria-hidden": "true", text: "×" }),
        );
        button.addEventListener("click", () =>
          actions.removeChip(chip.param, chip.value),
        );

        return el("li", { class: "scfs-active__item" }, [button]);
      }),
    );
  }
}

export function renderPagination(
  container: HTMLElement,
  result: ProductsResponse | null,
): void {
  const nav = container.querySelector<HTMLElement>("[data-scfs-pagination]");
  if (!nav || !result) return;

  const style = container.dataset.scfsPagination ?? "numbered";
  const { page, totalPages, hasNext, hasPrevious } = result.pagination;
  const strings = readContext().strings;

  if (!hasNext && !hasPrevious) {
    show(nav, false);
    replaceChildren(nav, []);
    return;
  }

  show(nav, true);

  if (style === "load_more") {
    const button = el("button", {
      type: "button",
      class: "scfs-load-more",
      text: strings.loadMore,
      disabled: !hasNext,
    });
    button.addEventListener("click", () => void actions.loadMore());
    replaceChildren(nav, [button]);
    return;
  }

  const nodes: HTMLElement[] = [];

  const prev = el("button", {
    type: "button",
    class: "scfs-page scfs-page--prev",
    text: strings.previous,
    disabled: !hasPrevious,
  });
  prev.addEventListener("click", () => actions.goToPage(page - 1));
  nodes.push(prev);

  // Numbered pages need a known total; without one we still offer prev/next.
  if (totalPages !== null) {
    for (const number of pageWindow(page, totalPages)) {
      if (number === null) {
        nodes.push(el("span", { class: "scfs-page-ellipsis", text: "…" }));
        continue;
      }

      const button = el("button", {
        type: "button",
        class: `scfs-page${number === page ? " scfs-page--current" : ""}`,
        text: String(number),
        "aria-current": number === page ? "page" : null,
        "aria-label": `Page ${number}`,
      });
      button.addEventListener("click", () => actions.goToPage(number));
      nodes.push(button);
    }
  }

  const next = el("button", {
    type: "button",
    class: "scfs-page scfs-page--next",
    text: strings.next,
    disabled: !hasNext,
  });
  next.addEventListener("click", () => actions.goToPage(page + 1));
  nodes.push(next);

  replaceChildren(nav, nodes);
}

/** Produces `1 … 4 5 6 … 20`, with `null` marking an ellipsis. */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const output: (number | null)[] = [];

  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) output.push(null);
    output.push(page);
    previous = page;
  }

  return output;
}
