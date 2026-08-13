import type { HeadersArgs, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { requireAdminContext } from "../services/shop/context.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticates, upserts the Shop row and seeds its singleton child records.
  await requireAdminContext(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/filters">Filters</s-link>
        <s-link href="/app/groups">Filter groups</s-link>
        <s-link href="/app/collections">Collections</s-link>
        <s-link href="/app/search">Search</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/pricing">Pricing</s-link>
        <s-link href="/app/help">Help</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: HeadersArgs) => {
  return boundary.headers(headersArgs);
};
