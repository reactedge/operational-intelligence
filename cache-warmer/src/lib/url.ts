import { URL } from 'url';

export const normalizeUrl = (rawUrl: string) => {
    const url = new URL(rawUrl);

    // Normalize pathname by collapsing multiple slashes
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');

    return url.toString();
}

export const validateTargetUrl = (
    rawUrl: string,
    allowedHosts: string[]
): string => {
    const normalisedUrl = normalizeUrl(rawUrl);
    const url = new URL(normalisedUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported.');
    }

    if (!allowedHosts.includes(url.hostname)) {
        throw new Error(`Host is not allowed: ${url.hostname}`);
    }

    return normalisedUrl;
}

export const sanitiseUrl = (rawUrl: string) => {
    const dummyHost = 'https://localurl.com'
    const url = new URL(`${dummyHost}${rawUrl}`);

    // Obscure each query parameter's value
    url.searchParams.forEach((value, key) => {
        url.searchParams.set(key, '***');
    });

    return `${url.pathname}${url.search}`
}
