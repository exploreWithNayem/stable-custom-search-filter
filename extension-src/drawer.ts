/**
 * Mobile filter drawer (CLAUDE.md §10.8, §20).
 *
 * Focus is trapped while open, body scroll is locked, Escape closes, and focus
 * returns to the trigger — the four things that make a drawer usable with a
 * keyboard or a screen reader.
 */

import { show, trapFocus } from "./dom";

export function initDrawer(sidebar: HTMLElement): void {
  const panel = sidebar.querySelector<HTMLElement>("[data-scfs-panel]");
  const openButton = sidebar.querySelector<HTMLElement>(
    "[data-scfs-drawer-open]",
  );
  const closeButton = sidebar.querySelector<HTMLElement>(
    "[data-scfs-drawer-close]",
  );
  const applyButton = sidebar.querySelector<HTMLElement>(
    "[data-scfs-drawer-apply]",
  );
  const scrim = sidebar.querySelector<HTMLElement>("[data-scfs-drawer-scrim]");

  if (!panel || !openButton) return;

  let releaseFocus: (() => void) | null = null;
  let previousOverflow = "";

  /*
   * Whether this is an overlay is a layout decision, and layout lives in CSS.
   * Reading the computed position keeps the two from disagreeing: the inline
   * mobile layout must not lock body scroll or trap focus, because the panel
   * is still part of the page.
   */
  function isOverlay(): boolean {
    return window.getComputedStyle(panel!).position === "fixed";
  }

  function open(): void {
    sidebar.classList.add("scfs-sidebar--open");
    openButton?.setAttribute("aria-expanded", "true");
    show(closeButton, true);

    if (!isOverlay()) return;

    show(scrim, true);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    releaseFocus = trapFocus(panel!);
    (closeButton ?? panel!).focus?.();
  }

  function close(): void {
    sidebar.classList.remove("scfs-sidebar--open");
    openButton?.setAttribute("aria-expanded", "false");
    show(scrim, false);

    document.body.style.overflow = previousOverflow;

    releaseFocus?.();
    releaseFocus = null;

    // Return focus where the shopper left it.
    openButton?.focus?.();
  }

  openButton.addEventListener("click", open);
  closeButton?.addEventListener("click", close);
  applyButton?.addEventListener("click", close);
  scrim?.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      sidebar.classList.contains("scfs-sidebar--open")
    ) {
      close();
    }
  });

  // In the sidebar layouts the panel becomes a static column above the
  // breakpoint, so an open drawer must be closed or body scroll stays locked
  // behind a panel that is now part of the page. The off-canvas layouts keep
  // their overlay at every width, and `isOverlay` is what tells them apart —
  // including after the runtime resolves a layout the block deferred to us.
  const media = window.matchMedia("(min-width: 990px)");
  const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
    if (!event.matches) return;
    if (sidebar.classList.contains("scfs-sidebar--open") && !isOverlay())
      close();
  };
  if ("addEventListener" in media) media.addEventListener("change", onChange);
}
