/**
 * Small presentational helpers shared by the admin pages.
 *
 * These wrap Polaris web components rather than replacing them — the point is
 * consistency of the *composition* (a stat tile, an empty state, a usage
 * meter), not a second design system.
 */

import type { ReactNode } from "react";

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
        <s-heading>{typeof value === "number" ? value.toLocaleString() : value}</s-heading>
        {helpText ? (
          <s-text color="subdued">
            {tone ? <s-badge tone={tone}>{helpText}</s-badge> : helpText}
          </s-text>
        ) : null}
      </s-stack>
    </s-box>
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
      <path d={path} fill="none" stroke="#303030" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
