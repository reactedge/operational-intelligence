import { PlatformSafetyPolicy, type PlatformSafetyThresholds } from "../model/platform/platform-safety-policy";
import type { PlatformSignals } from "../model/platform/types";
import type { JourneyCapacityDecision, JourneyCapacityPolicy } from "./sitemapWarmJourney";

export type PlatformCapacityPolicyOptions = {
    statusUrl: string;
    timeoutMs: number;
    retryAfterMs: number;
    thresholds: PlatformSafetyThresholds;
    fetchStatus?: () => Promise<PlatformSignals>;
};

export class PlatformCapacityPolicy implements JourneyCapacityPolicy {
    private readonly safetyPolicy: PlatformSafetyPolicy;

    constructor(
        private readonly options: PlatformCapacityPolicyOptions,
    ) {
        this.safetyPolicy = new PlatformSafetyPolicy(options.thresholds);
    }

    async evaluate(): Promise<JourneyCapacityDecision> {
        try {
            const status = this.options.fetchStatus
                ? await this.options.fetchStatus()
                : await this.fetchStatus();

            const decision = this.safetyPolicy.evaluateSignals(status);

            if (decision.allowed) {
                return { available: true };
            }

            return {
                available: false,
                retryAfterMs: this.options.retryAfterMs,
                reason: decision.reasons.join(" "),
            };
        } catch (error) {
            return {
                available: false,
                retryAfterMs: this.options.retryAfterMs,
                reason: `Platform Signals unavailable: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
    }

    private async fetchStatus(): Promise<PlatformSignals> {
        const response = await fetch(this.options.statusUrl, {
            signal: AbortSignal.timeout(this.options.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json() as PlatformSignals;
    }
}
