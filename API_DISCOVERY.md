# API Discovery Notes

This actor uses Tokopedia GraphQL endpoints discovered from Tokopedia review-page JS bundles and validated by direct request replay.

## Selected Endpoints

- `POST https://gql.tokopedia.com/graphql/productReviewList`
  - Query: `productReviewList`
  - Purpose: fetch paginated product reviews

- `POST https://gql.tokopedia.com/graphql/productReviewFilterSummary`
  - Query: `productReviewFilterSummary`
  - Purpose: fetch available review filter keys (media, ratings, topics)

- `POST https://gql.tokopedia.com/graphql/getMiniProductInfo`
  - Query: `getMiniProductInfo`
  - Purpose: resolve/validate product metadata from product URL

- `POST https://gql.tokopedia.com/graphql/SearchProductV5Query`
  - Query: `SearchProductV5Query`
  - Purpose: keyword-to-product fallback resolution

## Validation Result

- Endpoints return HTTP 200 with valid review payload for live product IDs.
- Actor implementation is API-based (no HTML parsing for review extraction).
- If product metadata endpoint is temporarily unstable, scraper falls back to product ID parsed from URL when possible.
