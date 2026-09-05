## What does Tokopedia Reviews Scraper do?

Tokopedia Reviews Scraper collects customer reviews and ratings from Tokopedia product pages and saves them as structured, analysis-ready dataset items. Run it with a Tokopedia product URL or a direct product ID, and the Actor returns review text, star ratings, purchased variants, buyer names, media counts, review timestamps, and more in a single run. The output is ready for product research, competitor monitoring, seller feedback tracking, and customer sentiment analysis.

Tokopedia is one of the largest online marketplaces in Indonesia, so review volume on popular products can be high. This Actor turns that volume into a clean dataset you can filter, sort, export, and reuse instead of scrolling through pages of feedback manually.

## Why use Tokopedia Reviews Scraper?

- **Structured review datasets** - Turn scattered Tokopedia review pages into clean JSON, CSV, or Excel rows without manual copy-paste.
- **Simple setup** - Provide a product URL or product ID and choose how many reviews to collect. No code required.
- **Pagination and volume control** - Use `results_wanted` and `max_pages` to keep test runs fast or to scale up for larger collections.
- **Flexible review sorting** - Choose the default "most informative" order, newest first, highest rating, or lowest rating to fit your analysis.
- **Clean output** - Null and empty values are removed before saving, so your dataset stays tidy for downstream use.
- **Automation-ready** - Schedule recurring runs, access data through the Apify API, and connect results to spreadsheets, dashboards, or business pipelines.

## What data can you extract from Tokopedia?

Each dataset item contains one review with product context, review content, and metadata:

| Field | Description |
|-------|-------------|
| `product_id` | Tokopedia product identifier |
| `product_url` | Product page URL |
| `product_name` | Product name when available |
| `shop_name` | Shop or seller name when available |
| `review_id` | Review identifier |
| `page` | Review page number |
| `position` | Review position in collected sequence |
| `rating` | Star rating given by the buyer |
| `variant_name` | Purchased variant or option label |
| `review_text` | Review message content |
| `buyer_name` | Reviewer display name |
| `likes_count` | Number of likes on the review |
| `images_count` | Number of attached images |
| `videos_count` | Number of attached videos |
| `review_time_relative` | Relative time label such as "3 bulan lalu" |
| `review_time_iso` | Review timestamp in ISO format when available |
| `sort_by` | Sort option used in the run |
| `source_type` | Input source used (`product_id`, `product_url`, `default_url`) |
| `fetched_at` | Data collection timestamp |

## How to use Tokopedia Reviews Scraper

1. Open the Actor on Apify Store.
2. Paste a Tokopedia product URL into `product_url`, or add a direct `product_id` if you have one.
3. Set the maximum number of reviews with `results_wanted` and the maximum pages with `max_pages`.
4. Choose a `sort_by` order.
5. Run the Actor.
6. Download the dataset or connect it to your workflow through the Apify API.

Input priority when both are filled:

1. `product_id`
2. `product_url`
3. A built-in sample product URL when user input is empty

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `product_url` | String | No | Sample product URL | Tokopedia product URL. Recommended input. |
| `product_id` | String | No | - | Direct Tokopedia product ID. Takes priority over `product_url` when both are provided. |
| `results_wanted` | Integer | No | `20` | Maximum number of reviews to save. |
| `max_pages` | Integer | No | `5` | Maximum number of review pages to fetch. |
| `sort_by` | String | No | `informative_score desc` | Review sort order. Options: `informative_score desc`, `create_time desc`, `rating desc`, `rating asc`. |

## Usage Examples

### Basic Product URL Run

Collect the first batch of reviews from a Tokopedia product page using the recommended input:

```json
{
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "results_wanted": 20,
  "max_pages": 5
}
```

### Product ID Run

Run with a direct product ID for consistent targeting in automation pipelines:

```json
{
  "product_id": "100018999468",
  "results_wanted": 50,
  "max_pages": 10,
  "sort_by": "informative_score desc"
}
```

### Newest Reviews First

Collect the most recent feedback for monitoring or freshness tracking:

```json
{
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "results_wanted": 30,
  "max_pages": 5,
  "sort_by": "create_time desc"
}
```

