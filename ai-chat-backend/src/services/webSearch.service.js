/**
 * webSearch.service.js
 *
 * Web search + page fetch for RAG context injection.
 * Results are shaped for prompt assembly — never injected directly into messages array.
 *
 * Environment variables:
 *   SERPER_API_KEY         required — service returns null gracefully if absent
 *   SERPER_URL             optional — default: https://google.serper.dev/search
 *   SCRAPE_DO_TOKEN        required for page fetching
 *   SCRAPE_DO_URL          optional — default: https://api.scrape.do
 *   WEB_SEARCH_ENABLED     optional — default true; set 'false' to disable globally
 *   WEB_SEARCH_MAX_CHARS   optional — default 8000
 *   WEB_SEARCH_THRESHOLD   optional — default 0.25 (relevance score floor, 0–1)
 */
'use strict';

const crypto = require('crypto');
const logger = require('../config/logger');
const cache = require('../config/webSearchCache');
const { generateEmbedding } = require('./embeddings.service');

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_URL = process.env.SERPER_URL
    || 'https://google.serper.dev/search';
const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN;
const SCRAPE_DO_URL = process.env.SCRAPE_DO_URL
    || 'https://api.scrape.do';
const WEB_SEARCH_ENABLED = process.env.WEB_SEARCH_ENABLED !== 'false';
const MAX_CHARS = parseInt(process.env.WEB_SEARCH_MAX_CHARS, 10) || 8000;
const RELEVANCE_THRESHOLD = parseFloat(process.env.WEB_SEARCH_THRESHOLD) || 0.25;
const SEARCH_RESULT_LIMIT = 5;
const MAX_URLS_TO_FETCH = 2;

logger.info('[webSearch] scrape.do config', {
    tokenSet: !!SCRAPE_DO_TOKEN,
    tokenLength: SCRAPE_DO_TOKEN ? SCRAPE_DO_TOKEN.length : 0,
    scrapeDoUrl: SCRAPE_DO_URL,
});

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Cosine similarity between two numeric arrays.
 * Returns a value in [-1, 1]. Returns 0 if either vector has zero magnitude.
 */
function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Jaccard keyword overlap: fraction of query tokens found in text.
 * Tokens are lowercase alphanumeric strings longer than 3 characters.
 * Returns value in [0, 1].
 */
function keywordScore(query, text) {
    const tokenize = (s) =>
        s.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length > 3);
    const qTokens = new Set(tokenize(query));
    const tTokens = new Set(tokenize(text));
    if (qTokens.size === 0) return 0;
    let overlap = 0;
    for (const t of qTokens) { if (tTokens.has(t)) overlap++; }
    return overlap / qTokens.size;
}

/**
 * Scores a search result against the query.
 * 60% cosine similarity + 40% keyword overlap.
 * Falls back to keyword-only if embedding call fails — never throws.
 */
async function scoreResult(query, snippet, queryEmbedding) {
    const kw = keywordScore(query, snippet);
    if (!queryEmbedding || !snippet) return kw;
    try {
        const snippetEmbedding = await generateEmbedding(snippet);
        const sim = Math.max(0, cosineSimilarity(queryEmbedding, snippetEmbedding));
        return 0.6 * sim + 0.4 * kw;
    } catch (err) {
        logger.warn('[webSearch] Snippet embedding failed, using keyword score only', {
            error: err.message,
        });
        return kw;
    }
}

/**
 * Fetches and cleans a single web page via scrape.do.
 * Checks content cache first. Enforces MAX_CHARS size guard.
 * Returns null on ANY failure — never throws.
 */
async function fetchPage(url) {
    const cached = cache.getContent(url);
    if (cached) {
        logger.debug('[webSearch] Content cache hit', { url });
        return cached;
    }

    // Skip domains that never return useful article content
    const SKIP_DOMAINS = [
        'youtube.com', 'youtu.be',
        'instagram.com', 'facebook.com',
        'tiktok.com', 'reddit.com',
    ];

    const urlHostname = (() => {
        try { return new URL(url).hostname.replace('www.', ''); }
        catch { return ''; }
    })();

    if (SKIP_DOMAINS.some((d) => urlHostname.endsWith(d))) {
        logger.debug('[webSearch] Skipping non-article domain', { url, hostname: urlHostname });
        return null;
    }

    try {
        // Build scrape.do URL with token auth
        const scrapeUrl = new URL(SCRAPE_DO_URL);
        scrapeUrl.searchParams.set('url', url);
        scrapeUrl.searchParams.set('token', SCRAPE_DO_TOKEN);
        scrapeUrl.searchParams.set('render', 'true');  // enable JS rendering for dynamic pages
        // Tell scrape.do to wait up to 25 seconds for JS rendering
        scrapeUrl.searchParams.set('timeout', '25000');

        logger.debug('[webSearch] scrape.do request URL', {
            fullUrl: scrapeUrl.toString(),
        });

        const res = await fetch(scrapeUrl.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BraynAI/1.0)',
                Accept: 'text/html',
            },
            // Node must wait longer than scrape.do's own timeout
            signal: AbortSignal.timeout(35000),
        });

        if (!res.ok) {
            logger.warn('[webSearch] Non-OK page response from scrape.do', { url, status: res.status });
            return null;
        }

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html') && !ct.includes('text/plain')) {
            logger.debug('[webSearch] Skipping non-text content', { url, ct });
            return null;
        }

        const html = await res.text();
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
            .replace(/<header[\s\S]*?<\/header>/gi, ' ')
            .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
            .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
            .replace(/<menu[\s\S]*?<\/menu>/gi, ' ')
            .replace(/<form[\s\S]*?<\/form>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .slice(0, MAX_CHARS);  // ← size guard

        cache.setContent(url, text);
        return text;
    } catch (err) {
        logger.warn('[webSearch] scrape.do fetch failed', {
            url,
            errorName: err.name,
            errorMessage: err.message,
            errorCode: err.code || null,
            isTmeout: err.name === 'TimeoutError' || err.name === 'AbortError',
        });
        return null;
    }
}

