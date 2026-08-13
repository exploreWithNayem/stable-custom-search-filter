/**
 * Live preview of a single filter option (CLAUDE.md §13.3).
 *
 * Deliberately a plain-HTML approximation of the storefront markup rather than
 * an iframe of the real thing: the merchant is choosing a display type, and
 * that decision only needs the shape, not real product data. The device and
 * layout switches use native buttons because React 18 can bind their events —
 * Polaris custom elements it cannot.
 */

import { useState } from "react";
import type { FilterDisplayType } from "../../config/filter-types";

type Device = "desktop" | "mobile";
type Layout = "vertical" | "horizontal";

const SAMPLE_VALUES = ["Black", "White", "Navy", "Sand"];
const SAMPLE_COLORS = ["#111111", "#f2f2f2", "#1f3a68", "#d9c7a7"];

const border = "1px solid rgba(0,0,0,0.15)";

function Body({
  displayType,
  layout,
}: {
  displayType: FilterDisplayType;
  layout: Layout;
}) {
  const inline = layout === "horizontal";

  switch (displayType) {
    case "color_swatch":
    case "image_swatch":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SAMPLE_VALUES.map((value, index) => (
            <span
              key={value}
              title={value}
              style={{
                width: 24,
                height: 24,
                borderRadius: displayType === "color_swatch" ? 999 : 4,
                border,
                background: SAMPLE_COLORS[index],
              }}
            />
          ))}
        </div>
      );

    case "button":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SAMPLE_VALUES.map((value) => (
            <span
              key={value}
              style={{
                padding: "4px 10px",
                border,
                borderRadius: 999,
                fontSize: 12,
              }}
            >
              {value}
            </span>
          ))}
        </div>
      );

    case "dropdown":
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 10px",
            border,
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <span>All values</span>
          <span aria-hidden="true">▾</span>
        </div>
      );

    case "range":
    case "range_slider":
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <span
              style={{ flex: 1, padding: "5px 8px", border, borderRadius: 4 }}
            >
              $ 5
            </span>
            <span>–</span>
            <span
              style={{ flex: 1, padding: "5px 8px", border, borderRadius: 4 }}
            >
              $ 110
            </span>
          </div>
          {displayType === "range_slider" ? (
            <div style={{ position: "relative", height: 16 }}>
              <div
                style={{
                  position: "absolute",
                  top: 7,
                  left: 0,
                  right: 0,
                  height: 3,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.15)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 7,
                  left: "15%",
                  right: "25%",
                  height: 3,
                  borderRadius: 999,
                  background: "currentColor",
                }}
              />
              {["15%", "75%"].map((left) => (
                <span
                  key={left}
                  style={{
                    position: "absolute",
                    top: 2,
                    left,
                    width: 13,
                    height: 13,
                    marginLeft: -6,
                    borderRadius: 999,
                    background: "currentColor",
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      );

    case "rating":
      return (
        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {[4, 3].map((stars) => (
            <div key={stars} style={{ display: "flex", gap: 6 }}>
              <span style={{ color: "#f5a623", letterSpacing: 1 }}>
                {"★".repeat(stars)}
                <span style={{ color: "rgba(0,0,0,0.2)" }}>
                  {"★".repeat(5 - stars)}
                </span>
              </span>
              <span style={{ opacity: 0.55 }}>({stars * 2})</span>
            </div>
          ))}
        </div>
      );

    case "boolean":
      return (
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <input type="checkbox" readOnly />
          <span>In stock only</span>
        </label>
      );

    default:
      return (
        <div
          style={{
            display: inline ? "flex" : "grid",
            flexWrap: "wrap",
            gap: inline ? 12 : 4,
            fontSize: 13,
          }}
        >
          {SAMPLE_VALUES.map((value) => (
            <label
              key={value}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type={displayType === "radio" ? "radio" : "checkbox"}
                readOnly
              />
              <span style={{ flex: 1 }}>{value}</span>
              <span style={{ opacity: 0.55 }}>({SAMPLE_VALUES.length})</span>
            </label>
          ))}
        </div>
      );
  }
}

function SwitchButton({
  active,
  label,
  onSelect,
  children,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onSelect}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 32,
        border: active ? "2px solid currentColor" : border,
        borderRadius: 6,
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function FilterPreview({
  label,
  displayType,
}: {
  label: string;
  displayType: FilterDisplayType;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [layout, setLayout] = useState<Layout>("vertical");

  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="large-100">
        <s-stack direction="block" gap="small-400">
          <s-text color="subdued">Device</s-text>
          <s-stack direction="inline" gap="small-400">
            <SwitchButton
              active={device === "desktop"}
              label="Desktop preview"
              onSelect={() => setDevice("desktop")}
            >
              <span aria-hidden="true">🖥</span>
            </SwitchButton>
            <SwitchButton
              active={device === "mobile"}
              label="Mobile preview"
              onSelect={() => setDevice("mobile")}
            >
              <span aria-hidden="true">📱</span>
            </SwitchButton>
          </s-stack>
        </s-stack>

        <s-stack direction="block" gap="small-400">
          <s-text color="subdued">Layout</s-text>
          <s-stack direction="inline" gap="small-400">
            <SwitchButton
              active={layout === "vertical"}
              label="Sidebar layout"
              onSelect={() => setLayout("vertical")}
            >
              <span aria-hidden="true">▤</span>
            </SwitchButton>
            <SwitchButton
              active={layout === "horizontal"}
              label="Horizontal layout"
              onSelect={() => setLayout("horizontal")}
            >
              <span aria-hidden="true">▥</span>
            </SwitchButton>
          </s-stack>
        </s-stack>
      </s-stack>

      <s-box padding="base" borderWidth="base" borderRadius="base">
        <div
          style={{
            maxWidth:
              device === "mobile"
                ? 240
                : layout === "horizontal"
                  ? "100%"
                  : 260,
            marginInline: device === "mobile" ? "auto" : undefined,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 8,
              marginBottom: 8,
              borderBottom: border,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <span>{label || "Untitled filter"}</span>
            <span aria-hidden="true">▾</span>
          </div>
          <Body displayType={displayType} layout={layout} />
        </div>
      </s-box>

      <s-text color="subdued">
        An approximation of the storefront markup. Real values, counts and
        swatch colours appear once the filter is saved.
      </s-text>
    </s-stack>
  );
}
