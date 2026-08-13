/**
 * Sidebar rendering (CLAUDE.md §8.2, §10.2, §10.9).
 *
 * Every control is built as real DOM with proper roles and labels — swatches
 * always carry a text accessible name, never colour alone.
 */

import { el, replaceChildren, show } from "./dom";
import { currencySymbol, readContext } from "./context";
import { actions } from "./store";
import type { Facet, FacetValue } from "./types";

function valueId(facet: Facet, value: string): string {
  return `scfs-${facet.handle}-${value}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function countBadge(facet: Facet, value: FacetValue): HTMLElement | null {
  if (!facet.showCount) return null;
  return el("span", { class: "scfs-value__count", text: `(${value.count})` });
}

// ---------------------------------------------------------------------------
// Value controls
// ---------------------------------------------------------------------------

function renderChoiceList(facet: Facet): HTMLElement {
  const single = !facet.multiSelect || facet.displayType === "radio";
  const list = el("ul", { class: "scfs-values", role: "list" });

  for (const value of facet.values) {
    const input = el("input", {
      type: single ? "radio" : "checkbox",
      id: valueId(facet, value.value),
      name: facet.param,
      value: value.value,
      checked: value.active,
      disabled: value.count === 0 && !value.active,
    });

    input.addEventListener("change", () => {
      actions.toggleValue(facet.param, value.value, !single);
    });

    const label = el(
      "label",
      {
        class: `scfs-value${value.count === 0 && !value.active ? " scfs-value--empty" : ""}`,
        for: valueId(facet, value.value),
      },
      [
        input,
        el("span", { class: "scfs-value__label", text: value.label }),
        countBadge(facet, value),
      ],
    );

    list.appendChild(el("li", { class: "scfs-values__item" }, [label]));
  }

  return list;
}

function renderDropdown(facet: Facet): HTMLElement {
  const select = el("select", {
    class: "scfs-dropdown",
    "aria-label": facet.label,
  });

  select.appendChild(el("option", { value: "", text: `All ${facet.label}` }));

  for (const value of facet.values) {
    select.appendChild(
      el("option", {
        value: value.value,
        selected: value.active,
        text: facet.showCount ? `${value.label} (${value.count})` : value.label,
      }),
    );
  }

  select.addEventListener("change", () => {
    const chosen = select.value;
    if (!chosen) {
      const active = facet.values.find((value) => value.active);
      if (active) actions.removeChip(facet.param, active.value);
      return;
    }
    actions.toggleValue(facet.param, chosen, false);
  });

  return select;
}

function renderButtons(facet: Facet): HTMLElement {
  const wrapper = el("div", {
    class: "scfs-pills",
    role: "group",
    "aria-label": facet.label,
  });

  for (const value of facet.values) {
    const button = el("button", {
      type: "button",
      class: `scfs-pill${value.active ? " scfs-pill--active" : ""}`,
      "aria-pressed": value.active ? "true" : "false",
      disabled: value.count === 0 && !value.active,
    });

    button.appendChild(document.createTextNode(value.label));
    if (facet.showCount) {
      button.appendChild(
        el("span", { class: "scfs-pill__count", text: ` (${value.count})` }),
      );
    }

    button.addEventListener("click", () => {
      actions.toggleValue(facet.param, value.value, facet.multiSelect);
    });

    wrapper.appendChild(button);
  }

  return wrapper;
}

function renderSwatches(facet: Facet, kind: "color" | "image"): HTMLElement {
  const wrapper = el("div", {
    class: `scfs-swatches scfs-swatches--${kind}`,
    role: "group",
    "aria-label": facet.label,
  });

  for (const value of facet.values) {
    const button = el("button", {
      type: "button",
      class: `scfs-swatch${value.active ? " scfs-swatch--active" : ""}`,
      // Colour alone is never the only signal — the accessible name carries
      // the value and its count (CLAUDE.md §10.9).
      "aria-label": facet.showCount
        ? `${value.label} (${value.count})`
        : value.label,
      "aria-pressed": value.active ? "true" : "false",
      title: value.label,
      disabled: value.count === 0 && !value.active,
    });

    const chip = el("span", { class: "scfs-swatch__chip" });
    const image = value.swatch?.image;
    const color = value.swatch?.color;

    if (image) chip.style.backgroundImage = `url(${CSS.escape(image)})`;
    else if (color) chip.style.backgroundColor = color;
    else chip.classList.add("scfs-swatch__chip--unknown");

    button.appendChild(chip);

    if (kind === "image") {
      button.appendChild(
        el("span", { class: "scfs-swatch__label", text: value.label }),
      );
    }

    button.addEventListener("click", () => {
      actions.toggleValue(facet.param, value.value, facet.multiSelect);
    });

    wrapper.appendChild(button);
  }

  return wrapper;
}

function renderRating(facet: Facet): HTMLElement {
  const wrapper = el("div", {
    class: "scfs-ratings",
    role: "group",
    "aria-label": facet.label,
  });

  for (const value of facet.values) {
    const threshold = Number(value.value);
    const button = el("button", {
      type: "button",
      class: `scfs-rating${value.active ? " scfs-rating--active" : ""}`,
      "aria-pressed": value.active ? "true" : "false",
      "aria-label": value.label,
      disabled: value.count === 0 && !value.active,
    });

    const stars = el("span", {
      class: "scfs-rating__stars",
      "aria-hidden": "true",
    });
    for (let index = 1; index <= 5; index += 1) {
      stars.appendChild(
        el("span", {
          class: `scfs-star${index <= threshold ? " scfs-star--on" : ""}`,
          text: "★",
        }),
      );
    }
    button.appendChild(stars);

    if (facet.showCount) {
      button.appendChild(
        el("span", { class: "scfs-value__count", text: `(${value.count})` }),
      );
    }

    button.addEventListener("click", () => {
      // Ratings are "N and up", so they are a lower bound, not a value list.
      if (value.active) actions.setRange(facet.param, null, null);
      else actions.setRange(facet.param, threshold, null);
    });

    wrapper.appendChild(button);
  }

  return wrapper;
}

/**
 * One bordered box holding the unit and its input, so the pair reads as two
 * fields with a separator rather than four loose elements in a row.
 */
function rangeField(unit: string, input: HTMLInputElement): HTMLElement {
  return el("div", { class: "scfs-range__field" }, [
    unit ? el("span", { class: "scfs-range__prefix", text: unit }) : null,
    input,
  ]);
}

function renderRange(facet: Facet): HTMLElement {
  const range = facet.range!;
  const min = range.min ?? 0;
  const max = range.max ?? 100;
  const currentMin = range.selectedMin ?? min;
  const currentMax = range.selectedMax ?? max;

  // A merchant can set an explicit unit ("cm", "kg"); a price range has an
  // obvious one and should not need configuring to show it.
  const unit =
    range.unit ?? (facet.source === "price" ? currencySymbol() : "");

  const wrapper = el("div", { class: "scfs-range" });

  const minInput = el("input", {
    type: "number",
    class: "scfs-range__input",
    value: String(currentMin),
    min: String(min),
    max: String(max),
    step: String(range.step),
    inputmode: "decimal",
    "aria-label": `${facet.label} minimum`,
  });

  const maxInput = el("input", {
    type: "number",
    class: "scfs-range__input",
    value: String(currentMax),
    min: String(min),
    max: String(max),
    step: String(range.step),
    inputmode: "decimal",
    "aria-label": `${facet.label} maximum`,
  });

  const commit = () => {
    const nextMin = Number(minInput.value);
    const nextMax = Number(maxInput.value);
    actions.setRange(
      facet.param,
      Number.isFinite(nextMin) && nextMin > min ? nextMin : null,
      Number.isFinite(nextMax) && nextMax < max ? nextMax : null,
    );
  };

  minInput.addEventListener("change", commit);
  maxInput.addEventListener("change", commit);

  wrapper.appendChild(
    el("div", { class: "scfs-range__fields" }, [
      rangeField(unit, minInput),
      el("span", {
        class: "scfs-range__separator",
        "aria-hidden": "true",
        text: "-",
      }),
      rangeField(unit, maxInput),
    ]),
  );

  if (
    facet.displayType === "range_slider" &&
    range.min !== null &&
    range.max !== null
  ) {
    wrapper.appendChild(
      renderSliderTrack(
        facet,
        min,
        max,
        currentMin,
        currentMax,
        minInput,
        maxInput,
        commit,
      ),
    );
  }

  return wrapper;
}

/**
 * Formats a tick label: integers stay bare, fractions keep two decimals.
 *
 * Truncated rather than rounded, so a tick can never advertise a bound above
 * the range's own maximum — rounding 564.9975 up to 565.00 would offer a price
 * the slider cannot actually select.
 */
function tickLabel(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return (Math.floor(value * 100) / 100).toFixed(2);
}

/**
 * Two overlaid single sliders plus a tick scale. Native range inputs are
 * keyboard-operable and screen-reader friendly, which a custom drag-handle
 * widget usually is not.
 */
function renderSliderTrack(
  facet: Facet,
  min: number,
  max: number,
  currentMin: number,
  currentMax: number,
  minInput: HTMLInputElement,
  maxInput: HTMLInputElement,
  commit: () => void,
): HTMLElement {
  const step = facet.range!.step;
  const container = el("div", { class: "scfs-slider-wrap" });
  const sliders = el("div", { class: "scfs-slider" });

  const lower = el("input", {
    type: "range",
    class: "scfs-slider__input scfs-slider__input--lower",
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(currentMin),
    "aria-label": `${facet.label} minimum`,
  });

  const upper = el("input", {
    type: "range",
    class: "scfs-slider__input scfs-slider__input--upper",
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(currentMax),
    "aria-label": `${facet.label} maximum`,
  });

  // The filled segment between the handles is drawn from these two percentages.
  const paint = () => {
    const span = max - min || 1;
    const from = ((Number(lower.value) - min) / span) * 100;
    const to = ((Number(upper.value) - min) / span) * 100;
    sliders.style.setProperty("--scfs-from", `${from}%`);
    sliders.style.setProperty("--scfs-to", `${to}%`);
  };

  const sync = () => {
    // Keep the handles from crossing over each other.
    if (Number(lower.value) > Number(upper.value)) {
      const swap = lower.value;
      lower.value = upper.value;
      upper.value = swap;
    }
    minInput.value = lower.value;
    maxInput.value = upper.value;
    paint();
  };

  lower.addEventListener("input", sync);
  upper.addEventListener("input", sync);
  lower.addEventListener("change", commit);
  upper.addEventListener("change", commit);

  sliders.appendChild(lower);
  sliders.appendChild(upper);
  paint();
  container.appendChild(sliders);

  const ticks = el("div", {
    class: "scfs-slider__ticks",
    "aria-hidden": "true",
  });
  // Five evenly spaced marks: quarters read as a scale without crowding the
  // labels into each other at sidebar width.
  const TICKS = 4;
  for (let index = 0; index <= TICKS; index += 1) {
    const value = min + ((max - min) * index) / TICKS;
    ticks.appendChild(
      el("span", { class: "scfs-slider__tick", text: tickLabel(value) }),
    );
  }
  container.appendChild(ticks);

  return container;
}

function renderBoolean(facet: Facet): HTMLElement {
  const value = facet.values[0];
  if (!value) return el("div");

  const input = el("input", {
    type: "checkbox",
    id: valueId(facet, value.value),
    checked: value.active,
  });

  input.addEventListener("change", () => {
    actions.toggleValue(facet.param, value.value, false);
  });

  return el(
    "label",
    { class: "scfs-value", for: valueId(facet, value.value) },
    [
      input,
      el("span", { class: "scfs-value__label", text: value.label }),
      countBadge(facet, value),
    ],
  );
}

// ---------------------------------------------------------------------------
// Facet shell
// ---------------------------------------------------------------------------

function renderFacetBody(facet: Facet): HTMLElement {
  switch (facet.displayType) {
    case "dropdown":
      return renderDropdown(facet);
    case "button":
      return renderButtons(facet);
    case "color_swatch":
      return renderSwatches(facet, "color");
    case "image_swatch":
      return renderSwatches(facet, "image");
    case "rating":
      return renderRating(facet);
    case "range":
    case "range_slider":
      return renderRange(facet);
    case "boolean":
      return renderBoolean(facet);
    default:
      return renderChoiceList(facet);
  }
}

/**
 * Long value lists scroll inside the facet rather than pushing the rest of the
 * sidebar down; pills wrap and reveal the overflow behind "Show more" instead,
 * because a scrolling pill grid hides values that are only one row away.
 */
function overflowMode(facet: Facet): "scroll" | "more" {
  switch (facet.displayType) {
    case "button":
    case "tag_pill":
    case "rating":
    case "boolean":
    case "dropdown":
    case "range":
    case "range_slider":
      return "more";
    default:
      return "scroll";
  }
}

/** Adds the value scroll box or "show more", plus an in-facet value search. */
function applyValueOverflow(
  facet: Facet,
  body: HTMLElement,
  showAll: boolean,
): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  const items = Array.from(
    body.querySelectorAll<HTMLElement>(
      ".scfs-values__item, .scfs-pill, .scfs-swatch",
    ),
  );

  if (facet.searchableValues && items.length > 4) {
    const strings = readContext().strings;
    const search = el("input", {
      type: "search",
      class: "scfs-facet-search",
      placeholder: strings.searchValues,
      "aria-label": `${strings.searchValues}: ${facet.label}`,
    });

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      for (const item of items) {
        const text = item.textContent?.toLowerCase() ?? "";
        item.style.display = !query || text.includes(query) ? "" : "none";
      }
    });

    nodes.push(search);
  }

  // The "show all filter options" layout exists precisely so nothing is
  // hidden; capping values there would defeat the layout the merchant chose.
  const overflows = !showAll && items.length > facet.maxVisibleValues;

  if (overflows && overflowMode(facet) === "scroll") {
    // CSS turns the row count into a height, so the box always cuts a row in
    // half — which is what signals "there is more below" without a legend.
    const box = el("div", {
      class: "scfs-scroll",
      tabindex: "0",
      role: "group",
      "aria-label": facet.label,
    });
    box.style.setProperty("--scfs-visible", String(facet.maxVisibleValues));
    box.appendChild(body);
    nodes.push(box);
    return nodes;
  }

  nodes.push(body);

  if (overflows) {
    let expanded = false;
    const hidden = items.slice(facet.maxVisibleValues);
    for (const item of hidden) item.style.display = "none";

    const toggle = el("button", {
      type: "button",
      class: "scfs-show-more",
      "aria-expanded": "false",
      text: readContext().strings.showMore,
    });

    toggle.addEventListener("click", () => {
      expanded = !expanded;
      for (const item of hidden) item.style.display = expanded ? "" : "none";
      toggle.textContent = expanded
        ? readContext().strings.showLess
        : readContext().strings.showMore;
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });

    nodes.push(toggle);
  }

  return nodes;
}

function renderFacet(facet: Facet, showAll: boolean): HTMLElement {
  const details = el("details", {
    class: `scfs-group scfs-group--${facet.displayType}`,
    "data-scfs-facet": facet.handle,
    open: showAll || !facet.collapsedByDefault || facet.activeCount > 0,
  });

  // `<details>` hides its body through an internal slot, so CSS alone cannot
  // hold it open — the layout has to keep the element open itself.
  if (showAll) {
    details.addEventListener("toggle", () => {
      if (!details.open) details.open = true;
    });
  }

  const summary = el("summary", { class: "scfs-group__summary" }, [
    el("span", { class: "scfs-group__title", text: facet.label }),
    facet.activeCount > 0
      ? el("span", {
          class: "scfs-group__badge",
          text: String(facet.activeCount),
        })
      : null,
    el("span", { class: "scfs-group__chevron", "aria-hidden": "true" }),
  ]);

  const body = el("div", { class: "scfs-group__body" }, [
    ...applyValueOverflow(facet, renderFacetBody(facet), showAll),
  ]);

  details.appendChild(summary);
  details.appendChild(body);
  return details;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderFacets(container: HTMLElement, facets: Facet[]): void {
  // No facets means the app has nothing better to offer, not that the shopper
  // should lose the filters Liquid already rendered from `collection.filters`
  // (§12.4). Clearing here is how a failed or empty response used to blank the
  // whole sidebar.
  if (facets.length === 0) return;

  const root = container.closest<HTMLElement>("[data-scfs-app]");
  const showAll =
    root?.dataset.scfsDesktopLayout === "show_all" &&
    window.matchMedia("(min-width: 990px)").matches;

  const nodes: HTMLElement[] = [];
  let currentGroup: string | null = null;
  let groupBody: HTMLElement | null = null;

  for (const facet of facets) {
    const groupHandle = facet.group?.handle ?? null;

    if (groupHandle !== currentGroup) {
      currentGroup = groupHandle;
      groupBody = null;

      if (facet.group) {
        const section = el("section", {
          class: "scfs-section",
          "data-scfs-group": facet.group.handle,
        });
        section.appendChild(
          el("h3", { class: "scfs-section__title", text: facet.group.name }),
        );
        groupBody = el("div", { class: "scfs-section__body" });
        section.appendChild(groupBody);
        nodes.push(section);
      }
    }

    const rendered = renderFacet(facet, showAll);
    if (groupBody) groupBody.appendChild(rendered);
    else nodes.push(rendered);
  }

  replaceChildren(container, nodes);
  // From here the controls are ours and carry their own listeners, so the
  // delegated handler for the server-rendered fallback must stand down.
  container.dataset.scfsRendered = "true";
}

export function renderActiveCount(count: number): void {
  for (const node of Array.from(
    document.querySelectorAll<HTMLElement>("[data-scfs-active-count]"),
  )) {
    node.textContent = String(count);
    show(node, count > 0);
  }

  for (const node of Array.from(
    document.querySelectorAll<HTMLElement>("[data-scfs-clear-all]"),
  )) {
    show(node, count > 0);
  }
}