### Highest-Rated Reviews

Focus on positive feedback to study what buyers appreciate most:

```json
{
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "results_wanted": 20,
  "max_pages": 5,
  "sort_by": "rating desc"
}
```

## Sample Output

```json
{
  "product_id": "100018999468",
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "product_name": "Jasmine Pashmina Kaos Bahan Cotton Rayon Adem Ringan Lembut Ukuran 175x60 cm - Black",
  "shop_name": "Toko hijab jasmine",
  "review_id": "1469897442",
  "page": 1,
  "position": 1,
  "rating": 5,
  "variant_name": "Brownie",
  "review_text": "Bagus banget sesuai ekspektasi...",
  "buyer_name": "R***u",
  "likes_count": 1,
  "images_count": 4,
  "videos_count": 0,
  "review_time_relative": "12 bulan lalu",
  "review_time_iso": "2025-05-20T17:39:41.000Z",
  "sort_by": "informative_score desc",
  "source_type": "product_url",
  "fetched_at": "2026-05-16T08:23:33.387Z"
}
```

## Tips for Best Results

- Start with `results_wanted` between 20 and 50 to validate output before running larger collections.
- Use product URLs that already have visible customer reviews. Products with no reviews will return an empty dataset.
- For scheduled or automated pipelines, prefer `product_id` because it targets the product directly and does not depend on URL formatting.

- Combine a sensible `max_pages` limit with scheduling so recurring runs stay predictable and low-cost.
- Some reviews have no text, images, or timestamps. Missing fields are expected when the source does not publish that information, and empty values are removed from the dataset.
- Tokopedia pages and review formats can change. If a run stops returning data, report the issue through the Issues tab so it can be fixed.

## Integrations

Connect your review dataset with:

- **Google Sheets** - Share review summaries with product or marketing teams.
- **Airtable** - Build searchable product feedback databases.
- **Looker Studio and BI tools** - Visualize rating trends and sentiment metrics.
- **Webhooks** - Trigger downstream automations after each run.
- **API** - Access dataset items programmatically from your own systems.

### Export Formats

- **JSON** - For APIs and developer workflows.
- **CSV** - For spreadsheets and quick analysis.
- **Excel** - For stakeholder reporting.

## Frequently Asked Questions

### Can I export Tokopedia review data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, and other supported formats from the dataset preview.

### Can I run this Actor with only a product ID?

Yes. `product_id` is supported and takes priority when both an ID and a URL are provided.

### Why do some runs return fewer reviews than requested?

The Actor stops when no more pages or reviews are available for that product and sort combination. This is expected when a product has fewer reviews than the requested limit.

### Are empty fields included in the output?

No. Null and empty values are removed before dataset items are saved, which keeps exports clean.

### Does the sort option change the review list?

Yes. Different `sort_by` values produce different review order and selection, so results can vary between runs with different settings.

### Can I schedule recurring runs?

Yes. You can schedule the Actor in Apify Console to run daily or hourly and track how reviews change over time.

### Is it legal to scrape Tokopedia?

Scraping public web data can be legal, but you are responsible for complying with applicable laws and Tokopedia's terms. Use this Actor for legitimate research and analysis only.

## Related Actors

- [Tokopedia Search Scraper](https://apify.com/shahidirfan/tokopedia-search-scraper) - Collect Tokopedia product listings, prices, ratings, and seller data by keyword or search URL.
- [Daraz.pk Scraper](https://apify.com/shahidirfan/daraz-pk-scraper) - Extract product details, prices, and reviews from Pakistan's largest ecommerce platform.
- [AliExpress Scraper](https://apify.com/shahidirfan/aliexpress-scraper) - Gather product, pricing, rating, and seller data from AliExpress.

If you also need product listings to pair with review data, see the [Tokopedia Search Scraper](https://apify.com/shahidirfan/tokopedia-search-scraper) for the same marketplace.

## Support

For issues, feature requests, or custom Actor work, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is designed for legitimate data collection from publicly available sources. Users are responsible for using the data responsibly and complying with applicable laws and Tokopedia's terms of service.
