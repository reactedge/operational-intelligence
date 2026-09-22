import {OpenTelemetryObserver} from "../../observability/activity";
import {Operation} from "../../observability/operation";
import {PlatformSignals} from "./types";

export class PlatformSignalsClient {
    constructor(
        private readonly statusUrl: string,
        private readonly timeoutMs: number
    ) {}

    async getStatus(
        telemetry: OpenTelemetryObserver,
        parentOperation: Operation
    ): Promise<PlatformSignals> {
        const operation = telemetry.startChildOperation(
            parentOperation,
            'cache_warmer.platform_status',
            {'url.full': this.statusUrl}
        );

        try {
            const response = await fetch(
                this.statusUrl,
                {signal: AbortSignal.timeout(this.timeoutMs)}
            );

            operation.setAttribute(
                'http.response.status_code',
                response.status
            );

            if (!response.ok) {
                throw new Error(
                    `Platform Signals returned HTTP ${response.status}`
                );
            }

            const status = await response.json() as PlatformSignals;

            operation.setAttribute(
                'platform.cpu.usage_percent',
                status.signals.cpu.usagePercent
            );
            operation.setAttribute(
                'platform.memory.usage_percent',
                status.signals.memory.usagePercent
            );
            operation.setAttribute(
                'platform.disk.usage_percent',
                status.signals.disk.usagePercent
            );
            operation.succeed();

            return status;
        } catch (error) {
            operation.fail(error);
            throw error;
        }
    }
}
