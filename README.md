# Tokopedia Reviews Scraper

Extract Tokopedia product reviews quickly and turn them into structured, analysis-ready datasets. Collect reviewer feedback, ratings, variants, media counts, and timestamps in one run. Great for product research, seller monitoring, and customer sentiment analysis.

## Features

- **Review Collection** — Gather reviews from Tokopedia product pages with consistent structured output.
- **Simple Inputs** — Run with a product URL or direct product ID.
- **Pagination Controls** — Control volume using `results_wanted` and `max_pages`.
- **Sorting Options** — Choose newest, most helpful, highest rating, or lowest rating.
- **Clean Dataset Output** — Null and empty values are removed for cleaner exports.

## Use Cases

### Product Quality Research
Analyze what buyers consistently praise or complain about before deciding inventory or marketing angles. Review data helps identify recurring quality signals fast.

### Competitor Monitoring
Track review trends on competitor products over time. Spot shifts in satisfaction, common issues, and review momentum.

### Customer Sentiment Analysis
Build datasets for sentiment scoring and theme extraction. Use ratings, review text, and variants to map buyer experience.

### Marketplace Reporting
Create periodic reports for teams that need clear review KPIs. Export data to BI dashboards, spreadsheets, or internal tools.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `product_url` | String | No | Jasmine sample URL | Tokopedia product URL (recommended input). |
| `product_id` | String | No | — | Direct product ID. If filled, it takes priority over `product_url`. |
| `results_wanted` | Integer | No | `50` | Maximum number of reviews to save. |
| `max_pages` | Integer | No | `10` | Maximum number of pages to fetch. |
| `sort_by` | String | No | `informative_score desc` | Review sort order. |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": false }` | Optional proxy settings. |

Input priority:

1. `product_id`
2. `product_url`
3. Fallback to `INPUT.json` only when user input is empty

---

## Output Data

Each dataset item contains flattened review fields:

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | String | Product identifier. |
| `product_url` | String | Product page URL. |
| `product_name` | String | Product name when available. |
| `shop_name` | String | Shop name when available. |
| `review_id` | String | Review identifier. |
| `page` | Integer | Review page number. |
| `position` | Integer | Review position in collected sequence. |
| `rating` | Number | Review rating. |
| `variant_name` | String | Purchased variant label. |
| `review_text` | String | Review message content. |
| `buyer_name` | String | Reviewer display name. |
| `likes_count` | Integer | Number of likes on review. |
| `images_count` | Integer | Number of attached images. |
| `videos_count` | Integer | Number of attached videos. |
| `review_time_relative` | String | Relative review time label. |
| `review_time_iso` | String | Review timestamp in ISO format when available. |
| `sort_by` | String | Sort option used in run. |
| `source_type` | String | Input source used (`product_id`, `product_url`, `default_url`). |
| `fetched_at` | String | Data collection timestamp. |

---

## Usage Examples

### Product URL Run

```json
{
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "results_wanted": 30,
  "max_pages": 5,
  "sort_by": "create_time desc"
}
```

### Product ID Run

```json
{
  "product_id": "100018999468",
  "results_wanted": 20,
  "max_pages": 2,
  "sort_by": "informative_score desc"
}
```

### Rating-Based Sorting

```json
{
  "product_url": "https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327",
  "results_wanted": 50,
  "max_pages": 10,
  "sort_by": "rating desc"
}
```

---

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

---

## Tips for Best Results

### Start With Focused Limits
- Begin with `results_wanted` between 20 and 50 for validation.
- Increase limits only after confirming output quality.

### Use Stable Product Targets
- Use product URLs that already have visible customer reviews.
- For automation pipelines, use `product_id` for consistent targeting.

### Use Proxies for Scale
- Enable proxies for higher run stability in larger or repeated jobs.
- Combine scheduled runs with sensible pagination limits.

---

## Integrations

Connect your review dataset with:

- **Google Sheets** — Share review summaries with teams.
- **Airtable** — Build searchable product feedback databases.
- **Looker Studio / BI tools** — Visualize trends and sentiment metrics.
- **Webhooks** — Trigger downstream automations after each run.

### Export Formats

- **JSON** — For APIs and developer workflows.
- **CSV** — For spreadsheets and quick analysis.
- **Excel** — For stakeholder reporting.

---

## Frequently Asked Questions

### Why do some runs return fewer reviews than requested?
The actor stops when no more pages or reviews are available for that product and sort combination.

### Can I run with only product ID?
Yes. `product_id` is supported and takes priority when both ID and URL are provided.

### Are empty fields included in output?
No. Null and empty values are removed before saving dataset items.

### Does sorting change the review list?
Yes. Different `sort_by` options can produce different review order and selections.

### Can I schedule recurring runs?
Yes. You can schedule daily or hourly runs to track changes over time.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)

---

## Legal Notice

Use this actor responsibly and ensure compliance with Tokopedia terms and applicable laws. You are responsible for lawful and ethical data usage.
