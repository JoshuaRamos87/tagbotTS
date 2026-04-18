import dnsPromises from 'node:dns/promises';
import dnsCallback from 'node:dns';
import { Agent } from 'undici';

/**
 * Checks if an IP address is within a private or reserved range.
 * This covers IPv4 and IPv6, including IPv4-mapped IPv6 addresses.
 */
export function isPrivateIP(ip: string): boolean {
    // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) {
        const ipv4 = ip.substring(7);
        return isPrivateIP(ipv4);
    }

    // IPv4 Private/Reserved Ranges
    const ipv4Parts = ip.split('.').map(Number);
    if (ipv4Parts.length === 4 && !ipv4Parts.some(isNaN)) {
        const [a, b, c, d] = ipv4Parts;
        
        // 10.0.0.0/8
        if (a === 10) return true;
        // 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) return true;
        // 192.168.0.0/16
        if (a === 192 && b === 168) return true;
        // 127.0.0.0/8 (Loopback)
        if (a === 127) return true;
        // 169.254.0.0/16 (Link-local)
        if (a === 169 && b === 254) return true;
        // 0.0.0.0/8 (Broadcast/Current network)
        if (a === 0) return true;
        // 100.64.0.0/10 (Shared Address Space)
        if (a === 100 && b >= 64 && b <= 127) return true;
        // 192.0.0.0/24 (IETF Protocol Assignments)
        if (a === 192 && b === 0 && c === 0) return true;
        // 192.0.2.0/24 (Documentation - TEST-NET-1)
        if (a === 192 && b === 0 && c === 2) return true;
        // 198.18.0.0/15 (Network Benchmark)
        if (a === 198 && b >= 18 && b <= 19) return true;
        // 198.51.100.0/24 (Documentation - TEST-NET-2)
        if (a === 198 && b === 51 && c === 100) return true;
        // 203.0.113.0/24 (Documentation - TEST-NET-3)
        if (a === 203 && b === 0 && c === 113) return true;
        // 224.0.0.0/4 (Multicast)
        if (a >= 224) return true;
    }

    // IPv6 Private/Reserved Ranges
    const lowerIp = ip.toLowerCase();
    if (
        lowerIp === '::1' || 
        lowerIp === '::' || 
        lowerIp.startsWith('fc00:') || 
        lowerIp.startsWith('fd00:') || 
        lowerIp.startsWith('fe80:') ||
        lowerIp.startsWith('ff00:') // Multicast
    ) {
        return true;
    }

    return false;
}

/**
 * Validates a URL to prevent SSRF.
 * Checks protocol and ensures hostname does not resolve to a private IP.
 */
export async function validateImageUrl(urlStr: string): Promise<string> {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch (e) {
        throw new Error("Invalid URL format.");
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error("Invalid protocol. Only http and https are allowed.");
    }

    const hostname = url.hostname;

    // Block common local/internal hostnames immediately
    const blockedHostnames = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];
    if (blockedHostnames.includes(hostname.toLowerCase())) {
        throw new Error("Access to local/internal addresses is prohibited.");
    }

    // Resolve ALL IPs for this hostname and check each one
    try {
        const addresses = await dnsPromises.lookup(hostname, { all: true });
        for (const addr of addresses) {
            if (isPrivateIP(addr.address)) {
                throw new Error(`Access to private/internal IP ranges is prohibited (${addr.address}).`);
            }
        }
    } catch (err: any) {
        if (err.code === 'ENOTFOUND') {
            throw new Error(`Could not resolve hostname: ${hostname}`);
        }
        throw err;
    }

    return urlStr;
}

/**
 * Custom undici agent that performs IP validation during the connection phase.
 * This protects against DNS Rebinding attacks.
 */
const safeDispatcher = new Agent({
    connect: {
        lookup: (hostname, options, callback) => {
            // @ts-ignore - options signature match
            dnsCallback.lookup(hostname, { ...options, all: true }, (err, addresses) => {
                if (err) return callback(err, []);
                
                const validatedAddresses = [];

                for (const addr of addresses) {
                    if (isPrivateIP(addr.address)) {
                        // If any resolved IP is private, we could block the whole thing or just filter it.
                        // For maximum security against DNS Rebinding where a client might fallback, 
                        // we should block if any IP is private.
                        return callback(new Error(`SSRF Blocked: Resolved to private IP ${addr.address}`), []);
                    }
                    validatedAddresses.push(addr);
                }
                
                if (validatedAddresses.length === 0) {
                    return callback(new Error(`No safe addresses found for ${hostname}`), []);
                }

                // Return the validated addresses array to undici
                callback(null, validatedAddresses);
            });
        }
    }
});

/**
 * A safe wrapper for fetch that prevents DNS rebinding and handles redirects manually.
 */
export async function safeFetch(url: string, options: RequestInit = {}, maxRedirects = 3): Promise<Response> {
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
        // Validate the URL before each fetch
        await validateImageUrl(currentUrl);

        const response = await fetch(currentUrl, {
            ...options,
            // @ts-ignore - dispatcher is a valid option in Node.js fetch
            dispatcher: safeDispatcher,
            redirect: 'manual' // We handle redirects ourselves to ensure they are validated
        });

        // Handle redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) return response;

            // Resolve relative URLs
            currentUrl = new URL(location, currentUrl).toString();
            redirectCount++;
            continue;
        }

        return response;
    }

    throw new Error("Too many redirects.");
}
