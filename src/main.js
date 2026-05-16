import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Dataset, sleep } from 'crawlee';
import { gotScraping } from 'got-scraping';

const TOKOPEDIA_GQL_BASE = 'https://gql.tokopedia.com/graphql';
const DEFAULT_PRODUCT_URL = 'https://www.tokopedia.com/toko-hijab-jasmine/pashmina-kaos-bahan-cotton-rayon-bahan-adem-ringan-dan-lembut-pashmina-kaos-jasmine-1729666273262209327';

const PRODUCT_REVIEW_LIST_QUERY = 'query productReviewList($productID:String!,$page:Int!,$limit:Int!,$sortBy:String,$filterBy:String){productrevGetProductReviewList( productID:$productID,page:$page,limit:$limit,sortBy:$sortBy,filterBy:$filterBy,){productID list{id:feedbackID variantName message productRating reviewCreateTime reviewCreateTimestamp isReportable isAnonymous imageAttachments{attachmentID imageThumbnailUrl imageUrl}videoAttachments{attachmentID videoUrl}reviewResponse{message createTime}user{userID fullName image url}likeDislike{totalLike likeStatus}}shop{shopID name url image}hasNext totalReviews}}';
const MINI_PRODUCT_INFO_QUERY = 'query getMiniProductInfo($productURL:String!,$userLocation:productrevUserLocation){productrevGetMiniProductInfo(productID:"",productURL:$productURL,userLocation:$userLocation){product{id name thumbnailURL originalPrice:price status stock priceFmt}shop{id name badgeURL isTokoNow}totalSoldFmt totalDiscussion}}';

const BASE_HEADERS = {
    accept: '*/*',
    'content-type': 'application/json',
    origin: 'https://www.tokopedia.com',
    referer: 'https://www.tokopedia.com/',
    'x-source': 'tokopedia-lite',
    'x-tkpd-lite-service': 'zeus',
    'x-device': 'desktop-0.0',
    'x-dark-mode': 'false',
};

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const REVIEWS_PER_PAGE = 10;

await Actor.init();

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isBlank = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (isRecord(value) && Object.keys(value).length === 0) return true;
    return false;
};

const removeEmptyValuesDeep = (value) => {
    if (Array.isArray(value)) {
        const cleaned = value
            .map(removeEmptyValuesDeep)
            .filter((item) => !isBlank(item));
        return cleaned.length ? cleaned : undefined;
    }

    if (isRecord(value)) {
        const entries = Object.entries(value)
            .map(([key, nested]) => [key, removeEmptyValuesDeep(nested)])
            .filter(([, nested]) => !isBlank(nested));
        return entries.length ? Object.fromEntries(entries) : undefined;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }

    return value;
};

const toPositiveInt = (value, fallback) => {
    const num = Number.parseInt(String(value), 10);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

const cleanUrl = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
        return new URL(value, 'https://www.tokopedia.com').href;
    } catch {
        return null;
    }
};

const normalizeTokopediaHost = (hostname) => hostname === 'tokopedia.com' || hostname.endsWith('.tokopedia.com');

const normalizeProductUrl = (value) => {
    if (!value || typeof value !== 'string') return null;

    try {
        const parsed = new URL(value, 'https://www.tokopedia.com');
        if (!normalizeTokopediaHost(parsed.hostname)) return null;

        let pathname = parsed.pathname || '/';
        pathname = pathname.replace(/\/review\/?$/i, '');
        pathname = pathname.replace(/\/+$/, '');

        if (!pathname || pathname === '') return null;
        return `${parsed.origin}${pathname}`;
    } catch {
        return null;
    }
};

const extractProductIdFromUrl = (productUrl) => {
    if (!productUrl) return null;

    try {
        const parsed = new URL(productUrl);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const source = segments.join('-');
        const matches = source.match(/\d{8,}/g);
        if (!matches || !matches.length) return null;
        return matches[matches.length - 1];
    } catch {
        return null;
    }
};

const hasUserProvidedValues = (input) => {
    if (!isRecord(input)) return false;

    return Object.values(input).some((value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (Array.isArray(value)) return value.length > 0;
        if (isRecord(value)) return Object.keys(value).length > 0;
        return true;
    });
};

