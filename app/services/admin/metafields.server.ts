/**
 * Metafield definition discovery for the filter builder (CLAUDE.md §6.6, Phase 7).
 *
 * IMPORTANT — filterability: whether a metafield can drive a *storefront* filter
 * is controlled by Shopify's Search & Discovery app, and the Admin API does not
 * expose that flag. `adminFilterable` is a different capability and is not a
 * reliable proxy. Rather than assert something we cannot verify, definitions are
 * returned with `storefrontFilterable: "unknown"` and the builder shows an
 * actionable warning. `markVerifiedFilterable` upgrades that to "yes" once a
 * definition has actually been observed in a Storefront API facet response.
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { logger } from "../../lib/logger.server";
import {
  displayTypesForMetafieldType,
  isMetafieldTypeSupported,
  type FilterDisplayType,
} from "../../config/filter-types";

const DEFINITIONS_QUERY = /* GraphQL */ `
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!, $after: String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first, after: $after) {
      nodes {
        id
        name
        namespace
        key
        description
        type {
          name
          category
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type OwnerType = "PRODUCT" | "PRODUCTVARIANT";

export interface MetafieldDefinition {
  id: string;
  name: string;
  namespace: string;
  key: string;
  /** "namespace.key" — the value stored in `Filter.sourceKey`. */
  sourceKey: string;
  description: string | null;
  type: string;
  ownerType: OwnerType;
  supported: boolean;
  allowedDisplayTypes: readonly FilterDisplayType[];
  storefrontFilterable: "yes" | "unknown";
}

export async function listMetafieldDefinitions(
  admin: AdminApiContext,
  ownerType: OwnerType,
  verifiedKeys: Set<string> = new Set(),
): Promise<MetafieldDefinition[]> {
  const definitions: MetafieldDefinition[] = [];
  let after: string | null = null;

  // Bounded at 500 definitions: beyond that the picker needs search anyway.
  for (let page = 0; page < 5; page += 1) {
    let body: {
      data?: {
        metafieldDefinitions: {
          nodes: {
            id: string;
            name: string;
            namespace: string;
            key: string;
            description: string | null;
            type: { name: string };
          }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: unknown;
    };

    try {
      const response = await admin.graphql(DEFINITIONS_QUERY, {
        variables: { ownerType, first: 100, after },
      });
      body = await response.json();
    } catch (error) {
      logger.error("admin.metafield_definitions_threw", {
        ownerType,
        message: error instanceof Error ? error.message : "unknown",
      });
      break;
    }

    if (body.errors) {
      logger.error("admin.metafield_definitions_failed", {
        ownerType,
        errors: body.errors,
      });
    }

    const connection = body.data?.metafieldDefinitions;
    if (!connection) break;

    for (const node of connection.nodes) {
      const sourceKey = `${node.namespace}.${node.key}`;
      const type = node.type.name;

      definitions.push({
        id: node.id,
        name: node.name,
        namespace: node.namespace,
        key: node.key,
        sourceKey,
        description: node.description,
        type,
        ownerType,
        supported: isMetafieldTypeSupported(type),
        allowedDisplayTypes: displayTypesForMetafieldType(type),
        storefrontFilterable: verifiedKeys.has(sourceKey) ? "yes" : "unknown",
      });
    }

    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return definitions;
}

/**
 * Product options available as filter sources. Derived from a sample of
 * products because Shopify has no "list every option name" query — the sample
 * is capped so the builder stays fast on large catalogues.
 */
const PRODUCT_OPTIONS_QUERY = /* GraphQL */ `
  query ProductOptionNames($first: Int!) {
    products(first: $first) {
      nodes {
        options {
          name
        }
      }
    }
  }
`;

export async function listProductOptionNames(
  admin: AdminApiContext,
  sampleSize = 100,
): Promise<string[]> {
  try {
    const response = await admin.graphql(PRODUCT_OPTIONS_QUERY, {
      variables: { first: Math.min(sampleSize, 250) },
    });
    const body = (await response.json()) as {
      data?: { products: { nodes: { options: { name: string }[] }[] } };
    };

    const names = new Set<string>();
    for (const product of body.data?.products.nodes ?? []) {
      for (const option of product.options) names.add(option.name);
    }

    return [...names].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    logger.error("admin.product_options_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}
