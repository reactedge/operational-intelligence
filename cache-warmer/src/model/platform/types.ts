export interface PlatformSignals {
    timestamp: string;
    platform: {
        hostname: string;
        environment: string;
        service: string;
        version: string;
    };
    signals: {
        cpu: {
            usagePercent: number;
        };
        memory: {
            usagePercent: number;
        };
        disk: {
            usagePercent: number;
        };
        redis: {
            connected: boolean;
        };
        varnish: {
            connected: boolean;
        };
    };
}

export interface PlatformGateDecision {
    allowed: boolean;
    reasons: string[];
}
