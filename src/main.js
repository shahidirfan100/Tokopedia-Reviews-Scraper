import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Dataset, sleep } from 'crawlee';
import { Impit } from 'impit';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const TOKOPEDIA_GQL_BASE = 'https://gql.tokopedia.com/graphql';

const PRODUCT_REVIEW_LIST_QUERY =
    'query productReviewList($productID:String!,$page:Int!,$limit:Int!,$sortBy:String,$filterBy:String){productrevGetProductReviewList( productID:$productID,page:$page,limit:$limit,sortBy:$sortBy,filterBy:$filterBy,){productID list{id:feedbackID variantName message productRating reviewCreateTime reviewCreateTimestamp isReportable isAnonymous imageAttachments{attachmentID imageThumbnailUrl imageUrl}videoAttachments{attachmentID videoUrl}reviewResponse{message createTime}user{userID fullName image url}likeDislike{totalLike likeStatus}}shop{shopID name url image}hasNext totalReviews}}';
const MINI_PRODUCT_INFO_QUERY =
    'query getMiniProductInfo($productURL:String!,$userLocation:productrevUserLocation){productrevGetMiniProductInfo(productID:"",productURL:$productURL,userLocation:$userLocation){product{id name thumbnailURL originalPrice:price status stock priceFmt}shop{id name badgeURL isTokoNow}totalSoldFmt totalDiscussion}}';

