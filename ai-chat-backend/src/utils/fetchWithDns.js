// utils/fetchWithDns.js
//
// Why this exists:
// Some network environments (corporate firewalls, ISP DNS filters) refuse
// DNS queries for certain cloud hostnames (e.g., *.qdrant.io).
// Node's native fetch/axios use the OS-level `getaddrinfo` which goes through
// the system DNS resolver — if that resolver refuses, fetch fails with
// "getaddrinfo ENOTFOUND" before any HTTP connection is made.
//
// This module provides a fetch wrapper that:
// 1. Resolves hostnames via public DNS (Google 8.8.8.8, Cloudflare 1.1.1.1)
// 2. Makes the HTTPS request to the resolved IP with correct SNI/Host header
// 3. Falls back to native fetch if custom DNS resolution also fails
//
// This is production-safe: no TLS is disabled, no certs are skipped.

const https = require("https");
const http = require("http");
const { Resolver } = require("dns");
const { URL } = require("url");

// Public DNS servers — used only when the OS DNS fails
const PUBLIC_DNS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];

// Simple in-memory DNS cache (hostname -> { ip, expiry })
const dnsCache = new Map();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve a hostname using public DNS servers.
 * Results are cached for 5 minutes.
 */
async function resolveHostname(hostname) {
    // Check cache first
    const cached = dnsCache.get(hostname);
    if (cached && cached.expiry > Date.now()) {
        return cached.ip;
    }

    return new Promise((resolve, reject) => {
        const resolver = new Resolver();
        resolver.setServers(PUBLIC_DNS);
        resolver.resolve4(hostname, (err, addresses) => {
            if (err) {
                return reject(err);
            }
            const ip = addresses[0];
            dnsCache.set(hostname, { ip, expiry: Date.now() + DNS_CACHE_TTL_MS });
            resolve(ip);
        });
    });
}

/**
 * Make an HTTPS request using a resolved IP, preserving the original
 * hostname for TLS SNI verification and the Host header.
 */
function httpsRequestWithIp(ip, originalHostname, port, path, method, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: ip,
            port: port || 443,
            path,
            method: method || "GET",
            headers: {
                ...headers,
                Host: originalHostname, // Required for virtual hosting + TLS
            },
            // SNI: TLS needs to know the real hostname for cert validation
            servername: originalHostname,
        };

        const transport = port === 80 ? http : https;

        const req = transport.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    text: async () => data,
                    json: async () => JSON.parse(data),
                });
            });
        });

        req.on("error", reject);
        req.setTimeout(15000, () => {
            req.destroy(new Error("Request timed out"));
        });

        if (body) {
            req.write(typeof body === "string" ? body : JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Drop-in replacement for fetch() that uses public DNS when the OS DNS fails.
 *
 * Usage: const response = await fetchWithDns(url, options);
 *
 * Supports: method, headers, body (same as native fetch).
 * Returns: { ok, status, statusText, headers, text(), json() }
 */
async function fetchWithDns(url, options = {}) {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const port = parsed.port
        ? parseInt(parsed.port, 10)
        : parsed.protocol === "https:" ? 443 : 80;
    const path = parsed.pathname + parsed.search;

    // Try native fetch first — this works when DNS is normal
    try {
        const nativeResult = await fetch(url, {
            method: options.method || "GET",
            headers: options.headers,
            body: options.body,
            signal: AbortSignal.timeout(15000),
        });
        return nativeResult;
    } catch (nativeErr) {
        // Only fall back to custom DNS for DNS-related errors
        const isDnsError =
            nativeErr.cause?.code === "ENOTFOUND" ||
            nativeErr.cause?.code === "EREFUSED" ||
            nativeErr.cause?.code === "EAI_AGAIN" ||
            (nativeErr.message && nativeErr.message.includes("fetch failed"));

        if (!isDnsError) {
            throw nativeErr; // Non-DNS errors should propagate normally
        }

        console.log(`[fetchWithDns] Native fetch DNS failed for ${hostname}, using public DNS fallback`);
    }

    // Fallback: resolve via public DNS, then connect to the IP directly
    const ip = await resolveHostname(hostname);
    return httpsRequestWithIp(
        ip,
        hostname,
        port,
        path,
        options.method || "GET",
        options.headers || {},
        options.body
    );
}

module.exports = { fetchWithDns, resolveHostname };
