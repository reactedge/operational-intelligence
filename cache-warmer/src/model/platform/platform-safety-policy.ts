import {PerformanceEntry} from "../performance/types";
import {PlatformGateDecision, PlatformSignals} from "./types";

export interface PlatformSafetyThresholds {
    maxCpuPercent: number;
    maxMemoryPercent: number;
    maxDiskPercent: number;
}

export class PlatformSafetyPolicy {
    constructor(
        private readonly thresholds: PlatformSafetyThresholds
    ) {}

    evaluate(
        batchResults: PerformanceEntry[],
        status: PlatformSignals
    ): PlatformGateDecision {
        const reasons: string[] = [];
        const failedUrls = batchResults.filter(result => !result.healthy);

        if (failedUrls.length > 0) {
            reasons.push(
                `${failedUrls.length} URL(s) in the completed batch did not return a successful response.`
            );
        }

        this.rejectAboveThreshold(
            reasons,
            'CPU',
            status.signals.cpu.usagePercent,
            this.thresholds.maxCpuPercent
        );
        this.rejectAboveThreshold(
            reasons,
            'Memory',
            status.signals.memory.usagePercent,
            this.thresholds.maxMemoryPercent
        );
        this.rejectAboveThreshold(
            reasons,
            'Disk',
            status.signals.disk.usagePercent,
            this.thresholds.maxDiskPercent
        );

        if (!status.signals.redis.connected) {
            reasons.push('Redis is not connected.');
        }

        if (!status.signals.varnish.connected) {
            reasons.push('Varnish is not connected.');
        }

        return {
            allowed: reasons.length === 0,
            reasons
        };
    }

    private rejectAboveThreshold(
        reasons: string[],
        name: string,
        actual: number,
        maximum: number
    ): void {
        if (actual > maximum) {
            reasons.push(
                `${name} usage ${actual}% exceeds ${maximum}%.`
            );
        }
    }
}
