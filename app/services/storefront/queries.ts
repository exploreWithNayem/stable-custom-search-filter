/**
 * Storefront API documents (CLAUDE.md D8).
 *
 * Facet values and their counts come from Shopify's own `filters` field, which
 * is why the app never scans the catalog. Each returned value carries an
 * `input` JSON blob that can be handed straight back as a `ProductFilter` —
 * that is how metafield and range filters are round-tripped without the app
 * having to model Shopify's bucketing.
 */

export const PRODUCT_CARD_FRAGMENT = /* GraphQL */ `
  fragment ProductCard on Product {
    id
    title
    handle
    vendor
    productType
    availableForSale
    tags
    featuredImage {
      url
      altText
      width
      height
    }
    images(first: 2) {
      nodes {
        url
        altText
        width
        height
      }
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    options(first: 3) {
      name
      optionValues {
        name
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    rating: metafield(namespace: "reviews", key: "rating") {
      value
    }
    ratingCount: metafield(namespace: "reviews", key: "rating_count") {
      value
    }
  }
`;

export const FILTERS_FRAGMENT = /* GraphQL */ `
  fragment FilterFields on Filter {
    id
    label
    type
    presentation
    values {
      id
      label
      count
      input
      swatch {
        color
        image {
          previewImage {
            url
          }
        }
      }
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_CARD_FRAGMENT}
  ${FILTERS_FRAGMENT}
  query CollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
  ) {
    collection(handle: $handle) {
      id
      handle
      title
      products(
        first: $first
        after: $after
        sortKey: $sortKey
        reverse: $reverse
        filters: $filters
      ) {
        filters {
          ...FilterFields
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          endCursor
          startCursor
        }
        nodes {
          ...ProductCard
        }
      }
    }
  }
`;

/**
 * Ids-only variant used to walk cursors when jumping to a numbered page.
 * Deliberately tiny — it exists to move a cursor, not to render anything.
 */
export const COLLECTION_CURSOR_QUERY = /* GraphQL */ `
  query CollectionCursor(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
  ) {
    collection(handle: $handle) {
      products(
        first: $first
        after: $after
        sortKey: $sortKey
        reverse: $reverse
        filters: $filters
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const SEARCH_PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_CARD_FRAGMENT}
  ${FILTERS_FRAGMENT}
  query SearchProducts(
    $query: String!
    $first: Int!
    $after: String
    $sortKey: SearchSortKeys
    $reverse: Boolean
    $productFilters: [ProductFilter!]
  ) {
    search(
      query: $query
      first: $first
      after: $after
      sortKey: $sortKey
      reverse: $reverse
      productFilters: $productFilters
      types: [PRODUCT]
    ) {
      totalCount
      productFilters {
        ...FilterFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      nodes {
        ... on Product {
          ...ProductCard
        }
      }
    }
  }
`;

export const SEARCH_CURSOR_QUERY = /* GraphQL */ `
  query SearchCursor(
    $query: String!
    $first: Int!
    $after: String
    $sortKey: SearchSortKeys
    $reverse: Boolean
    $productFilters: [ProductFilter!]
  ) {
    search(
      query: $query
      first: $first
      after: $after
      sortKey: $sortKey
      reverse: $reverse
      productFilters: $productFilters
      types: [PRODUCT]
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const PREDICTIVE_SEARCH_QUERY = /* GraphQL */ `
  query PredictiveSearch($query: String!, $limit: Int!) {
    predictiveSearch(
      query: $query
      limit: $limit
      types: [PRODUCT, COLLECTION, QUERY]
    ) {
      queries {
        text
        styledText
      }
      collections {
        id
        title
        handle
        image {
          url
          altText
        }
      }
      products {
        id
        title
        handle
        vendor
        productType
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;