const BASE_HEADERS = {
    'content-type': 'application/json',
    origin: 'https://www.tokopedia.com',
    referer: 'https://www.tokopedia.com/',
    'x-source': 'tokopedia-lite',
    'x-tkpd-lite-service': 'zeus',
    'x-device': 'mobile-0.0',
    'x-dark-mode': 'false',
};
const HTTP1_FALLBACK_HEADERS = {
    ...BASE_HEADERS,
    'user-agent':
        'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

const REVIEWS_PER_PAGE = 10;
const REQUEST_RETRIES = 4;
const RETRY_MAX_DELAY_MS = 5000;
const SEARCH_FIELDS = ['product_url', 'url', 'startUrl'];

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
        const cleaned = value.map(removeEmptyValuesDeep).filter((item) => !isBlank(item));
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

    let candidate = value.trim();
    if (!candidate) return null;

    if (!/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate.replace(/^\/+/, '')}`;
    }

    try {
        const parsed = new URL(candidate);
        if (!normalizeTokopediaHost(parsed.hostname.toLowerCase())) return null;

        let pathname = parsed.pathname || '/';
        pathname = pathname.replace(/\/review\/?$/i, '');
        pathname = pathname.replace(/\/+$/, '');

        if (!pathname || pathname === '/') return null;
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

const hasUserProvidedSearch = (input) => {
    if (!isRecord(input)) return false;

    return SEARCH_FIELDS.some((field) => !isBlank(input[field]));
};

const mergeInput = (fallbackInput, rawInput) => ({
    ...fallbackInput,
    ...Object.fromEntries(
        Object.entries(rawInput).filter(([key, value]) => !SEARCH_FIELDS.includes(key) || !isBlank(value)),
    ),
});

const loadInputFallback = async () => {
    try {
        const content = await readFile('INPUT.json', 'utf8');
        const parsed = JSON.parse(content);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const IMPIT_PROFILE_ROTATION = ['chrome', 'chrome136', 'chrome124', 'firefox133', 'ios18'];

const createHttpClient = ({ proxyConfiguration } = {}) => {
    const state = {
        profileIndex: 0,
        useHttp1Fallback: false,
        loggedHttp1Fallback: false,
        instances: new Map(),
        proxyUrl: null,
        dispatcher: null,
        loggedProxyFailure: false,
    };

    const applyProxy = (proxyUrl) => {
        state.proxyUrl = proxyUrl || null;
        state.dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null;
    };

    const refreshProxy = async () => {
        if (!proxyConfiguration) return false;

        try {
            const url = await proxyConfiguration.newUrl();
            applyProxy(url);
            return Boolean(url);
        } catch (error) {
            applyProxy(null);
            if (!state.loggedProxyFailure) {
                state.loggedProxyFailure = true;
                log.warning(`Could not obtain a proxy URL; continuing without proxy. ${error.message}`);
            }
            return false;
        }
    };

    const getInstance = (profile) => {
        const key = `${profile}::${state.proxyUrl || 'direct'}`;
        if (!state.instances.has(key)) {
            state.instances.set(
                key,
                new Impit({
                    browser: profile,
                    vanillaFallback: true,
                    ...(state.proxyUrl ? { proxyUrl: state.proxyUrl } : {}),
                }),
            );
        }
        return state.instances.get(key);
    };

    return {
        get impit() {
            return getInstance(IMPIT_PROFILE_ROTATION[state.profileIndex]);
        },
        currentProfile: () => IMPIT_PROFILE_ROTATION[state.profileIndex],
        shouldUseHttp1Fallback: () => state.useHttp1Fallback,
        activateHttp1Fallback: () => {
            state.useHttp1Fallback = true;
        },
        rotateProfile: () => {
            if (state.profileIndex >= IMPIT_PROFILE_ROTATION.length - 1) return false;
            state.profileIndex += 1;
            return true;
        },
        shouldLogHttp1Fallback: () => {
            if (state.loggedHttp1Fallback) return false;
            state.loggedHttp1Fallback = true;
            return true;
        },
        refreshProxy,
        getDispatcher: () => state.dispatcher,
        hasProxy: () => Boolean(state.proxyUrl),
    };
};

const isImpitProfileReset = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    if (message.includes('http2') && message.includes('reset')) return true;
    if (message.includes('hyper::error')) return true;
    if (message.includes('internal_error') && message.includes('http')) return true;
    return false;
};

const fetchGraphql = async ({ client, url, payload, signal, timeoutMs }) => {
    if (!client.shouldUseHttp1Fallback()) {
        while (true) {
            const profile = client.currentProfile();
            try {
                return await client.impit.fetch(url, {
                    method: 'POST',
                    headers: BASE_HEADERS,
                    body: JSON.stringify(payload),
                    signal,
                    timeout: timeoutMs,
                });
            } catch (error) {
                if (!isImpitProfileReset(error)) throw error;

                if (client.rotateProfile()) {
                    log.warning(
                        `Tokopedia reset the impit HTTP/2 stream for profile "${profile}". Retrying with "${client.currentProfile()}".`,
                    );
                    continue;
                }

                client.activateHttp1Fallback();
                if (client.shouldLogHttp1Fallback()) {
                    log.warning(
                        'Every impit browser profile was reset by Tokopedia. Switching this run to HTTP/1-compatible mobile-web requests.',
                    );
                }
                break;
            }
        }
    }

    const dispatcher = client.getDispatcher();

    return await undiciFetch(url, {
        method: 'POST',
        headers: HTTP1_FALLBACK_HEADERS,
        body: JSON.stringify(payload),
        signal,
        ...(dispatcher ? { dispatcher } : {}),
    });
};

const parseRetryAfterMs = (response) => {
    const value = response?.headers?.get?.('retry-after');
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);

    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return Math.min(Math.max(timestamp - Date.now(), 0), RETRY_MAX_DELAY_MS);

    return null;
};

const createRequestError = (message, { retryable = false, retryAfterMs = null, rotateProfile = false } = {}) => {
    const error = new Error(message);
    error.retryable = retryable;
    error.retryAfterMs = retryAfterMs;
    error.rotateProfile = rotateProfile;
    return error;
};

const isTransientNetworkError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const name = String(error?.name || '');
    const message = String(error?.message || error || '');

    return (
        ['AbortError', 'TimeoutError', 'ConnectTimeout', 'ReadTimeout', 'WriteTimeout', 'PoolTimeout'].includes(name) ||
        ['NetworkError', 'ConnectError', 'ReadError', 'WriteError', 'CloseError', 'TransportError'].includes(name) ||
        ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) ||
        /(?:timed? ?out|socket hang up|connection reset|network error)/i.test(message) ||
        isImpitProfileReset(error)
    );
};

const parseGraphqlResponse = async ({ response, endpointName }) => {
    const contentType = response?.headers?.get?.('content-type') || '';
    let body;

    try {
        body = contentType.toLowerCase().includes('json') ? await response.json() : JSON.parse(await response.text());
    } catch {
        throw createRequestError(`Endpoint ${endpointName} returned an invalid JSON response.`, {
            retryable: true,
            rotateProfile: true,
        });
    }

    const envelope = Array.isArray(body) ? body[0] : body;
    if (!isRecord(envelope)) {
        throw createRequestError(`Endpoint ${endpointName} returned an unexpected response shape.`);
    }

    if (Array.isArray(envelope.errors) && envelope.errors.length) {
        const message = envelope.errors[0]?.message || 'Unknown error';
        const retryable = /internal|server|try again|timeout|timed out|unavailable|temporar|too many|rate.?limit/i.test(
            message,
        );
        throw createRequestError(`Endpoint ${endpointName} error: ${message}`, {
            retryable,
            rotateProfile: retryable,
        });
    }

    if (!Object.hasOwn(envelope, 'data')) {
        throw createRequestError(`Endpoint ${endpointName} response is missing data.`);
    }

    return envelope.data;
};

const requestGraphql = async ({ client, endpointName, payload, timeoutMs = 45000 }) => {
    let lastError;

    for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt++) {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            const response = await fetchGraphql({
                client,
                url: `${TOKOPEDIA_GQL_BASE}/${endpointName}`,
                payload,
                signal: abortController.signal,
                timeoutMs,
            });
            const status = Number(response?.status);

            if (!Number.isInteger(status)) {
                throw createRequestError(`Endpoint ${endpointName} returned no valid HTTP status.`);
            }

            if (status === 403 || status === 429 || status >= 500) {
                throw createRequestError(`Endpoint ${endpointName} returned status ${status}.`, {
                    retryable: true,
                    rotateProfile: status === 403,
                    retryAfterMs: parseRetryAfterMs(response),
                });
            }

            if (status < 200 || status >= 300) {
                throw createRequestError(`Endpoint ${endpointName} returned status ${status}.`);
            }

            return await parseGraphqlResponse({ response, endpointName });
        } catch (error) {
            lastError = error;
            const retryable = error?.retryable ?? isTransientNetworkError(error);
            if (!retryable || attempt >= REQUEST_RETRIES) break;

            if (error?.rotateProfile && client.rotateProfile()) {
                log.warning(
                    `Endpoint ${endpointName} returned an unusable response. Retrying with impit profile "${client.currentProfile()}".`,
                );
            }

            if (client.hasProxy()) {
                await client.refreshProxy();
            }

            const exponentialDelay = 350 * 2 ** (attempt - 1);
            const jitter = Math.floor(Math.random() * 300);
            const delayMs = Math.min(error.retryAfterMs ?? exponentialDelay + jitter, RETRY_MAX_DELAY_MS);
            log.warning(
                `Retrying ${endpointName} request (${attempt}/${REQUEST_RETRIES - 1}) in ${delayMs}ms: ${error.message}`,
            );
            await sleep(delayMs);
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError;
};

const resolveProductFromUrl = async ({ client, productUrl }) => {
    const normalizedUrl = normalizeProductUrl(productUrl);
    if (!normalizedUrl) {
        throw new Error('Invalid Tokopedia product URL.');
    }

    const directId = extractProductIdFromUrl(normalizedUrl);
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
            client,
            endpointName: 'getMiniProductInfo',
            payload,
            timeoutMs: 60000,
        });

        const info = data?.productrevGetMiniProductInfo;
        if (!isRecord(info)) throw new Error('Mini product lookup returned no product information.');

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
        if (!directId) {
            throw new Error(
                `Product not found at the provided URL. Make sure it is a valid, active Tokopedia product page. (${error.message})`,
            );
        }

        log.warning(`Product details lookup failed, using the identifier parsed from the URL. ${error.message}`);
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
            resolvedViaFallback: true,
        };
    }
};

const fetchReviewsPage = async ({ client, productId, page, limit, sortBy }) => {
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

    const data = await requestGraphql({ client, endpointName: 'productReviewList', payload });
    const reviewResult = data?.productrevGetProductReviewList;
    if (!isRecord(reviewResult) || !Array.isArray(reviewResult.list)) {
        throw new Error('Review endpoint returned no review list.');
    }

    return reviewResult;
};

const normalizeReviewItem = ({ rawReview, page, position, productContext, sortBy, sourceType }) => {
    const reviewTimestampNumber = Number(rawReview?.reviewCreateTime);
    const reviewTimeIso = Number.isFinite(reviewTimestampNumber)
        ? new Date(reviewTimestampNumber * 1000).toISOString()
        : undefined;

    const imageUrls = (Array.isArray(rawReview?.imageAttachments) ? rawReview.imageAttachments : [])
        .map((image) => cleanUrl(image?.imageUrl) || cleanUrl(image?.imageThumbnailUrl))
        .filter(Boolean);

    const videoUrls = (Array.isArray(rawReview?.videoAttachments) ? rawReview.videoAttachments : [])
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
        likes_count: Number.isFinite(Number(rawReview?.likeDislike?.totalLike))
            ? Number(rawReview.likeDislike.totalLike)
            : undefined,
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
    const fallbackInput = hasUserProvidedSearch(rawInput) ? {} : await loadInputFallback();
    const input = mergeInput(fallbackInput, rawInput);
    const usingFallbackSearch = !hasUserProvidedSearch(rawInput) && hasUserProvidedSearch(fallbackInput);

    const proxyInput = input.proxyConfiguration;
    const proxyEnabled =
        isRecord(proxyInput) &&
        ((Array.isArray(proxyInput.proxyUrls) && proxyInput.proxyUrls.length > 0) || proxyInput.useApifyProxy === true);

    let proxyConfiguration;
    if (proxyEnabled) {
        try {
            proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
        } catch (error) {
            log.warning(`Proxy configuration was ignored; continuing without proxy. ${error.message}`);
        }
    }

    const client = createHttpClient({ proxyConfiguration });
    await client.refreshProxy();

    const resultsWanted = toPositiveInt(input.results_wanted, 20);
    const maxPages = toPositiveInt(input.max_pages, 5);
    const sortBy =
        typeof input.sort_by === 'string' && input.sort_by.trim() ? input.sort_by.trim() : 'informative_score desc';

    const providedProductUrl = normalizeProductUrl(input.product_url || input.url || input.startUrl || null);
    const sourceType = usingFallbackSearch ? 'default_url' : 'product_url';

    if (!providedProductUrl) {
        throw new Error('Provide a valid Tokopedia product URL.');
    }

    const productContext = await resolveProductFromUrl({
        client,
        productUrl: providedProductUrl,
    });

    if (!productContext?.productId) {
        throw new Error('Unable to determine Tokopedia product ID from the provided product URL.');
    }

    let saved = 0;
    let totalReviews = null;
    let hasNext = true;

    for (let page = 1; page <= maxPages && saved < resultsWanted && hasNext; page++) {
        let reviewResult;
        try {
            reviewResult = await fetchReviewsPage({
                client,
                productId: productContext.productId,
                page,
                limit: REVIEWS_PER_PAGE,
                sortBy,
            });
        } catch (error) {
            if (saved === 0) {
                if (productContext.resolvedViaFallback && /not found/i.test(error.message)) {
                    throw new Error('Product not found or no longer available at the provided URL.');
                }
                throw error;
            }
            log.warning(`Stopping after page ${page} failed: ${error.message}`);
            break;
        }

        const { list } = reviewResult;
        totalReviews = Number.isFinite(Number(reviewResult?.totalReviews))
            ? Number(reviewResult.totalReviews)
            : totalReviews;
        hasNext = Boolean(reviewResult?.hasNext);

        if (!list.length) {
            log.info(`No reviews returned on page ${page}. Stopping pagination.`);
            break;
        }

        const remaining = resultsWanted - saved;
        const sliced = list.slice(0, remaining);

        const mapped = sliced
            .map((review, index) =>
                normalizeReviewItem({
                    rawReview: review,
                    page,
                    position: (page - 1) * REVIEWS_PER_PAGE + index + 1,
                    productContext,
                    sortBy,
                    sourceType,
                }),
            )
            .filter(Boolean);

        if (mapped.length) {
            saved += mapped.length;
            await Dataset.pushData(mapped);
        }

        log.info(`Page ${page}: saved ${mapped.length} reviews (${saved}/${resultsWanted})`);

        if (!hasNext || saved >= resultsWanted) break;
        await sleep(650 + Math.floor(Math.random() * 500));
    }

    log.info(
        `Finished. Saved ${saved} reviews${totalReviews !== null ? ` (total available: ${totalReviews})` : ''}. Product ID: ${productContext.productId}`,
    );
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
