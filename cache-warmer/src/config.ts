import dotenv from 'dotenv';
// dotenv v17 prints an injection message by default. Keep runtime output in
// OpenTelemetry by preventing the configuration loader from writing to stdout.
dotenv.config({quiet: true});
import appRoot from 'app-root-path';

export type configInfo = {
    port: number;
    frontendUrl: string;
    /** Read-only folder for versioned prompts and other operational artefacts. */
    cdnFolder: string,
    route: {
        cacheWarmerPrefix: string;
    },
    cacheWarmer: {
        allowedHosts: string[];
    },
    platformSignals: {
        statusUrl: string;
        timeoutMs: number;
        maxCpuPercent: number;
        maxMemoryPercent: number;
        maxDiskPercent: number;
    },
    rootDir: string;
    observability: {
        otelHost: string;
        serviceName: string;
    },
    openai: {
        model: string;
        performance: number;
        apiKey: string;
    }
}

export const config: configInfo = {
    port: (process.env.PORT === undefined) ? 8081 : Number(process.env.PORT),

    frontendUrl: (process.env.FRONTEND_URL === undefined) ? 'http://localhost:3001' : process.env.FRONTEND_URL,
    cdnFolder: (process.env.CDN_FOLDER === undefined) ? 'csv_export' : process.env.CDN_FOLDER,

    /**
     * Routes access
     */
    route: {
        cacheWarmerPrefix: '/cache-warmer'
    },
    cacheWarmer: {
        allowedHosts: (
            process.env.CACHE_WARMER_ALLOWED_HOSTS
            ?? 'mageosuk.reactedge.net'
        )
            .split(',')
            .map(host => host.trim())
            .filter(Boolean)
    },
    platformSignals: {
        statusUrl: process.env.PLATFORM_SIGNALS_STATUS_URL
            ?? 'http://127.0.0.1:8000/status',
        timeoutMs: Number(process.env.PLATFORM_SIGNALS_TIMEOUT_MS ?? 5000),
        maxCpuPercent: Number(process.env.PLATFORM_MAX_CPU_PERCENT ?? 85),
        maxMemoryPercent: Number(process.env.PLATFORM_MAX_MEMORY_PERCENT ?? 85),
        maxDiskPercent: Number(process.env.PLATFORM_MAX_DISK_PERCENT ?? 90)
    },
    rootDir: appRoot.resolve('/'),
    observability: {
        otelHost: (process.env.OTEL_HOST === undefined) ? 'http://localhost:4318' : process.env.OTEL_HOST,
        serviceName: (process.env.OTEL_CACHE_WARMER_SERVICE === undefined) ? 'reactedge-cache-warmer' : process.env.OTEL_CACHE_WARMER_SERVICE,
    },
    openai: {
        model: (process.env.OPENAI_MODEL === undefined) ? 'gpt-4o-mini' : process.env.OPENAI_MODEL,
        performance: Number(process.env.OPENAI_PERFORMANCE ?? 0.2),
        apiKey: (process.env.OPENAI_API_KEY === undefined) ? 'rrfdf' : process.env.OPENAI_API_KEY
    }
}