const loadInputFallback = async () => {
    try {
        const content = await readFile('INPUT.json', 'utf8');
        const parsed = JSON.parse(content);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const requestGraphql = async ({ endpointName, payload, proxyUrl, timeoutMs = 45000 }) => {
    let lastError;

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const response = await gotScraping({
                url: `${TOKOPEDIA_GQL_BASE}/${endpointName}`,
                method: 'POST',
                headers: {
                    ...BASE_HEADERS,
                    'user-agent': DEFAULT_USER_AGENT,
                },
                proxyUrl,
                retry: { limit: 0 },
                timeout: { request: timeoutMs },
                http2: false,
                responseType: 'json',
                body: JSON.stringify(payload),
                throwHttpErrors: false,
            });

            if (response.statusCode >= 400) {
                throw new Error(`Endpoint ${endpointName} returned status ${response.statusCode}`);
            }

            const { body } = response;
            if (Array.isArray(body)) {
                if (body[0]?.errors?.length) {
                    throw new Error(`Endpoint ${endpointName} error: ${body[0].errors[0]?.message || 'Unknown error'}`);
                }
                return body[0]?.data ?? null;
            }

            if (body?.errors?.length) {
                throw new Error(`Endpoint ${endpointName} error: ${body.errors[0]?.message || 'Unknown error'}`);
            }

            return body?.data ?? null;
        } catch (error) {
            lastError = error;
            if (attempt >= 4) break;
            await sleep(500 * attempt + Math.floor(Math.random() * 400));
        }
    }

    throw lastError;
};

const resolveProductFromUrl = async ({ productUrl, proxyConfiguration }) => {
    const normalizedUrl = normalizeProductUrl(productUrl);
    if (!normalizedUrl) {
        throw new Error('Invalid Tokopedia product URL.');
    }

    const directId = extractProductIdFromUrl(normalizedUrl);
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl('tokopedia-mini-product') : undefined;

    try {
        const payload = {
            operationName: 'getMiniProductInfo',
            variables: {
                productURL: normalizedUrl,
                userLocation: null,
            },
            query: MINI_PRODUCT_INFO_QUERY,
        };

        const data = await requestGraphql({
            endpointName: 'getMiniProductInfo',
            payload,
            proxyUrl,
            timeoutMs: 60000,
        });

        const info = data?.productrevGetMiniProductInfo;
        const resolvedId = String(info?.product?.id || '') || directId;
        if (!resolvedId) {
            throw new Error('Could not resolve product ID from Tokopedia product URL.');
        }

        return {
            productId: resolvedId,
            productUrl: normalizedUrl,
            productName: info?.product?.name || null,
            shopId: String(info?.shop?.id || '') || null,
            shopName: info?.shop?.name || null,
            productStatus: info?.product?.status || null,
            productPrice: info?.product?.priceFmt || null,
            totalSoldFmt: info?.totalSoldFmt || null,
            totalDiscussion: Number.isFinite(Number(info?.totalDiscussion)) ? Number(info.totalDiscussion) : null,
        };
    } catch (error) {
        if (!directId) throw error;

        log.warning(`Mini product lookup failed, using product ID parsed from URL. ${error.message}`);
        return {
            productId: directId,
            productUrl: normalizedUrl,
            productName: null,
            shopId: null,
            shopName: null,
            productStatus: null,
            productPrice: null,
            totalSoldFmt: null,
            totalDiscussion: null,
        };
    }
};

const fetchReviewsPage = async ({ productId, page, limit, sortBy, proxyConfiguration }) => {
    const payload = {
        operationName: 'productReviewList',
        variables: {
            productID: productId,
            page,
            limit,
            sortBy,
            filterBy: 'all',
        },
        query: PRODUCT_REVIEW_LIST_QUERY,
    };

    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(`tokopedia-review-${page}`) : undefined;
    const data = await requestGraphql({ endpointName: 'productReviewList', payload, proxyUrl });
    return data?.productrevGetProductReviewList || null;
};

const normalizeReviewItem = ({ rawReview, page, position, productContext, sortBy, sourceType }) => {
    const reviewTimestampNumber = Number(rawReview?.reviewCreateTime);
    const reviewTimeIso = Number.isFinite(reviewTimestampNumber)
        ? new Date(reviewTimestampNumber * 1000).toISOString()
        : undefined;

    const imageUrls = (rawReview?.imageAttachments || [])
        .map((image) => cleanUrl(image?.imageUrl) || cleanUrl(image?.imageThumbnailUrl))
        .filter(Boolean);

    const videoUrls = (rawReview?.videoAttachments || [])
        .map((video) => cleanUrl(video?.videoUrl))
        .filter(Boolean);

    const out = {
        product_id: productContext.productId,
        product_url: productContext.productUrl,
        product_name: productContext.productName,
        shop_id: productContext.shopId,
        shop_name: productContext.shopName,
        product_status: productContext.productStatus,
        product_price: productContext.productPrice,
        product_total_sold: productContext.totalSoldFmt,
        product_total_discussion: productContext.totalDiscussion,
        source_type: sourceType,
        review_id: rawReview?.id,
        page,
        position,
        variant_name: rawReview?.variantName,
        rating: Number.isFinite(Number(rawReview?.productRating)) ? Number(rawReview?.productRating) : undefined,
        review_text: rawReview?.message,
        review_time_unix: rawReview?.reviewCreateTime,
        review_time_iso: reviewTimeIso,
        review_time_relative: rawReview?.reviewCreateTimestamp,
        buyer_id: rawReview?.user?.userID,
        buyer_name: rawReview?.user?.fullName,
        buyer_profile_url: cleanUrl(rawReview?.user?.url),
        is_anonymous: rawReview?.isAnonymous,
        is_reportable: rawReview?.isReportable,
        likes_count: Number.isFinite(Number(rawReview?.likeDislike?.totalLike)) ? Number(rawReview.likeDislike.totalLike) : undefined,
        images_count: imageUrls.length,
        videos_count: videoUrls.length,
        image_urls: imageUrls,
        video_urls: videoUrls,
        seller_reply_text: rawReview?.reviewResponse?.message,
        seller_reply_time: rawReview?.reviewResponse?.createTime,
        sort_by: sortBy,
        fetched_at: new Date().toISOString(),
    };

    return removeEmptyValuesDeep(out);
};

