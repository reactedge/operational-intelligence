import dotenv from 'dotenv';
dotenv.config({quiet: true});

export type Config = {
    port: number;
    frontendUrl: string;
    route: {
        servicePrefix: string;
    };
    sitemap: {
        allowedHosts: string[];
        timeoutMs: number;
    };
    cacheWarmer: {
        url: string;
        timeoutMs: number;
    };
    observability: {
        otelHost: string;
        serviceName: string;
    };
};

export const config: Config = {
    port: Number(process.env.PORT ?? '8082'),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    route: {
        servicePrefix: '/sitemap-planner'
    },
    sitemap: {
        allowedHosts: (process.env.SITEMAP_ALLOWED_HOSTS ?? 'mageosuk.reactedge.net')
            .split(',')
            .map(host => host.trim())
            .filter(Boolean),
        timeoutMs: Number(process.env.SITEMAP_TIMEOUT_MS ?? 10000)
    },
    cacheWarmer: {
        url: process.env.CACHE_WARMER_URL
            ?? 'http://localhost:8081/cache-warmer/test-urls',
        timeoutMs: Number(process.env.CACHE_WARMER_TIMEOUT_MS ?? 60000)
    },
    observability: {
        otelHost: process.env.OTEL_HOST ?? 'http://localhost:4318',
        serviceName: process.env.OTEL_SERVICE_NAME ?? 'reactedge-sitemap-planner'
    }
};
