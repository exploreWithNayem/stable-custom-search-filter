/**
 * Test bootstrap.
 *
 * Integration tests run against a real SQLite file (a separate one from dev) so
 * that Prisma behaviour — cascades, unique constraints, upsert-increment — is
 * exercised for real rather than mocked.
 *
 * The Shopify variables exist because `app/shopify.server.ts` calls
 * `shopifyApp()` at module load and throws on an empty `appUrl`. Anything that
 * transitively imports it (the proxy helpers, for instance) needs them set.
 * These are placeholders — no test makes a real Shopify request.
 */

process.env.DATABASE_URL ??= "file:./test.sqlite";
process.env.ANALYTICS_SESSION_SALT ??= "test-salt";
process.env.SHOPIFY_API_KEY ??= "test-api-key";
process.env.SHOPIFY_API_SECRET ??= "test-api-secret";
process.env.SHOPIFY_APP_URL ??= "https://app.test";
process.env.SCOPES ??= "read_products";
process.env.NODE_ENV = "test";
