/**
 * Wireframe previews for the filter layout picker.
 *
 * Drawn as inline SVG rather than shipped as images: they stay crisp at any
 * size, add no requests, and follow the admin's text colour (every shape uses
 * `currentColor` at a different opacity), so they work in light and dark.
 */

import type { Layout, MobileLayout } from "../../lib/validation";

const FILTER = 0.72;
const PRODUCT = 0.16;
const CHROME = 0.1;

/** A row of filter bars: a heading rule then a few value rules. */
function FilterGroup({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g fill="currentColor" opacity={FILTER}>
      <rect x={x} y={y} width={w} height={3} rx={1.5} />
      <rect x={x} y={y + 6} width={w * 0.8} height={2} rx={1} />
      <rect x={x} y={y + 11} width={w * 0.65} height={2} rx={1} />
      <rect x={x} y={y + 16} width={w * 0.75} height={2} rx={1} />
    </g>
  );
}

function ProductGrid({
  x,
  y,
  w,
  columns = 3,
  rows = 2,
}: {
  x: number;
  y: number;
  w: number;
  columns?: number;
  rows?: number;
}) {
  const gap = 3;
  const tile = (w - gap * (columns - 1)) / columns;

  return (
    <g fill="currentColor" opacity={PRODUCT}>
      {Array.from({ length: rows * columns }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return (
          <rect
            key={index}
            x={x + column * (tile + gap)}
            y={y + row * (tile + gap)}
            width={tile}
            height={tile}
            rx={2}
          />
        );
      })}
    </g>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 78"
      width="100%"
      role="presentation"
      style={{
        display: "block",
        borderRadius: 4,
        background: "rgba(0,0,0,0.03)",
      }}
    >
      <g fill="currentColor" opacity={CHROME}>
        <rect x="0" y="0" width="120" height="8" rx="2" />
      </g>
      <g fill="currentColor" opacity={0.3}>
        <circle cx="6" cy="4" r="1.2" />
        <circle cx="10" cy="4" r="1.2" />
        <circle cx="14" cy="4" r="1.2" />
      </g>
      {children}
    </svg>
  );
}

export function DesktopLayoutThumb({ layout }: { layout: Layout }) {
  switch (layout) {
    case "sidebar":
      return (
        <Frame>
          <FilterGroup x={6} y={14} w={26} />
          <FilterGroup x={6} y={40} w={26} />
          <ProductGrid x={38} y={14} w={76} columns={3} rows={2} />
        </Frame>
      );

    case "offcanvas":
      return (
        <Frame>
          <ProductGrid x={38} y={14} w={76} columns={3} rows={2} />
          {/* The panel sits over a dimmed page rather than beside it. */}
          <rect
            x="0"
            y="8"
            width="120"
            height="70"
            fill="currentColor"
            opacity={0.18}
          />
          <rect
            x="0"
            y="8"
            width="36"
            height="70"
            fill="currentColor"
            opacity={0.12}
          />
          <FilterGroup x={5} y={14} w={26} />
          <FilterGroup x={5} y={40} w={26} />
        </Frame>
      );

    case "collapsed":
      return (
        <Frame>
          <g fill="currentColor" opacity={FILTER}>
            <rect x="6" y="12" width="24" height="7" rx={2} />
          </g>
          <ProductGrid x={6} y={24} w={108} columns={4} rows={2} />
        </Frame>
      );

    case "columns_1":
      return (
        <Frame>
          <g fill="currentColor" opacity={FILTER}>
            <rect x="6" y="12" width="108" height="4" rx={2} />
            <rect x="6" y="19" width="108" height="4" rx={2} />
            <rect x="6" y="26" width="108" height="4" rx={2} />
          </g>
          <ProductGrid x={6} y={35} w={108} columns={4} rows={1} />
        </Frame>
      );

    case "columns_2":
      return (
        <Frame>
          <g fill="currentColor" opacity={FILTER}>
            <rect x="6" y="12" width="52" height="4" rx={2} />
            <rect x="62" y="12" width="52" height="4" rx={2} />
            <rect x="6" y="19" width="52" height="4" rx={2} />
            <rect x="62" y="19" width="52" height="4" rx={2} />
            <rect x="6" y="26" width="52" height="4" rx={2} />
            <rect x="62" y="26" width="52" height="4" rx={2} />
          </g>
          <ProductGrid x={6} y={35} w={108} columns={4} rows={1} />
        </Frame>
      );

    case "columns_3":
      return (
        <Frame>
          <g fill="currentColor" opacity={FILTER}>
            {[6, 43, 80].map((x) => (
              <g key={x}>
                <rect x={x} y="12" width="34" height="4" rx={2} />
                <rect x={x} y="19" width="34" height="4" rx={2} />
                <rect x={x} y="26" width="34" height="4" rx={2} />
              </g>
            ))}
          </g>
          <ProductGrid x={6} y={35} w={108} columns={4} rows={1} />
        </Frame>
      );

    case "show_all":
      return (
        <Frame>
          <g fill="currentColor" opacity={FILTER}>
            <rect x="6" y="12" width="108" height="5" rx={2} />
            {[6, 27, 48, 69, 90].map((x) => (
              <g key={x}>
                <rect x={x} y="20" width="18" height="3" rx={1.5} />
                <rect x={x} y="25" width="14" height="2" rx={1} />
                <rect x={x} y="29" width="16" height="2" rx={1} />
              </g>
            ))}
          </g>
          <ProductGrid x={6} y={36} w={108} columns={4} rows={1} />
        </Frame>
      );
  }
}

export function MobileLayoutThumb({ layout }: { layout: MobileLayout }) {
  const phone = (children: React.ReactNode) => (
    <svg
      viewBox="0 0 60 96"
      width="100%"
      role="presentation"
      style={{ display: "block", maxWidth: 96, margin: "0 auto" }}
    >
      <rect
        x="4"
        y="2"
        width="52"
        height="92"
        rx="7"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      {children}
    </svg>
  );

  switch (layout) {
    case "drawer":
      return phone(
        <>
          <ProductGrid x={9} y={20} w={42} columns={2} rows={3} />
          <rect
            x="4"
            y="2"
            width="52"
            height="92"
            rx="7"
            fill="currentColor"
            opacity={0.18}
          />
          <rect
            x="4"
            y="2"
            width="34"
            height="92"
            rx="7"
            fill="currentColor"
            opacity={0.12}
          />
          <FilterGroup x={9} y={12} w={24} />
          <FilterGroup x={9} y={40} w={24} />
        </>,
      );

    case "fullscreen":
      return phone(
        <>
          <rect
            x="4"
            y="2"
            width="52"
            height="92"
            rx="7"
            fill="currentColor"
            opacity={0.1}
          />
          <FilterGroup x={10} y={12} w={40} />
          <FilterGroup x={10} y={40} w={40} />
          <FilterGroup x={10} y={68} w={40} />
        </>,
      );

    case "inline":
      return phone(
        <>
          <g fill="currentColor" opacity={FILTER}>
            <rect x="9" y="10" width="42" height="4" rx={2} />
            <rect x="9" y="17" width="42" height="4" rx={2} />
            <rect x="9" y="24" width="42" height="4" rx={2} />
          </g>
          <ProductGrid x={9} y={33} w={42} columns={2} rows={2} />
        </>,
      );
  }
}
