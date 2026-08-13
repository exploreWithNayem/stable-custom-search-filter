/**
 * Small presentational helpers shared by the admin pages.
 *
 * These wrap Polaris web components rather than replacing them — the point is
 * consistency of the *composition* (a stat tile, an empty state, a usage
 * meter), not a second design system.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useSubmit } from "react-router";

/**
 * Current values of a form, kept in sync as the shopper edits it.
 *
 * Same constraint as `AutoSubmitForm`: custom elements do not deliver events
 * through React 18's JSX props, so a live preview has to read the form
 * element itself. Form-associated custom elements contribute to `FormData`,
 * so one read covers Polaris controls and plain inputs alike.
 */
export function useFormValues(
  ref: RefObject<HTMLFormElement | null>,
): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    const read = () => {
      const next: Record<string, string> = {};
      for (const [key, value] of new FormData(form).entries()) {
        if (typeof value === "string") next[key] = value;
      }
      setValues(next);
    };

    read();
    form.addEventListener("change", read);
    form.addEventListener("input", read);
    return () => {
      form.removeEventListener("change", read);
      form.removeEventListener("input", read);
    };
  }, [ref]);

  return values;
}

/**
 * A form that submits as soon as a control inside it changes.
 *
 * Polaris web components are custom elements, and React 18 cannot bind their
 * events through JSX props — an `onChange` on `<s-switch>` is written out as a
 * string attribute and never fires. Listening on the form element instead
 * catches the event as it bubbles, whichever of `change` / `input` the
 * component dispatches, and the per-frame guard keeps a control that fires
 * both from submitting twice.
 */
export function AutoSubmitForm({
  children,
  ...props
}: {
  children: ReactNode;
  method?: "post";
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const submit = useSubmit();

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    let queued = false;
    const handler = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        submit(form, { method: "post" });
      });
    };

    form.addEventListener("change", handler);
    form.addEventListener("input", handler);
    return () => {
      form.removeEventListener("change", handler);
      form.removeEventListener("input", handler);
    };
  }, [submit]);

  return (
    <form ref={ref} method="post" {...props}>
      {children}
    </form>
  );
}

export function StatCard({
  label,
  value,
  helpText,
  tone,
}: {
  label: string;
  value: string | number;
  helpText?: string;
  tone?: "success" | "warning" | "critical";
}) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="small-400">
        <s-text color="subdued">{label}</s-text>
        <s-heading>
          {typeof value === "number" ? value.toLocaleString() : value}
        </s-heading>
        {helpText ? (
          <s-text color="subdued">
            {tone ? <s-badge tone={tone}>{helpText}</s-badge> : helpText}
          </s-text>
        ) : null}
      </s-stack>
    </s-box>
  );
}

/**
 * In-page tabs.
 *
 * Native buttons rather than `s-button`, because these need a click handler
 * and React 18 cannot attach one to a custom element. Roles and arrow-key
 * behaviour follow the tabs pattern so the group is one tab stop.
 */
export function Tabs<T extends string>({
  tabs,
  selected,
  onSelect,
}: {
  tabs: readonly { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid rgba(0,0,0,0.12)",
        marginBottom: 16,
      }}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                return;
              event.preventDefault();
              const step = event.key === "ArrowRight" ? 1 : -1;
              const next = tabs[(index + step + tabs.length) % tabs.length];
              onSelect(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            style={{
              padding: "8px 12px",
              border: 0,
              borderBottom: active
                ? "2px solid currentColor"
                : "2px solid transparent",
              background: "none",
              color: "inherit",
              font: "inherit",
              fontWeight: active ? 600 : 400,
              opacity: active ? 1 : 0.7,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A grid that reflows on its own.
 *
 * `s-grid` takes a literal template like "1fr 1fr 1fr" and holds that many
 * columns at every width, which is fine for a fixed pair of panels and wrong
 * for a card gallery — the admin iframe is often half a screen wide. This
 * wraps a plain CSS grid with `auto-fill`, so the column count follows the
 * space available.
 */
export function CardGrid({
  minColumnWidth = 220,
  children,
}: {
  minColumnWidth?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))`,
        gap: 16,
        alignItems: "stretch",
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  heading,
  description,
  action,
}: {
  heading: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <s-box padding="large-100">
      <s-stack direction="block" gap="base" alignItems="center">
        <s-heading>{heading}</s-heading>
        <s-paragraph>{description}</s-paragraph>
        {action}
      </s-stack>
    </s-box>
  );
}

/**
 * Usage meter. Renders an unbounded plan as "Unlimited" rather than a bar that
 * can never fill (CLAUDE.md §37).
 */
export function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  if (limit === null) {
    return (
      <s-stack direction="block" gap="small-400">
        <s-stack direction="inline" gap="base" justifyContent="space-between">
          <s-text>{label}</s-text>
          <s-text color="subdued">{used.toLocaleString()} / Unlimited</s-text>
        </s-stack>
      </s-stack>
    );
  }

  const percent = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = percent >= 100 ? "critical" : percent >= 80 ? "warning" : "auto";

  return (
    <s-stack direction="block" gap="small-400">
      <s-stack direction="inline" gap="base" justifyContent="space-between">
        <s-text>{label}</s-text>
        <s-text color="subdued">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </s-text>
      </s-stack>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background:
              tone === "critical"
                ? "#d72c0d"
                : tone === "warning"
                  ? "#ffb800"
                  : "#303030",
          }}
        />
      </div>
    </s-stack>
  );
}

/** Horizontal bar list — used for "top searches" and "top filters". */
export function BarList({
  items,
  emptyLabel,
}: {
  items: { label: string; value: number; secondary?: string }[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <s-paragraph>{emptyLabel}</s-paragraph>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <s-stack direction="block" gap="small-300">
      {items.map((item) => (
        <s-stack key={item.label} direction="block" gap="small-500">
          <s-stack direction="inline" gap="base" justifyContent="space-between">
            <s-text>{item.label}</s-text>
            <s-text color="subdued">
              {item.secondary ?? item.value.toLocaleString()}
            </s-text>
          </s-stack>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: "rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round((item.value / max) * 100)}%`,
                height: "100%",
                background: "#303030",
              }}
            />
          </div>
        </s-stack>
      ))}
    </s-stack>
  );
}

/** Dependency-free sparkline for the analytics timeseries (CLAUDE.md §14.2). */
export function Sparkline({
  points,
  height = 64,
}: {
  points: { day: string; value: number }[];
  height?: number;
}) {
  if (points.length < 2) return null;

  const max = Math.max(...points.map((point) => point.value), 1);
  const width = 100;
  const step = width / (points.length - 1);

  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point.value / max) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
      role="img"
      aria-label={`Trend from ${points[0].day} to ${points[points.length - 1].day}, peak ${max}`}
    >
      <path
        d={path}
        fill="none"
        stroke="#303030"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
