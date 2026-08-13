/**
 * Builds the theme extension's assets from `extension-src/`.
 *
 * `index.ts` → `assets/scfs.js`, `scfs.css` → `assets/scfs.css`, both minified.
 *
 * The bundle's entry graph reaches into `app/lib/filter-url.ts`, so the
 * storefront and the server share one implementation of the URL grammar by
 * construction — there is no second copy that could drift (CLAUDE.md §4.2).
 *
 * Also enforces the asset budgets from CLAUDE.md §17: the build fails rather
 * than silently shipping a heavier bundle.
 */

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(root, "extensions", "stable-custom-filter");
// The source lives outside the extension: Shopify's theme-extension bundler
// rejects any directory other than assets/blocks/snippets/locales.
const sourceDir = join(root, "extension-src");

/** Gzipped budgets in bytes. */
const BUDGETS = {
  "scfs.js": 25 * 1024,
  "scfs.css": 8 * 1024,
};

function gzipSize(path) {
  return gzipSync(readFileSync(path)).length;
}

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const result = await build({
    entryPoints: [join(sourceDir, "index.ts")],
    outfile: join(extensionDir, "assets", "scfs.js"),
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2019"],
    platform: "browser",
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
  });

  if (result.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  // The stylesheet is minified rather than copied, so its comments can be as
  // long as they need to be without spending the §17 budget on them.
  const css = await build({
    entryPoints: [join(sourceDir, "scfs.css")],
    outfile: join(extensionDir, "assets", "scfs.css"),
    minify: true,
    loader: { ".css": "css" },
    logLevel: "warning",
  });

  if (css.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  const failures = [];

  for (const [asset, budget] of Object.entries(BUDGETS)) {
    const path = join(extensionDir, "assets", asset);

    let raw;
    try {
      raw = statSync(path).size;
    } catch {
      console.warn(`  ${asset.padEnd(12)} missing — skipped`);
      continue;
    }

    const gz = gzipSize(path);
    const status = gz <= budget ? "ok" : "OVER BUDGET";
    console.log(
      `  ${asset.padEnd(12)} ${format(raw).padStart(9)} raw  ${format(gz).padStart(9)} gz  (budget ${format(budget)}) ${status}`,
    );

    if (gz > budget) {
      failures.push(`${asset} is ${format(gz)} gzipped, over the ${format(budget)} budget`);
    }
  }

  if (failures.length > 0) {
    console.error("\nAsset budget exceeded (CLAUDE.md §17):");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nExtension assets built.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
