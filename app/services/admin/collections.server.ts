/**
 * Collection listing for the admin (CLAUDE.md §13.4, Phase 6).
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { logger } from "../../lib/logger.server";

const COLLECTIONS_QUERY = /* GraphQL */ `
  query AdminCollections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        productsCount {
          count
        }
        image {
          url
          altText
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface AdminCollection {
  id: string;
  handle: string;
  title: string;
  productsCount: number;
  imageUrl: string | null;
}

export interface CollectionPage {
  collections: AdminCollection[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export async function listCollections(
  admin: AdminApiContext,
  options: { first?: number; after?: string | null; query?: string | null } = {},
): Promise<CollectionPage> {
  const { first = 50, after = null, query = null } = options;

  try {
    const response = await admin.graphql(COLLECTIONS_QUERY, {
      variables: { first: Math.min(first, 250), after, query: query || null },
    });

    const body = (await response.json()) as {
      data?: {
        collections: {
          nodes: {
            id: string;
            handle: string;
            title: string;
            productsCount: { count: number } | null;
            image: { url: string } | null;
          }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: unknown;
    };

    if (body.errors) {
      logger.error("admin.collections_query_failed", { errors: body.errors });
    }

    const connection = body.data?.collections;
    if (!connection) {
      return { collections: [], hasNextPage: false, endCursor: null };
    }

    return {
      collections: connection.nodes.map((node) => ({
        id: node.id,
        handle: node.handle,
        title: node.title,
        productsCount: node.productsCount?.count ?? 0,
        imageUrl: node.image?.url ?? null,
      })),
      hasNextPage: connection.pageInfo.hasNextPage,
      endCursor: connection.pageInfo.endCursor,
    };
  } catch (error) {
    logger.error("admin.collections_threw", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { collections: [], hasNextPage: false, endCursor: null };
  }
}