let runError = null;

try {
    const rawInput = (await Actor.getInput()) || {};
    const fallbackInput = hasUserProvidedValues(rawInput) ? {} : await loadInputFallback();
    const input = {
        ...fallbackInput,
        ...rawInput,
    };

    const proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration(input.proxyConfiguration)
        : undefined;

    const resultsWanted = toPositiveInt(input.results_wanted, 50);
    const maxPages = toPositiveInt(input.max_pages, 10);
    const sortBy = typeof input.sort_by === 'string' && input.sort_by.trim()
        ? input.sort_by.trim()
        : 'informative_score desc';

    const providedProductId = String(input.product_id || '').trim();
    const providedProductUrl = normalizeProductUrl(input.product_url || input.url || input.startUrl || null);

    let sourceType = 'default_url';
    if (providedProductId) sourceType = 'product_id';
    else if (providedProductUrl) sourceType = 'product_url';

    let productContext;

    if (providedProductId) {
        productContext = {
            productId: providedProductId,
            productUrl: providedProductUrl || null,
            productName: null,
            shopId: null,
            shopName: null,
            productStatus: null,
            productPrice: null,
            totalSoldFmt: null,
            totalDiscussion: null,
        };
    } else {
        productContext = await resolveProductFromUrl({
            productUrl: providedProductUrl || DEFAULT_PRODUCT_URL,
            proxyConfiguration,
        });
    }

    if (!productContext?.productId) {
        throw new Error('Unable to determine Tokopedia product ID from the provided input.');
    }

    if (!productContext.productUrl && productContext.productId) {
        log.warning('Product URL is unavailable. Reviews will still be scraped using product ID.');
    }

    let saved = 0;
    let totalReviews = null;
    let hasNext = true;

    for (let page = 1; page <= maxPages && saved < resultsWanted && hasNext; page++) {
        const reviewResult = await fetchReviewsPage({
            productId: productContext.productId,
            page,
            limit: REVIEWS_PER_PAGE,
            sortBy,
            proxyConfiguration,
        });

        const list = Array.isArray(reviewResult?.list) ? reviewResult.list : [];
        totalReviews = Number.isFinite(Number(reviewResult?.totalReviews)) ? Number(reviewResult.totalReviews) : totalReviews;
        hasNext = Boolean(reviewResult?.hasNext);

        if (!list.length) {
            log.info(`No reviews returned on page ${page}. Stopping pagination.`);
            break;
        }

        const remaining = resultsWanted - saved;
        const sliced = list.slice(0, remaining);

        const mapped = sliced
            .map((review, index) => normalizeReviewItem({
                rawReview: review,
                page,
                position: ((page - 1) * REVIEWS_PER_PAGE) + index + 1,
                productContext,
                sortBy,
                sourceType,
            }))
            .filter(Boolean);

        if (mapped.length) {
            saved += mapped.length;
            await Dataset.pushData(mapped);
        }

        log.info(`Page ${page}: saved ${mapped.length} reviews (${saved}/${resultsWanted})`);

        if (!hasNext || saved >= resultsWanted) break;
        await sleep(650 + Math.floor(Math.random() * 500));
    }

    log.info(`Finished. Saved ${saved} reviews${totalReviews !== null ? ` (total available: ${totalReviews})` : ''}. Product ID: ${productContext.productId}`);
} catch (error) {
    runError = error;
    log.exception(error, 'Run failed.');
} finally {
    if (runError) {
        await Actor.fail(runError.message);
    } else {
        await Actor.exit();
    }
}