/**
 * Search the web and fetch relevant page content for RAG injection.
 *
 * Returns { snippets[], pages[] } or null.
 * Never throws — all errors are isolated and logged.
 *
 * @param {string} query
 * @returns {Promise<{ snippets: Array, pages: Array } | null>}
 */
async function searchAndFetch(query) {
    // Step 1 — Global disable guard
    if (!WEB_SEARCH_ENABLED) {
        logger.debug('[webSearch] Disabled via WEB_SEARCH_ENABLED env var');
        return null;
    }

    // Step 2 — API key guard
    if (!SERPER_API_KEY) {
        logger.warn('[webSearch] SERPER_API_KEY not set — web search skipped');
        return null;
    }

    // Step 3 — Query cache check
    let results = cache.getQuery(query);

    if (results) {
        logger.debug('[webSearch] Query cache hit', { query });
    } else {
        // Step 4 — Call Serper Search API
        try {
            const res = await fetch(SERPER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': SERPER_API_KEY,
                },
                body: JSON.stringify({
                    q: query,
                    num: SEARCH_RESULT_LIMIT,
                }),
                signal: AbortSignal.timeout(6000),
            });

            if (!res.ok) {
                logger.error('[webSearch] Serper Search API error', { status: res.status });
                return null;
            }

            const data = await res.json();
            results = (data?.organic || []).map((r) => ({
                title: r.title || '',
                url: r.link || '',
                snippet: r.snippet || '',
            }));

            // Step 5 — Cache the results
            cache.setQuery(query, results);
            logger.info('[webSearch] Serper search completed', {
                query,
                resultCount: results.length,
                cacheStats: cache.stats(),
            });
        } catch (err) {
            logger.error('[webSearch] Serper Search request failed', { error: err.message });
            return null;
        }
    }

    if (!results || results.length === 0) return null;

    // Step 6 — Compute query embedding ONCE (reused across all snippet scorings)
    let queryEmbedding = null;
    try {
        queryEmbedding = await generateEmbedding(query);
    } catch (err) {
        logger.warn('[webSearch] Query embedding failed, using keyword scoring only', {
            error: err.message,
        });
    }

    // Step 7 — Score all results in parallel, then filter
    const scored = await Promise.all(
        results.map(async (r) => ({
            ...r,
            score: await scoreResult(query, r.snippet, queryEmbedding),
        }))
    );

    const filtered = scored
        .filter((r) => r.score >= RELEVANCE_THRESHOLD)
        .sort((a, b) => b.score - a.score);

    logger.debug('[webSearch] Relevance filter complete', {
        total: scored.length,
        passed: filtered.length,
        threshold: RELEVANCE_THRESHOLD,
    });

    // Step 8 — If nothing passed the filter, return raw top snippets as fallback
    if (filtered.length === 0) {
        logger.info('[webSearch] No results passed relevance threshold', { query });
        return { snippets: results.slice(0, 3), pages: [] };
    }

    // Step 9 — Parallel fetch of top URLs
    const topUrls = filtered.slice(0, MAX_URLS_TO_FETCH).map((r) => r.url);
    const fetchedContents = await Promise.all(topUrls.map(fetchPage));

    // Step 10 — Deduplicate by content hash
    const seenHashes = new Set();
    const pages = [];

    for (let i = 0; i < topUrls.length; i++) {
        const content = fetchedContents[i];
        if (!content) {
            logger.debug('[webSearch] Skipping null fetch result', { url: topUrls[i] });
            continue;
        }
        const hash = sha256(content);
        if (seenHashes.has(hash)) {
            logger.debug('[webSearch] Duplicate content, skipping', { url: topUrls[i] });
            continue;
        }
        seenHashes.add(hash);
        pages.push({ url: topUrls[i], content });
    }

    logger.info('[webSearch] searchAndFetch complete', {
        query,
        snippetCount: filtered.length,
        pagesFetched: pages.length,
    });

    return {
        snippets: filtered.map(({ title, url, snippet }) => ({ title, url, snippet })),
        pages,
    };
}

module.exports = { searchAndFetch };
