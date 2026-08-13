/// <reference types="@react-router/node" />
/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    SHOPIFY_API_KEY?: string;
    SHOPIFY_API_SECRET?: string;
    SHOPIFY_APP_URL?: string;
    SHOP_CUSTOM_DOMAIN?: string;
    SCOPES?: string;
    DATABASE_URL?: string;
    /** Salt used to hash storefront session identifiers before persisting. */
    ANALYTICS_SESSION_SALT?: string;
    /** Set to "1" to create test billing subscriptions on a dev store. */
    SHOPIFY_BILLING_TEST?: string;
    NODE_ENV?: "development" | "production" | "test";
  }
}
